import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { agentScheduleSlots, agentSchedules } from "@/db/agent-schema";
import { defaultProfile } from "@/lib/agents/profile";
import { SCHEDULE_RULES } from "@/lib/agents/schedule";
import type { AgentId, AgentRun, RunStatus, UserProfile } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { runDueSchedules, scheduleStatus } from "@/server/agents/scheduler";
import { workspaceStore } from "@/server/agents/store";
import { PostgresWorkspaceStore } from "@/server/agents/store/postgres";
import { ensureSession } from "@/server/services/state";

/**
 * Background checks outside the open tab (PostgreSQL): the schedule is
 * derived from the profile, claims are leased, a slot runs once, a partial
 * run is retried a bounded number of times, a paused workspace is left alone,
 * and the state survives a new store instance (a restart).
 */

// The store stamps the schedule with the real clock, so the scheduler clock starts just after it.
const T0 = new Date(Date.now() + 60_000);
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

async function workspace(patch: (profile: UserProfile) => void = () => undefined) {
  const { id } = await ensureSession();
  const profile = defaultProfile("cardiology", new Date(T0.getTime() - 86_400_000).toISOString());
  profile.lastVisitAt = new Date(T0.getTime() - 3_600_000).toISOString();
  profile.interests.topics = ["hf"];
  patch(profile);
  await workspaceStore().saveProfile(id, profile);
  return id;
}

/** A fake agent run that behaves like executeRun: it stamps lastRunAt in the stored profile. */
function fakeRunner(status: (agentId: AgentId, attempt: number) => RunStatus, clock: () => Date) {
  const calls: Array<{ sessionId: string; agentId: AgentId }> = [];
  const attempts = new Map<string, number>();
  const run = async (sessionId: string, specialty: SpecialtyId, agentId: AgentId) => {
    calls.push({ sessionId, agentId });
    const attempt = (attempts.get(`${sessionId}:${agentId}`) ?? 0) + 1;
    attempts.set(`${sessionId}:${agentId}`, attempt);
    const store = workspaceStore();
    const profile = (await store.getProfile(sessionId, specialty))!;
    profile.subscriptions[agentId] = { ...profile.subscriptions[agentId], lastRunAt: clock().toISOString() };
    await store.saveProfile(sessionId, profile);
    return { run: { id: `run-${crypto.randomUUID()}`, status: status(agentId, attempt), error: null } as unknown as AgentRun };
  };
  return Object.assign(run, { calls });
}

const mine = (sessionId: string, calls: Array<{ sessionId: string; agentId: AgentId }>) => calls.filter(call => call.sessionId === sessionId).map(call => call.agentId).sort();

describe("background scheduler (PostgreSQL)", () => {
  it("derives the schedule from the profile and runs every due background agent once", async () => {
    const id = await workspace();
    const [row] = await db.select().from(agentSchedules).where(eq(agentSchedules.sessionId, id));
    expect(row?.nextCheckAt).not.toBeNull();
    const clock = () => at(0);
    const runner = fakeRunner(() => "completed", clock);
    const report = await runDueSchedules({ run: runner, now: clock, limit: 200 });
    expect(report.claimed).toBeGreaterThan(0);
    expect(mine(id, runner.calls)).toEqual(["drugs", "events", "guidelines", "learning", "whats_new"]);
    // On-demand agents never run in the background.
    expect(mine(id, runner.calls)).not.toContain("research");
    const status = await scheduleStatus(id, "cardiology");
    expect(status?.background).toBe("on");
    expect(new Date(status!.nextCheckAt!).getTime()).toBeGreaterThan(at(0).getTime());
    expect(status?.recent.every(slot => slot.status === "completed")).toBe(true);
  });

  it("overlapping invocations never run the same slot twice", async () => {
    const id = await workspace();
    const clock = () => at(1);
    const runner = fakeRunner(() => "completed", clock);
    await Promise.all([runDueSchedules({ run: runner, now: clock, limit: 200 }), runDueSchedules({ run: runner, now: clock, limit: 200 })]);
    const calls = mine(id, runner.calls);
    expect(calls).toEqual([...new Set(calls)]);
    expect(calls).toHaveLength(5);
  });

  it("a partial run is retried after the delay, at most the configured number of attempts", async () => {
    const id = await workspace();
    let now = at(2);
    const clock = () => now;
    const runner = fakeRunner(agentId => (agentId === "drugs" ? "partial" : "completed"), clock);
    await runDueSchedules({ run: runner, now: clock, limit: 200 });
    expect(mine(id, runner.calls).filter(agentId => agentId === "drugs")).toHaveLength(1);
    // Too early: nothing is claimed for this workspace.
    now = at(30);
    await runDueSchedules({ run: runner, now: clock, limit: 200 });
    expect(mine(id, runner.calls).filter(agentId => agentId === "drugs")).toHaveLength(1);
    for (let index = 1; index <= SCHEDULE_RULES.maxAttempts + 1; index += 1) {
      now = new Date(at(2).getTime() + index * (SCHEDULE_RULES.retryAfterMs + 60_000));
      await runDueSchedules({ run: runner, now: clock, limit: 200 });
    }
    // The first run + bounded retries; other agents ran once (their slot completed).
    expect(mine(id, runner.calls).filter(agentId => agentId === "drugs")).toHaveLength(SCHEDULE_RULES.maxAttempts);
    const [slot] = await db.select().from(agentScheduleSlots).where(and(eq(agentScheduleSlots.sessionId, id), eq(agentScheduleSlots.agentId, "drugs")));
    expect(slot).toMatchObject({ status: "partial", attempts: SCHEDULE_RULES.maxAttempts });
  });

  it("a paused workspace is not checked; resuming re-arms it", async () => {
    const id = await workspace(profile => { profile.backgroundPaused = true; });
    const clock = () => at(3);
    const runner = fakeRunner(() => "completed", clock);
    await runDueSchedules({ run: runner, now: clock, limit: 200 });
    expect(mine(id, runner.calls)).toEqual([]);
    expect((await scheduleStatus(id, "cardiology"))?.background).toBe("paused");
    const store = workspaceStore();
    const profile = (await store.getProfile(id, "cardiology"))!;
    profile.backgroundPaused = false;
    await store.saveProfile(id, profile);
    await runDueSchedules({ run: runner, now: clock, limit: 200 });
    expect(mine(id, runner.calls).length).toBeGreaterThan(0);
  });

  it("state survives a restart: a fresh store instance sees the same schedule and history", async () => {
    const id = await workspace();
    const clock = () => at(4);
    await runDueSchedules({ run: fakeRunner(() => "completed", clock), now: clock, limit: 200 });
    const fresh = new PostgresWorkspaceStore();
    const profile = await fresh.getProfile(id, "cardiology");
    expect(profile?.subscriptions.whats_new.lastRunAt).toBe(at(4).toISOString());
    const status = await scheduleStatus(id, "cardiology");
    expect(status?.recent.length).toBeGreaterThan(0);
    // Nothing is due right after the run: a restart does not create new runs.
    const runner = fakeRunner(() => "completed", clock);
    await runDueSchedules({ run: runner, now: () => at(5), limit: 200 });
    expect(mine(id, runner.calls)).toEqual([]);
  });
});

afterAll(async () => {
  await pool.end();
});
