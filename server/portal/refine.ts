import type { AgentRun, RunExperience } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { compileExperience, PRIORITY_SIGNAL, type CompileInput } from "@/lib/mesh/compiler";
import { mergeEvidence } from "@/lib/mesh/evidence-graph";
import { compileIntent, type NormalizedIntent } from "@/lib/mesh/intent";
import { planSources } from "@/lib/mesh/planner";
import { diffManifests, isEmptyPatch, type ExperiencePatch } from "@/lib/mesh/patch";
import { applyView, buildExperienceContext, classifyDelta, resolveDelta, viewDirectives, type IntentDelta } from "@/lib/mesh/refine";
import { buildSessionContext, pinnedSession, type SessionContext } from "@/lib/mesh/session-context";
import { compileWithSkill } from "@/lib/mesh/skill-compile";
import { skillById } from "@/lib/mesh/skills/registry";
import { meshSourcePreference } from "@/lib/mesh/source-preferences";
import { decideStrategy } from "@/lib/mesh/strategy";
import { isPortalJob } from "@/lib/portal/jobs";
import type { SourceId, SourceStatusReport } from "@/lib/mesh/sources";
import type { AgentContext } from "@/server/agents/context";
import { workspaceStore } from "@/server/agents/store";
import type { BrowserDriver } from "@/server/mesh/browser/drivers";
import { retrievalContext } from "@/server/agents/supervisor";
import { catalogFor, loadProfile } from "@/server/agents/workspace";
import { executePlan } from "@/server/mesh/execute";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { recordMeshEvent } from "@/server/mesh/telemetry";

/**
 * Result as context: a follow-up on an open result is first tried as a
 * refinement of THAT run. A refinement patches the same run — same id, same
 * page, the same module identities — and calls a source only for what the
 * evidence graph lacks. Anything else is a new question.
 */

const MAX_PATCHES = 10;
const FINISHED = new Set(["completed", "partial"]);

export interface RefineOutcome {
  runId: string;
  applied: boolean;
  /** Fixed copy shown inline when the refinement cannot be applied to this result. */
  message: string | null;
  manifestVersion: number;
  patch: ExperiencePatch | null;
  delta: IntentDelta;
  retrieval: boolean;
}

/** The strategy the run was executed with, re-decided deterministically from what was persisted. */
function executedStrategy(run: AgentRun, specialty: SpecialtyId) {
  const job = isPortalJob(run.intent) ? run.intent : null;
  return decideStrategy({
    text: run.input.text ?? "",
    specialty,
    job: run.input.explicitJob ? job : null,
    session: pinnedSession(run.input.context?.entities ?? [], new Date(run.startedAt)),
    answered: run.input.context?.answered ?? { id: "execution", optionId: null },
    planConfirmed: run.input.context?.planConfirmed ?? "execution",
  });
}

function retrievalIntent(base: NormalizedIntent, text: string, specialty: SpecialtyId, requirement: NormalizedIntent["requirements"][number], focus: string | undefined): NormalizedIntent {
  // Dosing and safety sections are read from the instruction only for a drug-reference job.
  const shaped = focus ? compileIntent(text, specialty, { jobType: "drug_reference" }) : base;
  return { ...shaped, requirements: [requirement], optional: [] };
}

/** Recent runs of this physician as a bounded session context (ids and entity ids only). */
export async function sessionContextFor(sessionId: string, specialty: SpecialtyId, currentRunId: string | null = null, now = new Date()): Promise<SessionContext> {
  const runs = await workspaceStore().listRuns(sessionId, specialty, undefined, 12);
  return buildSessionContext(runs.filter(run => run.experience).map(run => ({
    id: run.id,
    startedAt: run.startedAt,
    status: run.status,
    family: run.experience!.manifest.intent.family,
    job: run.experience!.manifest.intent.job,
    nosology: run.experience!.manifest.intent.nosology,
    subtype: run.experience!.manifest.intent.subtype,
    drugs: run.experience!.graph.context.drugs,
    clarification: run.input.context?.answered ?? null,
    patches: (run.patches ?? []).map(patch => ({ manifestVersion: patch.manifestVersion, reason: patch.reason?.intentDelta?.kind ?? "source_result" })),
  })), { now, currentRunId });
}

/** Test seams: a fixture browser and fake API clients (production uses the live ones). */
export interface RefineDeps {
  browserDriver?: BrowserDriver | null;
  context?: Partial<Pick<AgentContext, "pubmed" | "abstracts" | "drugLabel">>;
}

