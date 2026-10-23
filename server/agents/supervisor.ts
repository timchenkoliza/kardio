import { AGENT_DEFINITIONS } from "@/lib/agents/definitions";
import { routeIntent, type RoutedIntent } from "@/lib/agents/intent";
import { effectivePreference, preferenceDigest } from "@/lib/agents/profile";
import { resolveAnswerMode, type AnswerMode } from "@/lib/portal/answer-mode";
import { topicsMentioned } from "@/lib/agents/vocabulary";
import type { ActionRequest, AgentId, AgentResult, AgentRun, Material, PlanStep, RunExperience, RunProgress, RunTrigger, UserProfile } from "@/lib/agents/types";
import type { ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import { compileIntent, type NormalizedIntent } from "@/lib/mesh/intent";
import { diffManifests, isEmptyPatch } from "@/lib/mesh/patch";
import { pinnedSession } from "@/lib/mesh/session-context";
import { decideStrategy } from "@/lib/mesh/strategy";
import type { PortalJob } from "@/lib/portal/jobs";
import { EXCLUDED_IN_PROFILE } from "@/lib/portal/run-outcome";
import type { BrowserDriver } from "@/server/mesh/browser/drivers";
import { lookupDrugLabelLive, type DrugLabelResult } from "./adapters/openfda";
import { searchPubmedLive, type PubmedQuery, type PubmedSearchResult } from "./adapters/pubmed";
import { fetchPubmedAbstracts, type PubmedAbstractsResult } from "./adapters/pubmed-abstracts";
import type { AgentContext, RunProgressSink } from "./context";
import type { ResultDraft } from "./drafts";
import { EXECUTORS, type ExecutorResult } from "./executors";
import { prepareAction } from "./services/action-confirmation";
import { resultVerification, sourceAssessmentFor } from "./services/fact-check";
import { materialFromResult } from "./services/material";
import { checkInputRisk, checkOutputRisk, type InputRiskDecision } from "./services/risk";
import type { WorkspaceStore } from "./store/types";
import { recordAgentEvent } from "./telemetry";

/**
 * Master / supervisor agent.
 *
 *   INTENT → PLAN → AGENT → TOOL CALLS → VALIDATION → (APPROVAL) → RESULT
 *
 * The supervisor is internal: the interface shows jobs, plans in plain
 * language and evidence — never function names or orchestration mechanics.
 */

export interface SupervisorDeps {
  store: WorkspaceStore;
  sessionId: string;
  catalog: { content: ContentObject[]; sources: Source[] };
  pubmed?: (query: PubmedQuery) => Promise<PubmedSearchResult>;
  abstracts?: (pmids: readonly string[]) => Promise<PubmedAbstractsResult>;
  drugLabel?: (genericName: string) => Promise<DrugLabelResult>;
  now?: () => Date;
  /** True when the profile was restored from the browser mirror after a cold start. */
  rehydrated?: boolean;
  /** Browser driver for browser-capable sources (tests inject fixtures; null disables). */
  browserDriver?: BrowserDriver | null;
  /**
   * Last work on the merged results before the run is marked finished (the research scenario reads and
   * structures its top records here). It may add plan steps and tool uses to the run; it returns the results to keep.
   */
  finishing?: (args: { results: AgentResult[]; run: AgentRun }) => Promise<AgentResult[]>;
}

export interface RunOutcome {
  run: AgentRun;
  results: AgentResult[];
  actions: ActionRequest[];
  routed: RoutedIntent | null;
}

/** routeTask(): which agent should own this request. */
export function routeTask(text: string, specialty: SpecialtyId, options: { preferred?: AgentId | null; hasAttachment?: boolean } = {}): RoutedIntent {
  return routeIntent(text, specialty, options);
}

/** selectAgent(): explicit choice wins; otherwise the routed agent. */
export function selectAgent(routed: RoutedIntent): AgentId {
  return routed.agentId;
}

const PLAN_TEMPLATES: Record<AgentId, string[]> = {
  reference: ["Разбор запроса", "План источников", "Чтение источников", "Граф доказательств", "Сборка ответа"],
  whats_new: ["Определить окно «с прошлого визита»", "Каталог РКО и РКЖ", "Рекомендации", "Препараты", "PubMed", "Проверка утверждений", "Ранжирование"],
  guidelines: ["Область и период", "Версии и отличия", "Проверка утверждений", "Ранжирование"],
  drugs: ["Что отслеживать", "Регистрации, ограничения, рекомендации", "Новые исследования", "Проверка утверждений", "Ранжирование"],
  research: ["Вопрос и план поиска", "Каталог", "PubMed", "Проверка утверждений", "Ранжирование", "Проверяемый обзор"],
  events: ["Условия", "Поиск и нормализация", "Проверка", "Ранжирование и объяснение", "Следующий шаг"],
  learning: ["Цели и темы", "Маршрут", "Проверка версий"],
  materials: ["Личная база", "Поиск по материалам"],
};

/** createPlan(): the intended plan before execution (for audit and previews). */
export function createPlan(agentId: AgentId): PlanStep[] {
  return PLAN_TEMPLATES[agentId].map((label, index) => ({ id: `planned-${index + 1}`, label, tool: null, status: "skipped", detail: null, connectorIds: [] }));
}

/** checkRisk(): mandatory input gate (redaction + policy). */
export function checkRisk(text: string): InputRiskDecision {
  return checkInputRisk(text);
}

/**
 * validateEvidence(): mandatory output gate. Organic findings without any
 * supported or partially supported claim are not shown as sourced facts, and
 * wording that reads like a treatment order is withheld.
 */
export function validateEvidence(drafts: readonly ResultDraft[]): { kept: ResultDraft[]; dropped: number; notes: string[] } {
  const kept: ResultDraft[] = [];
  const notes: string[] = [];
  let dropped = 0;
  let rejected = 0;
  for (const draft of drafts) {
    if (draft.partner) {
      if (!draft.partner.label || !draft.partner.disclosure) { dropped += 1; continue; }
      kept.push(draft);
      continue;
    }
    const output = checkOutputRisk([draft.title, draft.summary, ...draft.evidence.map(item => item.claim)]);
    if (!output.allowed) { dropped += 1; notes.push(output.reason ?? "Результат скрыт проверкой безопасности"); continue; }
    const primary = sourceAssessmentFor({ sourceUrl: draft.source.sourceUrl, provenance: draft.source });
    if (primary?.standing === "rejected") { dropped += 1; rejected += 1; continue; }
    const status = resultVerification(draft.evidence);
    const hasSupport = draft.evidence.some(item => item.verificationStatus === "SUPPORTED" || item.verificationStatus === "PARTIALLY_SUPPORTED");
    if (!hasSupport && status === "UNSUPPORTED") { dropped += 1; continue; }
    kept.push(primary ? { ...draft, source: { ...draft.source, standing: primary.standing, standingNote: primary.brand } } : draft);
  }
  if (rejected) notes.push(`Скрыто находок из источников, отклонённых врачами: ${rejected}`);
  if (dropped - rejected > 0) notes.push(`Скрыто находок без подтверждения источником: ${dropped - rejected}`);
  return { kept, dropped, notes: [...new Set(notes)] };
}

/** requestApproval(): prepares (never executes) actions outside the product. */
export function requestApproval(args: { specialty: SpecialtyId; agentId: AgentId; routed: RoutedIntent | null; results: readonly AgentResult[]; now: string }): ActionRequest[] {
  if (!args.routed || args.agentId !== "events") return [];
  const events = args.results.filter(result => result.kind === "event").slice(0, 8);
  if (!events.length) return [];
  const actions: ActionRequest[] = [];
  if (args.routed.wantsCalendar) {
    actions.push(prepareAction({
      specialty: args.specialty,
      kind: "calendar_write",
      title: `Добавить в календарь: ${events.length} ${events.length === 1 ? "событие" : events.length < 5 ? "события" : "событий"}`,
      description: events.map(event => `${event.title} — ${event.summary}`).join("\n"),
      effect: "Скачается файл .ics со всеми событиями и напоминаниями за сутки и за час. Ваш календарь сам ничего не получит, пока вы не откроете файл.",
      agentId: args.agentId,
      results: events,
      now: args.now,
    }));
  }
  if (args.routed.wantsRegistration) {
    for (const event of events.slice(0, 5)) {
      const url = typeof event.attributes.registrationUrl === "string" ? event.attributes.registrationUrl : event.source.sourceUrl;
      if (!url) continue;
      actions.push(prepareAction({
        specialty: args.specialty,
        kind: "registration",
        title: `Регистрация: ${event.title}`,
        description: event.summary,
        effect: "Откроется страница организатора. Зарегистрироваться от вашего имени агент не может — заполните форму сами.",
        agentId: args.agentId,
        results: [event],
        payload: { url },
        now: args.now,
      }));
    }
  }
  return actions;
}

/** Background checks that fill «Для вас» (their results belong to the check, not to a question). */
const FEED_CHECKS: readonly AgentId[] = ["whats_new", "guidelines", "drugs", "events"];

/** persistResult(): merge by stable key; first-seen time is never rewritten. */
export function mergeResults(args: { drafts: readonly ResultDraft[]; existing: readonly AgentResult[]; runId: string; now: string; lastSeenAt: string | null; rehydrated: boolean; keyPrefix: string }): { results: AgentResult[]; newCount: number } {
  const byKey = new Map(args.existing.map(result => [result.key, result]));
  let newCount = 0;
  const results = args.drafts.map(draft => {
    const key = `${args.keyPrefix}:${draft.key}`;
    const previous = byKey.get(key);
    if (previous) {
      return { ...previous, ...draft, key, id: previous.id, runId: args.runId, createdAt: previous.createdAt, dismissed: previous.dismissed, savedMaterialId: previous.savedMaterialId };
    }
    let createdAt = args.now;
    if (args.rehydrated && args.lastSeenAt && draft.observedAt && draft.observedAt.slice(0, 10) <= args.lastSeenAt.slice(0, 10)) createdAt = args.lastSeenAt;
    if (createdAt === args.now) newCount += 1;
    return { ...draft, key, id: `res-${crypto.randomUUID()}`, runId: args.runId, createdAt, dismissed: false, savedMaterialId: null };
  });
  return { results, newCount };
}

/**
 * A delegated task is scoped by what the physician asked: topics named in the
 * request replace the standing interests for that run; a research question
 * without named topics is searched by its own words only.
 */
function scopedPreference(preference: ReturnType<typeof effectivePreference>, agentId: AgentId, routed: RoutedIntent | null, text: string | null, specialty: SpecialtyId): ReturnType<typeof effectivePreference> {
  if (agentId === "materials") return preference;
  const named = routed?.topics.length ? routed.topics : text ? topicsMentioned(specialty, text) : [];
  if (named.length) return { ...preference, topics: named };
  if (agentId === "research" && text?.trim()) return { ...preference, topics: [] };
  return preference;
}

/** A source context for a targeted retrieval outside a full run (a refinement of an open result). */
export function retrievalContext(args: { agentId: AgentId; specialty: SpecialtyId; profile: UserProfile; catalog: { content: ContentObject[]; sources: Source[] }; sessionId: string; now?: Date; browserDriver?: BrowserDriver | null }): AgentContext {
  const now = args.now ?? new Date();
  return {
    agentId: args.agentId,
    specialty: args.specialty,
    now,
    nowIso: now.toISOString(),
    profile: args.profile,
    preference: effectivePreference(args.profile, args.agentId),
    lastSeenAt: null,
    catalog: args.catalog,
    materials: [],
    pubmed: query => searchPubmedLive(query),
    abstracts: pmids => fetchPubmedAbstracts(pmids),
    drugLabel: name => lookupDrugLabelLive(name),
    inputText: null,
    job: null,
    history: [],
    ...(args.browserDriver !== undefined ? { browserDriver: args.browserDriver } : {}),
    sessionId: args.sessionId,
    progress: null,
  };
}

/** A run that is not finished by this time after creation is reported as expired (its execution was lost). */
export const RUN_EXECUTION_DEADLINE_MS = 90_000;

/**
 * Durable progress writer for a run created before execution. Writes are
 * serialized (never out of order) and stop once the run is finalized; a
 * manifest is published only when it changes what the physician sees.
 */
function progressWriter(deps: SupervisorDeps, run: AgentRun): { sink: RunProgressSink; close: () => Promise<{ version: number; previous: RunExperience | null; firstModuleMs: number | null }> } {
  const created = Date.parse(run.startedAt);
  let chain: Promise<void> = Promise.resolve();
  let closed = false;
  let version = run.progress?.manifestVersion ?? 0;
  let previous: RunExperience | null = run.experience ?? null;
  let firstModuleMs: number | null = run.progress?.firstModuleMs ?? null;
  const sink: RunProgressSink = {
    publish(update) {
      if (closed) return;
      chain = chain.then(async () => {
        if (closed) return;
        let patch = run.progress?.patch ?? null;
        if (update.experience) {
          const candidate = diffManifests(previous?.manifest ?? null, update.experience.manifest, { runId: run.id, manifestVersion: version + 1, status: "partial" });
          if (!isEmptyPatch(candidate)) {
            version += 1;
            patch = candidate;
            previous = update.experience;
            run.experience = update.experience;
            run.status = "partial";
            firstModuleMs ??= Date.now() - created;
          }
        }
        run.progress = { ...progressBase(run), manifestVersion: version, stepsTotal: update.stepsTotal, stepsDone: update.stepsDone, pending: update.pending, firstModuleMs, updatedAt: new Date().toISOString(), patch };
        await deps.store.saveRun(deps.sessionId, run);
      }).catch(() => undefined);
    },
  };
  return { sink, close: async () => { closed = true; await chain; return { version, previous, firstModuleMs }; } };
}

function progressBase(run: AgentRun): RunProgress {
  return run.progress ?? { manifestVersion: 0, stepsTotal: 0, stepsDone: 0, pending: [], firstModuleMs: null, deadlineAt: new Date(Date.parse(run.startedAt) + RUN_EXECUTION_DEADLINE_MS).toISOString(), updatedAt: run.startedAt, patch: null };
}

/**
 * Creates the durable record of a run before anything executes: the id
 * returned to the browser already exists in storage. Unsafe input is
 * blocked here (a terminal run); everything else is queued.
 */
export async function createRun(store: WorkspaceStore, sessionId: string, request: { agentId: AgentId; specialty: SpecialtyId; profile: UserProfile; trigger: RunTrigger; text: string; job?: PortalJob | null; explicitJob?: boolean; followup?: boolean; context?: NonNullable<AgentRun["input"]["context"]>; answerMode?: AnswerMode | null; continuation?: AgentRun["input"]["continuation"]; origin?: AgentRun["input"]["origin"]; now?: Date }): Promise<AgentRun> {
  const now = request.now ?? new Date();
  const preference = effectivePreference(request.profile, request.agentId);
  const risk = checkRisk(request.text);
  const run: AgentRun = {
    id: `run-${crypto.randomUUID()}`,
    agentId: request.agentId,
    specialty: request.specialty,
    trigger: request.trigger,
    startedAt: now.toISOString(),
    completedAt: risk.allowed ? null : now.toISOString(),
    status: risk.allowed ? "queued" : "blocked",
    input: { text: risk.sanitizedText.slice(0, 1200), preferenceDigest: preferenceDigest(preference), explicitJob: Boolean(request.explicitJob), followup: Boolean(request.followup), ...(request.context ? { context: request.context } : {}), answerMode: resolveAnswerMode(request.profile, request.answerMode), ...(request.continuation ? { continuation: { ...request.continuation, followup: checkRisk(request.continuation.followup).sanitizedText.slice(0, 300) } } : {}), ...(request.origin ? { origin: request.origin } : {}) },
    intent: request.job ?? null,
    plan: risk.allowed ? [] : [{ id: "step-1", label: "Проверили запрос на безопасность", tool: "riskCheck", status: "blocked", detail: risk.blockedReason, connectorIds: [] }],
    toolsUsed: [],
    resultIds: [],
    newResultCount: 0,
    error: null,
    durationMs: risk.allowed ? null : 0,
    riskNotices: risk.notices,
    synthesis: null,
    progress: risk.allowed ? { manifestVersion: 0, stepsTotal: 0, stepsDone: 0, pending: [], firstModuleMs: null, deadlineAt: new Date(now.getTime() + RUN_EXECUTION_DEADLINE_MS).toISOString(), updatedAt: now.toISOString(), patch: null } : null,
  };
  await store.saveRun(sessionId, run);
  return run;
}

export async function runAgent(deps: SupervisorDeps, request: { agentId: AgentId; specialty: SpecialtyId; profile: UserProfile; trigger: RunTrigger; text?: string | null; routed?: RoutedIntent | null; job?: PortalJob | null; intent?: NormalizedIntent | null; run?: AgentRun | null; answerMode?: AnswerMode | null }): Promise<RunOutcome> {
  const now = deps.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const definition = AGENT_DEFINITIONS[request.agentId];
  const preference = effectivePreference(request.profile, request.agentId);
  const routed = request.routed ?? null;
  const created = request.run ?? null;
  const runId = created?.id ?? `run-${crypto.randomUUID()}`;
  // A pre-created run is timed from its creation (what the physician waited for).
  const started = created ? Date.parse(created.startedAt) : Date.now();
  const subscription = request.profile.subscriptions[request.agentId];

  const run: AgentRun = created
    ? { ...created, status: "running", completedAt: null, progress: progressBase(created) }
    : {
      id: runId,
      agentId: request.agentId,
      specialty: request.specialty,
      trigger: request.trigger,
      startedAt: nowIso,
      completedAt: null,
      status: "running",
      // The depth asked for (a review's «Что получить») stays on the run, so every door shows it the same way.
      input: { text: null, preferenceDigest: preferenceDigest(preference), ...(request.answerMode ? { answerMode: request.answerMode } : {}) },
      intent: request.job ?? routed?.intent ?? null,
      plan: [],
      toolsUsed: [],
      resultIds: [],
      newResultCount: 0,
      error: null,
      durationMs: null,
      riskNotices: [],
      synthesis: null,
    };
  if (created) await deps.store.saveRun(deps.sessionId, run);
  const writer = created ? progressWriter(deps, run) : null;
  await recordAgentEvent(deps.sessionId, "agent_run_started", { specialty: request.specialty, agentId: request.agentId, runId, trigger: request.trigger });

  let inputText: string | null = null;
  if (request.text?.trim()) {
    const risk = checkRisk(request.text);
    run.riskNotices = [...new Set([...run.riskNotices, ...risk.notices])];
    inputText = risk.sanitizedText.slice(0, 1200);
    run.input.text = inputText;
    if (!risk.allowed) {
      run.status = "blocked";
      run.plan = [{ id: "step-1", label: "Проверили запрос на безопасность", tool: "riskCheck", status: "blocked", detail: risk.blockedReason, connectorIds: [] }];
      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - started;
      await deps.store.saveRun(deps.sessionId, run);
      await recordAgentEvent(deps.sessionId, "agent_run_completed", { specialty: request.specialty, agentId: request.agentId, runId, status: run.status, durationMs: run.durationMs, count: 0 });
      return { run, results: [], actions: [], routed };
    }
  }

  const [materials, existing, history] = await Promise.all([
    request.agentId === "materials" || request.agentId === "learning" ? deps.store.listMaterials(deps.sessionId, request.specialty) : Promise.resolve([] as Material[]),
    deps.store.listResults(deps.sessionId, request.specialty, request.agentId),
    request.agentId === "learning" ? deps.store.listRuns(deps.sessionId, request.specialty, undefined, 60) : Promise.resolve([] as AgentRun[]),
  ]);
  const decided = run.input.context ?? null;
  const strategy = request.intent && inputText ? decideStrategy({
    text: inputText,
    specialty: request.specialty,
    job: request.intent.job.explicit ? request.intent.job.family : null,
    session: pinnedSession(decided?.entities ?? [], now),
    answered: decided?.answered ?? { id: "execution", optionId: null },
    planConfirmed: decided?.planConfirmed ?? "execution",
  }) : null;
  const ctx: AgentContext = {
    agentId: request.agentId,
    specialty: request.specialty,
    now,
    nowIso,
    profile: request.profile,
    preference: scopedPreference(preference, request.agentId, routed, request.text ?? null, request.specialty),
    lastSeenAt: subscription?.lastSeenAt ?? null,
    catalog: deps.catalog,
    materials,
    pubmed: deps.pubmed ?? (query => searchPubmedLive(query)),
    abstracts: deps.abstracts ?? (pmids => fetchPubmedAbstracts(pmids)),
    drugLabel: deps.drugLabel ?? (name => lookupDrugLabelLive(name)),
    inputText,
    job: request.job ?? null,
    // The mode persisted with the run wins: execution re-reads what the physician asked for.
    answerMode: created?.input.answerMode ?? request.answerMode ?? null,
    history: history.filter(item => item.id !== runId),
    // The intent is recompiled from the sanitized text: nothing redacted by the risk gate reaches the sources.
    // The strategy is re-decided from the same text and the context persisted at creation (never asks again).
    intent: strategy?.intent ?? (request.intent && inputText ? compileIntent(inputText, request.specialty, { job: request.intent.job.explicit ? request.intent.job.family : null }) : null),
    strategy,
    ...(deps.browserDriver !== undefined ? { browserDriver: deps.browserDriver } : {}),
    sessionId: deps.sessionId,
    progress: writer?.sink ?? null,
  };

  let executed: ExecutorResult;
  try {
    executed = await EXECUTORS[definition.id](ctx);
  } catch (error) {
    const closed = await writer?.close();
    if (closed && run.progress) run.progress = { ...run.progress, pending: [], updatedAt: new Date().toISOString(), patch: null, manifestVersion: closed.version };
    run.status = "failed";
    run.error = error instanceof Error ? error.message.slice(0, 300) : "Агент завершился с ошибкой";
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - started;
    await deps.store.saveRun(deps.sessionId, run);
    await recordAgentEvent(deps.sessionId, "agent_run_completed", { specialty: request.specialty, agentId: request.agentId, runId, status: run.status, durationMs: run.durationMs, count: 0 });
    return { run, results: [], actions: [], routed };
  }

  // Progress writes end before the final state is computed: nothing late can overwrite it.
  const closed = await writer?.close();
  const validation = validateEvidence(executed.drafts);
  // A question asked on a feed check's capability («Что нового по ХСН?») keeps its own results: it never rewrites
  // the check's findings, their reasons or what «Для вас» shows.
  const keyPrefix = request.trigger === "composer" && FEED_CHECKS.includes(request.agentId) ? `${request.agentId}:q:${runId}` : request.agentId;
  const merged = mergeResults({ drafts: validation.kept, existing, runId, now: nowIso, lastSeenAt: ctx.lastSeenAt, rehydrated: Boolean(deps.rehydrated), keyPrefix });
  await deps.store.upsertResults(deps.sessionId, merged.results);

  if (preference.delivery.includes("save")) {
    for (const result of merged.results.filter(item => !item.savedMaterialId && !item.partner && item.createdAt === nowIso)) {
      const material = materialFromResult(result, nowIso);
      await deps.store.saveMaterial(deps.sessionId, material);
      result.savedMaterialId = material.id;
    }
    await deps.store.upsertResults(deps.sessionId, merged.results);
  }

  run.plan = executed.plan;
  run.toolsUsed = executed.toolsUsed;
  run.synthesis = executed.synthesis;
  run.experience = executed.experience ?? null;
  run.execution = executed.execution ?? null;
  run.riskNotices = [...new Set([...run.riskNotices, ...executed.notices, ...validation.notes])];
  run.resultIds = merged.results.map(result => result.id);
  run.newResultCount = merged.newCount;
  if (deps.finishing) {
    merged.results = await deps.finishing({ results: merged.results, run });
    await deps.store.upsertResults(deps.sessionId, merged.results);
  }
  // The status reflects the executor's own sources; what the finishing step could read is reported per record.
  // A source the physician excluded did not fail: the answer from the rest is complete.
  run.status = executed.toolsUsed.some(use => (use.status === "unavailable" || use.status === "failed") && !EXCLUDED_IN_PROFILE.test(use.note ?? "")) ? "partial" : "completed";
  run.completedAt = new Date().toISOString();
  run.durationMs = Date.now() - started;
  if (closed) {
    const final = run.experience;
    const patch = final ? diffManifests(closed.previous?.manifest ?? null, final.manifest, { runId, manifestVersion: closed.version + 1, status: run.status === "partial" ? "partial" : "completed" }) : null;
    const changed = Boolean(patch && !isEmptyPatch(patch));
    const hasContent = Boolean(final?.manifest.modules.length);
    run.progress = {
      ...progressBase(run),
      manifestVersion: changed ? closed.version + 1 : closed.version,
      stepsDone: run.progress?.stepsTotal ?? 0,
      pending: [],
      firstModuleMs: closed.firstModuleMs ?? (hasContent ? run.durationMs : null),
      updatedAt: run.completedAt,
      patch: changed ? patch : run.progress?.patch ?? null,
    };
  }
  if (run.execution) run.execution = { ...run.execution, timings: { totalMs: run.durationMs ?? run.execution.timings.totalMs, firstModuleMs: run.progress?.firstModuleMs ?? null } };
  await deps.store.saveRun(deps.sessionId, run);

  // Shadow execution of a Skill that is not primary yet: after the answer is saved, compared, never shown.
  if (executed.shadow && run.execution) {
    try {
      const comparison = await executed.shadow();
      if (comparison) {
        run.execution = { ...run.execution, shadow: comparison };
        await deps.store.saveRun(deps.sessionId, run);
      }
    } catch {
      // A failed shadow never affects the physician's result.
    }
  }

  const actions = requestApproval({ specialty: request.specialty, agentId: request.agentId, routed, results: merged.results, now: nowIso });
  for (const action of actions) await deps.store.saveAction(deps.sessionId, action);

  await recordAgentEvent(deps.sessionId, "agent_run_completed", { specialty: request.specialty, agentId: request.agentId, runId, status: run.status, durationMs: run.durationMs, count: merged.results.length });
  return { run, results: merged.results, actions, routed };
}
