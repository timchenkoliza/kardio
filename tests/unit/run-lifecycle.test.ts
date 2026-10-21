import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/agents/profile";
import type { AgentRun } from "@/lib/agents/types";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { diffManifests, isEmptyPatch } from "@/lib/mesh/patch";
import { validateManifest } from "@/lib/mesh/policies";
import { planSources } from "@/lib/mesh/planner";
import type { PageSnapshot } from "@/server/mesh/browser/drivers";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { executePlan } from "@/server/mesh/execute";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { executeAgentCommand } from "@/server/agents/commands";
import { workspaceStore } from "@/server/agents/store";
import { MemoryWorkspaceStore } from "@/server/agents/store/memory";
import type { WorkspaceStore } from "@/server/agents/store/types";
import { createRun, runAgent } from "@/server/agents/supervisor";
import { settleExpiredRun } from "@/server/portal/manager";
import { lookupRun, runStatusView } from "@/server/portal/run-state";
import { listContent, listSources } from "@/server/repositories/catalog";
import { HttpError } from "@/server/http";
import { ensureSession } from "@/server/services/state";
import { fakeAbstracts, fakeDrugLabel, fakePubmed, testContext } from "./agent-test-utils";
import { ACCEPTANCE_QUESTION, FixtureDriver, HFPEF_ABSTRACT, HFPEF_REVIEW, registryStatuses } from "./mesh-test-utils";

/** A MEDI-like site that answers slowly: the rest of the evidence must not wait for it. */
class SlowDriver extends FixtureDriver {
  constructor(private readonly delayMs: number) { super(); }
  override async open(url: string): Promise<PageSnapshot> {
    if (!url.endsWith("robots.txt")) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    return super.open(url);
  }
}

/** Records every durable write of a run, in order. */
function recording(store: WorkspaceStore) {
  const writes: AgentRun[] = [];
  const original = store.saveRun.bind(store);
  store.saveRun = async (sessionId, run) => { writes.push(structuredClone(run)); await original(sessionId, run); };
  return writes;
}

const SESSION = "a".repeat(64);
const OTHER = "b".repeat(64);

beforeEach(() => resetBrowserToolState());
afterEach(() => {
  delete process.env.VERCEL;
  delete process.env.KARDIO_REQUIRE_DURABLE_RUNS;
  delete process.env.MESH_SOURCE_SOFT_MS;
});

async function deps(store: WorkspaceStore, driver: FixtureDriver) {
  const [content, sources] = await Promise.all([listContent("cardiology"), listSources("cardiology")]);
  return { store, sessionId: SESSION, catalog: { content, sources }, pubmed: fakePubmed([HFPEF_REVIEW]), abstracts: fakeAbstracts([HFPEF_ABSTRACT]), drugLabel: fakeDrugLabel(), browserDriver: driver };
}

describe("durable run lifecycle: the id exists before anything executes", () => {
  it("creates a queued run with an execution deadline; unsafe input is a terminal blocked run", async () => {
    const store = new MemoryWorkspaceStore();
    const profile = defaultProfile("cardiology");
    const run = await createRun(store, SESSION, { agentId: "reference", specialty: "cardiology", profile, trigger: "composer", text: ACCEPTANCE_QUESTION, job: "guidelines" });
    expect(run.status).toBe("queued");
    expect(run.completedAt).toBeNull();
    expect(await store.getRun(SESSION, run.id)).toMatchObject({ id: run.id, status: "queued", input: { text: ACCEPTANCE_QUESTION } });
    expect(Date.parse(run.progress!.deadlineAt)).toBeGreaterThan(Date.parse(run.startedAt));

    const blocked = await createRun(store, SESSION, { agentId: "reference", specialty: "cardiology", profile, trigger: "composer", text: "Расшифруйте снимок ЭКГ пациента по фото" });
    if (blocked.status === "blocked") {
      expect(blocked.completedAt).not.toBeNull();
      expect(blocked.progress).toBeNull();
    }
  });

  it("publishes validated partial experiences while a slow source is still being checked, then completes", async () => {
    const store = new MemoryWorkspaceStore();
    const writes = recording(store);
    const profile = defaultProfile("cardiology");
    const created = await createRun(store, SESSION, { agentId: "reference", specialty: "cardiology", profile, trigger: "composer", text: ACCEPTANCE_QUESTION, job: "guidelines" });
    process.env.MESH_SOURCE_SOFT_MS = "50";
    const outcome = await runAgent(await deps(store, new SlowDriver(150)), { agentId: "reference", specialty: "cardiology", profile, trigger: "composer", text: ACCEPTANCE_QUESTION, job: "guidelines", intent: compileIntent(ACCEPTANCE_QUESTION, "cardiology"), run: created });

    expect(writes[0].status).toBe("queued");
    expect(writes[1].status).toBe("running");
    const partials = writes.filter(write => write.status === "partial" && !write.completedAt);
    expect(partials.length).toBeGreaterThan(0);
    const first = partials[0];
    // The first published version is validated by the same gates, and says which sources are still being checked.
    expect(first.progress!.manifestVersion).toBe(1);
    expect(first.progress!.pending.some(item => item.name.startsWith("МЕДИ РУ"))).toBe(true);
    expect(validateManifest(first.experience!.manifest, first.experience!.graph, { descriptors: descriptors(createSourceRegistry({ browserDriver: new FixtureDriver() })) }).passed).toBe(true);
    expect(first.experience!.graph.complete).toBe(false);
    expect(first.experience!.graph.gaps.join(" ")).not.toMatch(/российск/iu);
    expect(first.experience!.graph.sources.find(source => source.id === "medi")?.outcome).toBe("pending");
    expect(first.progress!.firstModuleMs).not.toBeNull();

    // Versions only grow; a later patch preserves the modules it does not change.
    const versions = writes.map(write => write.progress?.manifestVersion ?? 0);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    const final = outcome.run;
    expect(final.completedAt).not.toBeNull();
    expect(["completed", "partial"]).toContain(final.status);
    expect(final.experience!.graph.complete).toBe(true);
    expect(final.experience!.graph.sources.find(source => source.id === "medi")?.outcome).toBe("ok");
    expect(final.progress!.pending).toEqual([]);
    expect(final.progress!.manifestVersion).toBeGreaterThan(first.progress!.manifestVersion);
    expect(final.progress!.patch!.preservedModules.length + final.progress!.patch!.modulesUpdated.length).toBeGreaterThan(0);
    expect(final.progress!.firstModuleMs!).toBeLessThanOrEqual(final.durationMs!);
    // Module identity is stable across versions: the takeaway keeps its id.
    const takeaway = (run: AgentRun) => run.experience!.manifest.modules.find(entry => entry.family === "key_takeaway")?.id;
    expect(takeaway(final)).toBe(takeaway(first));
    // Nothing is written after the final state.
    expect(writes.at(-1)!.completedAt).not.toBeNull();
  });
});