export async function refineRun(sessionId: string, specialty: SpecialtyId, runId: string, text: string, deps: RefineDeps = {}): Promise<RefineOutcome | null> {
  const store = workspaceStore();
  const run = await store.getRun(sessionId, runId);
  if (!run || run.specialty !== specialty || !FINISHED.has(run.status) || !run.experience || !run.input.text) return null;
  const experience = run.experience;
  const context = buildExperienceContext(run, experience);
  const named = compileIntent(text, specialty);
  const delta = classifyDelta(text, context, { drugs: named.entities.drugs.map(drug => drug.inn), nosology: named.context.nosology?.id ?? null });
  if (!delta) return null;

  const resolution = resolveDelta(delta, context, experience.graph);
  const version = run.progress?.manifestVersion ?? 0;
  if (resolution.refused) {
    await recordMeshEvent(sessionId, "experience_patch_compiled", { specialty, runId, deltaKind: delta.kind, reason: "refused", manifestVersion: version });
    return { runId, applied: false, message: resolution.refused, manifestVersion: version, patch: null, delta, retrieval: false };
  }

  const strategy = executedStrategy(run, specialty);
  let graph = experience.graph;
  const registry = createSourceRegistry(deps.browserDriver !== undefined ? { browserDriver: deps.browserDriver } : {});
  const sources = descriptors(registry);
  if (resolution.retrieval.length) {
    const [profile, catalog] = await Promise.all([loadProfile(sessionId, specialty), catalogFor(specialty)]);
    const ctx = { ...retrievalContext({ agentId: run.agentId, specialty, profile, catalog, sessionId, ...(deps.browserDriver !== undefined ? { browserDriver: deps.browserDriver } : {}) }), ...deps.context };
    const statuses = Object.fromEntries(await Promise.all(Object.values(registry).map(async adapter => [adapter.id, await adapter.status()] as const))) as Record<SourceId, SourceStatusReport>;
    for (const need of resolution.retrieval) {
      const intent = retrievalIntent(strategy.intent, run.input.text, specialty, need.requirement, need.focus);
      const plan = planSources({ intent, sources, statuses, excludedSources: meshSourcePreference(ctx.preference.excludedSources).sources, planId: `plan-refine-${delta.kind}-${need.requirement}` });
      const executed = await executePlan({ plan, intent, registry, ctx, sessionId, runId, ...(need.since ? { since: need.since } : {}) });
      graph = mergeEvidence(graph, { intent, plan, results: executed.results, descriptors: sources, statuses, now: new Date().toISOString() });
    }
  }

  const view = resolution.view;
  const visible = applyView(graph, view);
  const directives = viewDirectives(visible, experience.manifest, view, graph);
  const base: Omit<CompileInput, "graph"> = {
    // The refined view keeps the run's «Приоритет» order (recorded as manifest signals).
    user: { signals: experience.manifest.personalization.signals, topics: [], trustedSources: experience.manifest.personalization.signals.filter(signal => signal.startsWith(PRIORITY_SIGNAL)).map(signal => signal.slice(PRIORITY_SIGNAL.length)) },
    modules: strategy.intent.modules,
    policy: { descriptors: sources },
    scenario: strategy.intent.context.scenario,
    resultKeys: Object.fromEntries(graph.documents.map(document => [document.id, `${run.agentId}:mesh:${document.id}`])),
  };
  const skill = experience.manifest.execution?.class === "skill" && experience.manifest.execution.skill ? skillById(experience.manifest.execution.skill.id) : null;
  const compiled = skill && strategy.skill?.id === skill.id
    ? compileWithSkill(base, visible, skill, strategy.flow, { moduleProps: directives.moduleProps, priorityClaims: directives.priorityClaims, view }).output
    : compileExperience({ ...base, graph: visible, moduleProps: directives.moduleProps, priorityClaims: directives.priorityClaims, view, execution: experience.manifest.execution ?? null });
  if (compiled.fallback) {
    await recordMeshEvent(sessionId, "experience_patch_compiled", { specialty, runId, deltaKind: delta.kind, reason: "policy_rejected", manifestVersion: version });
    return { runId, applied: false, message: "Не удалось применить уточнение без потери проверенных данных — показан прежний результат.", manifestVersion: version, patch: null, delta, retrieval: resolution.retrieval.length > 0 };
  }

  const patch = diffManifests(experience.manifest, compiled.manifest, {
    runId,
    manifestVersion: version + 1,
    parentManifestVersion: version,
    status: run.status === "partial" ? "partial" : "completed",
    reason: { kind: "refinement", intentDelta: { kind: delta.kind, params: delta.params }, affectedEvidence: { requirements: resolution.requirements, documentIds: resolution.documentIds.slice(0, 40), claimIds: resolution.claimIds.slice(0, 40) }, retrieval: resolution.retrieval.length > 0 },
  });
  await recordMeshEvent(sessionId, "experience_patch_compiled", { specialty, runId, deltaKind: delta.kind, manifestVersion: patch.manifestVersion, added: patch.modulesAdded.length, updated: patch.modulesUpdated.length, removed: patch.modulesRemoved.length, preserved: patch.preservedModules.length, retrieval: patch.reason?.retrieval });
  if (isEmptyPatch(patch) && JSON.stringify(experience.manifest.view ?? null) === JSON.stringify(compiled.manifest.view ?? null)) {
    return { runId, applied: true, message: "Результат уже показан так.", manifestVersion: version, patch: null, delta, retrieval: false };
  }

  // Re-read before writing: a concurrent refinement of the same run must not be lost.
  const latest = (await store.getRun(sessionId, runId)) ?? run;
  if ((latest.progress?.manifestVersion ?? 0) !== version) return { runId, applied: false, message: "Результат только что изменился — повторите уточнение.", manifestVersion: latest.progress?.manifestVersion ?? 0, patch: null, delta, retrieval: false };
  const next: RunExperience = { ...experience, manifest: compiled.manifest, graph };
  const updated: AgentRun = {
    ...latest,
    experience: next,
    patches: [...(latest.patches ?? []), patch].slice(-MAX_PATCHES),
    progress: latest.progress ? { ...latest.progress, manifestVersion: patch.manifestVersion, patch, updatedAt: new Date().toISOString() } : { manifestVersion: patch.manifestVersion, stepsTotal: 0, stepsDone: 0, pending: [], firstModuleMs: null, deadlineAt: latest.startedAt, updatedAt: new Date().toISOString(), patch },
  };
  await store.saveRun(sessionId, updated);
  await recordMeshEvent(sessionId, "experience_patch_applied", { specialty, runId, deltaKind: delta.kind, manifestVersion: patch.manifestVersion });
  return { runId, applied: true, message: null, manifestVersion: patch.manifestVersion, patch, delta, retrieval: patch.reason?.retrieval ?? false };
}
