import { AGENT_DEFINITIONS } from "@/lib/agents/definitions";
import { routeIntent, type RoutedIntent } from "@/lib/agents/intent";
import { effectivePreference, preferenceDigest } from "@/lib/agents/profile";
import { topicsMentioned } from "@/lib/agents/vocabulary";
import type { ActionRequest, AgentId, AgentResult, AgentRun, Material, PlanStep, RunTrigger, UserProfile } from "@/lib/agents/types";
import type { ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import { compileIntent, type NormalizedIntent } from "@/lib/mesh/intent";
import type { PortalJob } from "@/lib/portal/jobs";
import type { BrowserDriver } from "@/server/mesh/browser/drivers";
import { lookupDrugLabelLive, type DrugLabelResult } from "./adapters/openfda";
import { searchPubmedLive, type PubmedQuery, type PubmedSearchResult } from "./adapters/pubmed";
import { fetchPubmedAbstracts, type PubmedAbstractsResult } from "./adapters/pubmed-abstracts";
import type { AgentContext } from "./context";
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

export async function runAgent(deps: SupervisorDeps, request: { agentId: AgentId; specialty: SpecialtyId; profile: UserProfile; trigger: RunTrigger; text?: string | null; routed?: RoutedIntent | null; job?: PortalJob | null; intent?: NormalizedIntent | null }): Promise<RunOutcome> {
  const now = deps.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const started = Date.now();
  const definition = AGENT_DEFINITIONS[request.agentId];
  const preference = effectivePreference(request.profile, request.agentId);
  const routed = request.routed ?? null;
  const runId = `run-${crypto.randomUUID()}`;
  const subscription = request.profile.subscriptions[request.agentId];

  const run: AgentRun = {
    id: runId,
    agentId: request.agentId,
    specialty: request.specialty,
    trigger: request.trigger,
    startedAt: nowIso,
    completedAt: null,
    status: "running",
    input: { text: null, preferenceDigest: preferenceDigest(preference) },
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
  await recordAgentEvent(deps.sessionId, "agent_run_started", { specialty: request.specialty, agentId: request.agentId, runId, trigger: request.trigger });

  let inputText: string | null = null;
  if (request.text?.trim()) {
    const risk = checkRisk(request.text);
    run.riskNotices = risk.notices;
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
    history: history.filter(item => item.id !== runId),
    // The intent is recompiled from the sanitized text: nothing redacted by the risk gate reaches the sources.
    intent: request.intent && inputText ? compileIntent(inputText, request.specialty, { job: request.intent.job.explicit ? request.intent.job.family : null }) : null,
    ...(deps.browserDriver !== undefined ? { browserDriver: deps.browserDriver } : {}),
    sessionId: deps.sessionId,
  };

  let executed: ExecutorResult;
  try {
    executed = await EXECUTORS[definition.id](ctx);
  } catch (error) {
    run.status = "failed";
    run.error = error instanceof Error ? error.message.slice(0, 300) : "Агент завершился с ошибкой";
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - started;
    await deps.store.saveRun(deps.sessionId, run);
    await recordAgentEvent(deps.sessionId, "agent_run_completed", { specialty: request.specialty, agentId: request.agentId, runId, status: run.status, durationMs: run.durationMs, count: 0 });
    return { run, results: [], actions: [], routed };
  }

  const validation = validateEvidence(executed.drafts);
  const merged = mergeResults({ drafts: validation.kept, existing, runId, now: nowIso, lastSeenAt: ctx.lastSeenAt, rehydrated: Boolean(deps.rehydrated), keyPrefix: request.agentId });
  await deps.store.upsertResults(deps.sessionId, merged.results);

  if (preference.delivery.includes("save")) {
    for (const result of merged.results.filter(item => !item.savedMaterialId && !item.partner && item.createdAt === nowIso)) {
      const material = materialFromResult(result, nowIso);
      await deps.store.saveMaterial(deps.sessionId, material);
      result.savedMaterialId = material.id;
    }
    await deps.store.upsertResults(deps.sessionId, merged.results);
  }

  const toolStatuses = executed.toolsUsed.map(use => use.status);
  run.plan = executed.plan;
  run.toolsUsed = executed.toolsUsed;
  run.synthesis = executed.synthesis;
  run.experience = executed.experience ?? null;
  run.riskNotices = [...new Set([...run.riskNotices, ...executed.notices, ...validation.notes])];
  run.resultIds = merged.results.map(result => result.id);
  run.newResultCount = merged.newCount;
  run.status = toolStatuses.some(status => status === "unavailable" || status === "failed") ? "partial" : "completed";
  run.completedAt = new Date().toISOString();
  run.durationMs = Date.now() - started;
  await deps.store.saveRun(deps.sessionId, run);

  const actions = requestApproval({ specialty: request.specialty, agentId: request.agentId, routed, results: merged.results, now: nowIso });
  for (const action of actions) await deps.store.saveAction(deps.sessionId, action);

  await recordAgentEvent(deps.sessionId, "agent_run_completed", { specialty: request.specialty, agentId: request.agentId, runId, status: run.status, durationMs: run.durationMs, count: merged.results.length });
  return { run, results: merged.results, actions, routed };
}