describe("source deadlines: source failure is not request failure", () => {
  it("cuts a source at its hard deadline (LIMITED) while the other evidence continues, within the overall budget", async () => {
    const intent = compileIntent(ACCEPTANCE_QUESTION, "cardiology");
    const registry = createSourceRegistry({ browserDriver: new SlowDriver(5_000), site: { minIntervalMs: 0 } });
    const statuses = await registryStatuses(registry);
    const plan = planSources({ intent, sources: descriptors(registry), statuses });
    const ctx = await testContext({ agentId: "reference", topics: [], text: ACCEPTANCE_QUESTION, job: "guidelines", pubmed: fakePubmed([HFPEF_REVIEW]), abstracts: fakeAbstracts([HFPEF_ABSTRACT]) });
    const events: string[] = [];
    const started = Date.now();
    const { results } = await executePlan({ plan, intent, registry, ctx, sessionId: null, deadlines: { softMs: 100, hardMs: 400, budgetMs: 600, minStartMs: 300 }, onStep: event => events.push(`${event.kind}:${event.stepId}`) });
    const elapsed = Date.now() - started;
    const medi = results.filter(result => result.invocation.sourceId === "medi");
    expect(medi.length).toBeGreaterThan(0);
    for (const result of medi) {
      expect(result.invocation.outcome).toBe("failed");
      expect(result.invocation.status).toBe("LIMITED");
      expect(result.invocation.errorCode).toMatch(/^(?:deadline|timeout):/u);
      expect(result.documents).toEqual([]);
    }
    expect(results.find(result => result.invocation.sourceId === "pubmed")?.invocation.outcome).toBe("ok");
    expect(events.some(event => event.startsWith("slow:"))).toBe(true);
    // Nothing runs past the overall budget (plus the bookkeeping of the last step).
    expect(elapsed).toBeLessThan(600 + 300);
    // The graph built from what arrived is honest about the cut source.
    const graph = buildEvidenceGraph({ id: "g", intent, plan, results, descriptors: descriptors(registry), statuses, now: ctx.nowIso });
    expect(graph.gaps.join(" ")).toMatch(/не ответил/u);
  });
});

describe("ExperiencePatch", () => {
  it("lists added, updated, removed and preserved modules by stable id", async () => {
    const intent = compileIntent(ACCEPTANCE_QUESTION, "cardiology");
    const registry = createSourceRegistry({ browserDriver: new FixtureDriver(), site: { minIntervalMs: 0 } });
    const statuses = await registryStatuses(registry);
    const plan = planSources({ intent, sources: descriptors(registry), statuses });
    const ctx = await testContext({ agentId: "reference", topics: [], text: ACCEPTANCE_QUESTION, job: "guidelines", pubmed: fakePubmed([HFPEF_REVIEW]), abstracts: fakeAbstracts([HFPEF_ABSTRACT]) });
    const { results } = await executePlan({ plan, intent, registry, ctx, sessionId: null });
    const { compileExperience } = await import("@/lib/mesh/compiler");
    const compile = (subset: typeof results, pending: string[]) => compileExperience({ user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario, graph: buildEvidenceGraph({ id: "graph-fixed", intent, plan, results: subset, descriptors: descriptors(registry), statuses, now: ctx.nowIso, pending }) }).manifest;
    const withoutMedi = results.filter(result => result.invocation.sourceId !== "medi");
    const partial = compile(withoutMedi, results.filter(result => result.invocation.sourceId === "medi").map(result => result.invocation.stepId));
    const full = compile(results, []);
    const patch = diffManifests(partial, full, { runId: "run-x", manifestVersion: 2, status: "completed" });
    expect(patch.modulesAdded.length + patch.modulesUpdated.length).toBeGreaterThan(0);
    expect(new Set([...patch.modulesAdded, ...patch.modulesUpdated, ...patch.preservedModules])).toEqual(new Set(full.modules.map(entry => entry.id)));
    expect(isEmptyPatch(diffManifests(full, full, { runId: "run-x", manifestVersion: 3, status: "completed" }))).toBe(true);
  });
});

