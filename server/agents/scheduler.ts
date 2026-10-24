import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agentProfiles, agentScheduleSlots, agentSchedules } from "@/db/agent-schema";
import { normalizeProfile } from "@/lib/agents/profile";
import { dueAgents, nextCheckAt, SCHEDULE_RULES, slotFor } from "@/lib/agents/schedule";
import type { AgentId, AgentRun, RunStatus } from "@/lib/agents/types";
import { isSpecialty } from "@/lib/specialty";
import type { SpecialtyId } from "@/lib/domain/types";

/**
 * Background scheduler: runs due monitoring agents outside any open tab.
 *
 *   cron (app/api/cron/agents) → claim due workspaces with a lease (SKIP LOCKED)
 *     → per due agent: open its slot in the ledger (idempotent) → run → close the slot
 *     → re-arm the workspace (next due time, or a bounded retry after a partial run)
 *
 * Requires PostgreSQL. Without it there is no background: agents catch up when
 * the physician opens the portal, and Settings says so.
 */

export type ScheduledRun = (sessionId: string, specialty: SpecialtyId, agentId: AgentId) => Promise<{ run: AgentRun }>;

export interface ScheduleReport {
  claimed: number;
  ran: number;
  completed: number;
  partial: number;
  failed: number;
  /** Slots already done or exhausted (another invocation, or the retry budget). */
  skipped: number;
  /** Workspaces left for the next invocation because the time budget ran out. */
  deferred: number;
  durationMs: number;
}

type SlotOutcome = "completed" | "partial" | "failed";

function outcomeOf(status: RunStatus): SlotOutcome {
  if (status === "completed" || status === "blocked") return "completed";
  if (status === "partial") return "partial";
  return "failed";
}

/** Claims up to `limit` due workspaces; a claim is a lease, released by expiry if the invocation dies. */
export async function claimDueWorkspaces(now: Date, limit: number): Promise<Array<{ sessionId: string; specialty: SpecialtyId }>> {
  const leaseUntil = new Date(now.getTime() + SCHEDULE_RULES.leaseMs);
  const result = await db.execute<{ session_id: string; specialty: string }>(sql`
    update ${agentSchedules} set lease_until = ${leaseUntil}
    where (session_id, specialty) in (
      select session_id, specialty from ${agentSchedules}
      where paused = false and next_check_at is not null and next_check_at <= ${now}
        and (lease_until is null or lease_until < ${now})
      order by next_check_at asc
      limit ${limit}
      for update skip locked
    )
    returning session_id, specialty`);
  return result.rows.filter(row => isSpecialty(row.specialty)).map(row => ({ sessionId: row.session_id, specialty: row.specialty as SpecialtyId }));
}

/**
 * Opens the slot of one agent run. Returns false when the slot already
 * completed, is running, or used its retry budget — the run is then skipped.
 */
async function openSlot(args: { sessionId: string; specialty: SpecialtyId; agentId: AgentId; slot: string; now: Date }): Promise<boolean> {
  const retryBefore = new Date(args.now.getTime() - SCHEDULE_RULES.retryAfterMs);
  const result = await db.execute<{ attempts: number }>(sql`
    insert into ${agentScheduleSlots} (session_id, specialty, agent_id, slot, status, attempts, started_at)
    values (${args.sessionId}, ${args.specialty}, ${args.agentId}, ${args.slot}, 'running', 1, ${args.now})
    on conflict (session_id, specialty, agent_id, slot) do update
      set status = 'running', attempts = ${agentScheduleSlots.attempts} + 1, started_at = ${args.now}, finished_at = null, error = null
      where ${agentScheduleSlots.status} in ('partial', 'failed')
        and ${agentScheduleSlots.attempts} < ${SCHEDULE_RULES.maxAttempts}
        and ${agentScheduleSlots.startedAt} < ${retryBefore}
    returning attempts`);
  return result.rows.length > 0;
}

async function closeSlot(args: { sessionId: string; specialty: SpecialtyId; agentId: AgentId; slot: string; outcome: SlotOutcome; runId: string | null; error: string | null }) {
  await db.update(agentScheduleSlots).set({ status: args.outcome, runId: args.runId, finishedAt: new Date(), error: args.error })
    .where(and(eq(agentScheduleSlots.sessionId, args.sessionId), eq(agentScheduleSlots.specialty, args.specialty), eq(agentScheduleSlots.agentId, args.agentId), eq(agentScheduleSlots.slot, args.slot)));
}

/** Slots of the current period that ended partial or failed and still have attempts left. */
async function retryableAgents(sessionId: string, specialty: SpecialtyId, slots: ReadonlyMap<AgentId, string>, now: Date): Promise<AgentId[]> {
  if (!slots.size) return [];
  const rows = await db.select().from(agentScheduleSlots).where(and(eq(agentScheduleSlots.sessionId, sessionId), eq(agentScheduleSlots.specialty, specialty)));
  return rows
    .filter(row => slots.get(row.agentId as AgentId) === row.slot && (row.status === "partial" || row.status === "failed") && row.attempts < SCHEDULE_RULES.maxAttempts && row.startedAt.getTime() <= now.getTime() - SCHEDULE_RULES.retryAfterMs)
    .map(row => row.agentId as AgentId);
}