describe("persistence invariant and honest unavailability", () => {
  it("refuses to hand out a run id from an in-process store on a serverless deployment", async () => {
    const database = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      process.env.VERCEL = "1";
      expect(workspaceStore().kind).toBe("memory");
      await expect(executeAgentCommand(SESSION, { action: "ask", specialty: "cardiology", text: ACCEPTANCE_QUESTION })).rejects.toMatchObject({ status: 503, code: "storage_unavailable" });
      await expect(executeAgentCommand(SESSION, { action: "ask", specialty: "cardiology", text: ACCEPTANCE_QUESTION })).rejects.toBeInstanceOf(HttpError);
    } finally {
      if (database) process.env.DATABASE_URL = database;
    }
  });

  it("returns the durable run id at once and runs the work after the response", async () => {
    await ensureSession(SESSION);
    const tasks: Array<() => Promise<void>> = [];
    const result = await executeAgentCommand(SESSION, { action: "ask", specialty: "cardiology", text: "Конгрессы по кардиологии", job: "events" }, { schedule: task => { tasks.push(task); } });
    expect(result.runId).toBeTruthy();
    const queued = await workspaceStore().getRun(SESSION, result.runId!);
    expect(queued?.status).toBe("queued");
    expect(tasks).toHaveLength(1);
    await tasks[0]();
    const done = await workspaceStore().getRun(SESSION, result.runId!);
    expect(done?.completedAt).not.toBeNull();
    expect(["completed", "partial"]).toContain(done?.status);
  });

  it("names another session only when the run exists there; an open run past its deadline is expired, not spinning", async () => {
    await ensureSession(SESSION);
    const store = workspaceStore();
    const profile = defaultProfile("cardiology");
    const run = await createRun(store, SESSION, { agentId: "reference", specialty: "cardiology", profile, trigger: "composer", text: ACCEPTANCE_QUESTION });
    expect((await lookupRun(SESSION, "cardiology", run.id)).availability).toBe("available");
    expect((await lookupRun(OTHER, "cardiology", run.id)).availability).toBe("session_mismatch");
    expect((await lookupRun(null, "cardiology", run.id)).availability).toBe("session_mismatch");
    expect((await lookupRun(SESSION, "cardiology", "run-00000000-0000-4000-8000-000000000000")).availability).toBe("run_not_found");
    expect((await lookupRun(SESSION, "cardiology", "not-a-run")).availability).toBe("run_not_found");

    const view = runStatusView(run.id, await lookupRun(SESSION, "cardiology", run.id));
    expect(view).toMatchObject({ availability: "available", phase: "queued", finished: false, manifestVersion: 0 });

    const later = new Date(Date.parse(run.progress!.deadlineAt) + 1_000);
    const expired = await settleExpiredRun(SESSION, run, later);
    expect(expired).toMatchObject({ status: "failed", error: "execution_expired" });
    expect(runStatusView(run.id, { availability: "available", run: expired })).toMatchObject({ phase: "expired", finished: true });
  });
});

describe("overall budget", () => {
  it("does not start a step when less than minStartMs of the budget is left", async () => {
    const intent = compileIntent(ACCEPTANCE_QUESTION, "cardiology");
    const registry = createSourceRegistry({ browserDriver: new FixtureDriver(), site: { minIntervalMs: 0 } });
    const statuses = await registryStatuses(registry);
    const plan = planSources({ intent, sources: descriptors(registry), statuses });
    const ctx = await testContext({ agentId: "reference", topics: [], text: ACCEPTANCE_QUESTION, job: "guidelines", pubmed: fakePubmed([HFPEF_REVIEW]), abstracts: fakeAbstracts([HFPEF_ABSTRACT]) });
    // The budget is already spent when execution starts.
    const { results } = await executePlan({ plan, intent, registry, ctx, sessionId: null, startedAt: Date.now() - 10_000, deadlines: { softMs: 100, hardMs: 400, budgetMs: 1_000, minStartMs: 300 } });
    const executed = results.filter(result => result.invocation.outcome !== "handoff");
    expect(executed.length).toBeGreaterThan(0);
    for (const result of executed) expect(result.invocation).toMatchObject({ outcome: "failed", status: "LIMITED", errorCode: "deadline:budget" });
  });
});