async function loadProfile(sessionId: string, specialty: SpecialtyId) {
  const [row] = await db.select().from(agentProfiles).where(and(eq(agentProfiles.sessionId, sessionId), eq(agentProfiles.specialty, specialty)));
  return row ? normalizeProfile(row.profile, specialty) : null;
}

/** Re-arms a workspace after processing: next due time, or the earliest pending retry, and releases the lease. */
async function rearm(args: { sessionId: string; specialty: SpecialtyId; now: Date; failures: number; error: string | null; retryPending: boolean }) {
  const profile = await loadProfile(args.sessionId, args.specialty);
  const next = profile ? nextCheckAt(profile, args.now) : null;
  const retryAt = args.retryPending ? new Date(args.now.getTime() + SCHEDULE_RULES.retryAfterMs) : null;
  const candidates = [next, retryAt].filter((value): value is Date => Boolean(value));
  const at = candidates.length ? new Date(Math.min(...candidates.map(value => value.getTime()))) : null;
  await db.update(agentSchedules).set({ nextCheckAt: at, lastCheckedAt: args.now, leaseUntil: null, consecutiveFailures: args.failures, lastError: args.error, paused: profile?.backgroundPaused ?? false, updatedAt: new Date() })
    .where(and(eq(agentSchedules.sessionId, args.sessionId), eq(agentSchedules.specialty, args.specialty)));
}

export async function runDueSchedules(args: { run: ScheduledRun; now?: () => Date; limit?: number; budgetMs?: number }): Promise<ScheduleReport> {
  const started = Date.now();
  const clock = args.now ?? (() => new Date());
  const budget = args.budgetMs ?? 45_000;
  const report: ScheduleReport = { claimed: 0, ran: 0, completed: 0, partial: 0, failed: 0, skipped: 0, deferred: 0, durationMs: 0 };
  const claimed = await claimDueWorkspaces(clock(), args.limit ?? 25);
  report.claimed = claimed.length;
  for (const [index, workspace] of claimed.entries()) {
    if (Date.now() - started > budget) {
      // Out of time: release the remaining leases so the next invocation takes them at once.
      report.deferred = claimed.length - index;
      for (const rest of claimed.slice(index)) await db.update(agentSchedules).set({ leaseUntil: null }).where(and(eq(agentSchedules.sessionId, rest.sessionId), eq(agentSchedules.specialty, rest.specialty)));
      break;
    }
    const now = clock();
    const profile = await loadProfile(workspace.sessionId, workspace.specialty);
    if (!profile) { await rearm({ ...workspace, now, failures: 0, error: null, retryPending: false }); continue; }
    const due = dueAgents(profile, now);
    const slots = new Map<AgentId, string>([...new Set([...due, "whats_new", "guidelines", "drugs", "events", "learning"] as AgentId[])].map(agentId => [agentId, slotFor(profile, agentId, now)]));
    const retries = await retryableAgents(workspace.sessionId, workspace.specialty, slots, now);
    const agents = [...new Set([...due, ...retries])];
    let failures = 0;
    let lastError: string | null = null;
    let retryPending = false;
    for (const agentId of agents) {
      const slot = slots.get(agentId)!;
      if (!(await openSlot({ ...workspace, agentId, slot, now }))) { report.skipped += 1; continue; }
      report.ran += 1;
      try {
        const { run } = await args.run(workspace.sessionId, workspace.specialty, agentId);
        const outcome = outcomeOf(run.status);
        report[outcome] += 1;
        if (outcome !== "completed") { retryPending = true; failures += 1; lastError = run.error ?? "часть источников не ответила"; }
        await closeSlot({ ...workspace, agentId, slot, outcome, runId: run.id, error: outcome === "completed" ? null : (run.error ?? "partial").slice(0, 300) });
      } catch (error) {
        report.failed += 1;
        failures += 1;
        retryPending = true;
        lastError = error instanceof Error ? error.message.slice(0, 300) : "ошибка фоновой проверки";
        await closeSlot({ ...workspace, agentId, slot, outcome: "failed", runId: null, error: lastError });
      }
    }
    await rearm({ ...workspace, now: clock(), failures, error: lastError, retryPending });
  }
  report.durationMs = Date.now() - started;
  return report;
}

export interface ScheduleStatus {
  background: "on" | "paused" | "idle";
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  recent: Array<{ agentId: AgentId; slot: string; status: string; attempts: number; finishedAt: string | null }>;
}

/** What Settings shows about background checks of this workspace (PostgreSQL only). */
export async function scheduleStatus(sessionId: string, specialty: SpecialtyId): Promise<ScheduleStatus | null> {
  const [row] = await db.select().from(agentSchedules).where(and(eq(agentSchedules.sessionId, sessionId), eq(agentSchedules.specialty, specialty)));
  if (!row) return null;
  const slots = await db.select().from(agentScheduleSlots).where(and(eq(agentScheduleSlots.sessionId, sessionId), eq(agentScheduleSlots.specialty, specialty))).orderBy(desc(agentScheduleSlots.startedAt)).limit(10);
  return {
    background: row.paused ? "paused" : row.nextCheckAt ? "on" : "idle",
    nextCheckAt: row.nextCheckAt?.toISOString() ?? null,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastError: row.lastError,
    recent: slots.map(slot => ({ agentId: slot.agentId as AgentId, slot: slot.slot, status: slot.status, attempts: slot.attempts, finishedAt: slot.finishedAt?.toISOString() ?? null })),
  };
}
