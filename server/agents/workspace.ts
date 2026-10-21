import type { PortalJob } from "@/lib/portal/jobs";
import { AGENT_DEFINITIONS, AGENT_ORDER, agentHref } from "@/lib/agents/definitions";
import { countLabel, DRUG_CHANGE_LABEL, plural } from "@/lib/agents/format";
import { defaultProfile, effectivePreference, isConfigured, isNewSinceLastSeen, isRunDue, normalizeProfile, withNewFlags, type EffectivePreference } from "@/lib/agents/profile";
import type { ActionRequest, AgentCardState, AgentDefinition, AgentId, AgentResult, AgentResultView, AgentRun, ConnectorDescriptor, DrugChangeType, Material, MaterialCollection, UserProfile, WorkspaceView } from "@/lib/agents/types";
import { DRUG_CHANGE_TYPES } from "@/lib/agents/types";
import { sourceLabels, topicLabels } from "@/lib/agents/vocabulary";
import type { SpecialtyId } from "@/lib/domain/types";
import { listContent, listSources } from "@/server/repositories/catalog";
import { connectorRegistry } from "./connectors";
import { runAgent, routeTask, type RunOutcome } from "./supervisor";
import { workspaceStore } from "./store";
import { isRehydrated, markRehydrationConsumed } from "./store/mirror";

/**
 * Workspace facade used by pages and route handlers. Pages read; route
 * handlers mutate. Nothing here renders UI.
 */

/** Agents whose findings are "news" for the physician; on-demand agents do not inflate counters. */
export const MONITORING_AGENTS: readonly AgentId[] = ["whats_new", "guidelines", "drugs", "events"];

export const AGENT_CONNECTORS: Record<AgentId, string[]> = {
  reference: ["pubmed", "openfda-labels", "regulatory-news", "grls", "catalog"],
  whats_new: ["catalog", "pubmed", "esc-guidelines", "regulatory-news", "partner-channel"],
  guidelines: ["catalog", "esc-guidelines"],
  drugs: ["regulatory-news", "grls", "pubmed", "journals", "partner-channel"],
  research: ["catalog", "pubmed", "journals", "web"],
  events: ["events-listings", "nmo-portal", "rko-account", "telegram", "calendar-ics", "calendar-direct", "email", "partner-channel"],
  learning: ["catalog", "esc-guidelines", "events-listings", "nmo-portal"],
  materials: ["user-uploads"],
};

export async function loadProfile(sessionId: string | null, specialty: SpecialtyId): Promise<UserProfile> {
  if (!sessionId) return defaultProfile(specialty);
  const stored = await workspaceStore().getProfile(sessionId, specialty);
  return stored ? normalizeProfile(stored, specialty) : defaultProfile(specialty);
}

/** Results produced by the latest run are the agent's current findings. */
export function currentResults(results: readonly AgentResult[], latestRun: AgentRun | null): AgentResult[] {
  if (!latestRun) return [];
  const ids = new Set(latestRun.resultIds);
  return results.filter(result => ids.has(result.id) && !result.dismissed).sort((a, b) => a.rank - b.rank || b.createdAt.localeCompare(a.createdAt));
}

function eventStillRelevant(result: AgentResult, now: Date): boolean {
  if (result.kind !== "event" || typeof result.attributes.endDate !== "string") return true;
  return new Date(`${result.attributes.endDate}T23:59:59Z`).getTime() >= now.getTime();
}

export function buildCard(args: { definition: AgentDefinition; profile: UserProfile; specialty: SpecialtyId; latestRun: AgentRun | null; current: readonly AgentResult[]; now?: Date }): AgentCardState {
  const { definition, profile, specialty, latestRun } = args;
  const now = args.now ?? new Date();
  const subscription = profile.subscriptions[definition.id];
  const preference = effectivePreference(profile, definition.id);
  const current = args.current.filter(result => eventStillRelevant(result, now));
  const organic = current.filter(result => !result.partner);
  const tracksNew = MONITORING_AGENTS.includes(definition.id);
  const fresh = tracksNew ? organic.filter(result => isNewSinceLastSeen(result, subscription.lastSeenAt)) : [];
  const href = agentHref(specialty, definition.id);
  const topics = topicLabels(specialty, preference.topics);
  const reasons = [topics.length ? `Темы: ${topics.slice(0, 3).join(", ")}${topics.length > 3 ? ` и ещё ${topics.length - 3}` : ""}` : null, preference.trustedSources.length ? `Источники: ${sourceLabels(preference.trustedSources).slice(0, 3).join(", ")}` : null].filter((value): value is string => Boolean(value));

  let state: AgentCardState["state"];
  if (!subscription.enabled) state = "disabled";
  else if (!isConfigured(profile) && definition.id !== "materials" && definition.id !== "research" && definition.id !== "reference") state = "needs_setup";
  else if (latestRun?.status === "failed" || latestRun?.status === "blocked") state = "failed";
  else if (!latestRun) state = "ready";
  else if (fresh.length) state = "fresh";
  else state = isRunDue(profile, definition.id, now) ? "stale" : "ready";

  const breakdown: Array<{ label: string; count: number }> = [];
  let headline: string;
  const pool = subscription.lastSeenAt ? fresh : organic;
  const sinceVisit = Boolean(subscription.lastSeenAt);

  switch (definition.id) {
    case "whats_new":
      headline = !latestRun ? "Соберёт сводку по вашим темам" : sinceVisit ? (fresh.length ? `${countLabel(fresh.length, ["значимое обновление", "значимых обновления", "значимых обновлений"])} с вашего прошлого визита` : "С прошлого визита нового нет") : `${countLabel(organic.length, ["находка", "находки", "находок"])} по вашим темам`;
      for (const [kind, label] of [["update", "Публикации"], ["guideline_change", "Рекомендации"], ["drug_change", "Препараты"]] as const) {
        const value = pool.filter(result => result.kind === kind).length;
        if (value) breakdown.push({ label, count: value });
      }
      break;
    case "guidelines": {
      const changes = pool.filter(result => result.category !== "needs_check");
      const bySociety = new Map<string, number>();
      for (const result of changes) bySociety.set(String(result.attributes.society ?? "Другие"), (bySociety.get(String(result.attributes.society ?? "Другие")) ?? 0) + 1);
      for (const [society, value] of bySociety) breakdown.push({ label: society, count: value });
      const top = [...bySociety.entries()].sort((a, b) => b[1] - a[1])[0];
      const checks = organic.filter(result => result.category === "needs_check").length;
      headline = !latestRun ? "Сравнит версии рекомендаций по вашим темам" : top ? `${top[0]}: ${countLabel(top[1], ["изменение", "изменения", "изменений"])}, ${top[1] === 1 ? "которое может" : "которые могут"} повлиять на практику` : checks ? `${countLabel(checks, ["версия требует", "версии требуют", "версий требуют"])} проверки актуальности` : sinceVisit ? "С прошлого визита новых версий нет" : "Новых версий по вашим темам нет";
      if (checks) breakdown.push({ label: "Проверить актуальность", count: checks });
      break;
    }
    case "drugs": {
      const counts = new Map<DrugChangeType, number>();
      for (const result of pool) if (result.category && DRUG_CHANGE_TYPES.includes(result.category as DrugChangeType)) counts.set(result.category as DrugChangeType, (counts.get(result.category as DrugChangeType) ?? 0) + 1);
      for (const type of DRUG_CHANGE_TYPES) {
        const value = counts.get(type);
        if (value) breakdown.push({ label: DRUG_CHANGE_LABEL[type].title, count: value });
      }
      headline = !latestRun ? "Отследит регистрации, ограничения и исследования" : breakdown.length ? DRUG_CHANGE_TYPES.filter(type => counts.get(type)).map(type => countLabel(counts.get(type) ?? 0, DRUG_CHANGE_LABEL[type].forms)).join(" • ") : sinceVisit ? "С прошлого просмотра изменений нет" : "Изменений по вашим темам не найдено";
      break;
    }
    case "events": {
      const upcoming = organic.length;
      headline = !latestRun ? "Найдёт события по вашим темам и формату" : upcoming ? `${countLabel(upcoming, ["подходящее мероприятие", "подходящих мероприятия", "подходящих мероприятий"])} в ближайшие ${preference.horizonDays} ${plural(preference.horizonDays, ["день", "дня", "дней"])}` : "Подходящих событий в выбранный период нет";
      const online = organic.filter(result => result.attributes.online === true).length;
      if (online) breakdown.push({ label: "Онлайн", count: online });
      const nmo = organic.filter(result => result.attributes.nmo === true).length;
      if (nmo) breakdown.push({ label: "С НМО", count: nmo });
      break;
    }
    case "research":
      headline = latestRun?.input.text ? `Последний вопрос: «${latestRun.input.text.slice(0, 60)}${latestRun.input.text.length > 60 ? "…" : ""}» · ${countLabel(organic.length, ["источник", "источника", "источников"])}` : "Задайте вопрос — агент соберёт проверяемый обзор";
      break;
    case "learning": {
      const done = organic.filter(result => result.attributes.done === true).length;
      headline = latestRun ? `Маршрут: ${countLabel(organic.length, ["модуль", "модуля", "модулей"])} · пройдено ${done}` : "Соберёт учебный маршрут под ваши цели";
      if (organic.length) breakdown.push({ label: "Пройдено", count: done });
      break;
    }
    case "materials":
      headline = "Ищет только в ваших документах и сохранённом";
      break;
    case "reference":
      headline = latestRun?.input.text ? `Последний вопрос: «${latestRun.input.text.slice(0, 60)}${latestRun.input.text.length > 60 ? "…" : ""}»` : "Ответ по источникам на профессиональный вопрос";
      break;
  }

  const primaryLabel: Record<AgentId, string> = {
    reference: "Задать вопрос",
    whats_new: fresh.length ? "Смотреть новое" : "Открыть сводку",
    guidelines: "Смотреть изменения",
    drugs: fresh.length ? "Что изменилось" : "Открыть",
    research: "Задать вопрос",
    events: "Выбрать события",
    learning: latestRun ? "Продолжить" : "Собрать маршрут",
    materials: "Открыть материалы",
  };

  return {
    agentId: definition.id,
    enabled: subscription.enabled,
    state,
    lastRunAt: latestRun?.completedAt ?? latestRun?.startedAt ?? null,
    lastRunStatus: latestRun?.status ?? null,
    totalResults: organic.length,
    newResults: fresh.length,
    headline,
    breakdown,
    highlights: definition.id === "whats_new" ? (pool.length ? pool : organic).slice(0, 3).map(result => result.title) : [],
    reasons,
    primaryAction: { label: state === "needs_setup" ? "Настроить" : primaryLabel[definition.id], href },
  };
}

async function latestRunsByAgent(sessionId: string, specialty: SpecialtyId): Promise<Map<AgentId, AgentRun>> {
  const runs = await workspaceStore().listRuns(sessionId, specialty, undefined, 200);
  const latest = new Map<AgentId, AgentRun>();
  for (const run of runs) {
    if (run.status === "running") continue;
    if (run.agentId === "research" || run.agentId === "materials") {
      if (!latest.has(run.agentId)) latest.set(run.agentId, run);
      continue;
    }
    if (!latest.has(run.agentId)) latest.set(run.agentId, run);
  }
  return latest;
}

export async function getWorkspaceView(sessionId: string | null, specialty: SpecialtyId): Promise<WorkspaceView> {
  const profile = await loadProfile(sessionId, specialty);
  const store = workspaceStore();
  const [results, latest, materials, actions] = sessionId
    ? await Promise.all([store.listResults(sessionId, specialty), latestRunsByAgent(sessionId, specialty), store.listMaterials(sessionId, specialty), store.listActions(sessionId, specialty)])
    : [[] as AgentResult[], new Map<AgentId, AgentRun>(), [] as Material[], [] as ActionRequest[]];
  const now = new Date();
  const cards = AGENT_ORDER.map(agentId => {
    const latestRun = latest.get(agentId) ?? null;
    const current = currentResults(results.filter(result => result.agentId === agentId), latestRun);
    const card = buildCard({ definition: AGENT_DEFINITIONS[agentId], profile, specialty, latestRun, current, now });
    if (agentId === "materials") {
      const uploaded = materials.filter(material => material.ownership === "USER_UPLOADED").length;
      card.headline = materials.length ? `${countLabel(materials.length, ["материал", "материала", "материалов"])} · ${countLabel(uploaded, ["ваш файл или заметка", "ваших файла или заметки", "ваших файлов и заметок"])}` : "Добавьте документы — агент будет искать только в них";
      card.totalResults = materials.length;
    }
    return card;
  });
  const seenTitles = new Set<string>();
  const recent = withNewFlags(
    MONITORING_AGENTS.flatMap(agentId => currentResults(results.filter(result => result.agentId === agentId), latest.get(agentId) ?? null))
      .filter(result => !result.partner && eventStillRelevant(result, now)),
    profile,
  )
    .sort((a, b) => Number(b.newSinceLastSeen) - Number(a.newSinceLastSeen) || MONITORING_AGENTS.indexOf(a.agentId) - MONITORING_AGENTS.indexOf(b.agentId) || a.rank - b.rank)
    .filter(result => {
      const key = result.title.toLocaleLowerCase("ru-RU");
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .slice(0, 6);
  return {
    specialty,
    profile,
    cards,
    recentResults: recent,
    materialsCount: materials.length,
    pendingActions: actions.filter(action => action.status === "pending_confirmation").length,
    configured: isConfigured(profile),
  };
}

export interface AgentDetailView {
  definition: AgentDefinition;
  profile: UserProfile;
  preference: EffectivePreference;
  card: AgentCardState;
  results: AgentResultView[];
  partner: AgentResultView[];
  runs: AgentRun[];
  selectedRun: AgentRun | null;
  actions: ActionRequest[];
  connectors: ConnectorDescriptor[];
}

export async function getAgentDetail(sessionId: string | null, specialty: SpecialtyId, agentId: AgentId, options: { runId?: string | null } = {}): Promise<AgentDetailView> {
  const profile = await loadProfile(sessionId, specialty);
  const store = workspaceStore();
  const definition = AGENT_DEFINITIONS[agentId];
  const [results, runs, actions] = sessionId
    ? await Promise.all([store.listResults(sessionId, specialty, agentId), store.listRuns(sessionId, specialty, agentId, 20), store.listActions(sessionId, specialty)])
    : [[] as AgentResult[], [] as AgentRun[], [] as ActionRequest[]];
  const finished = runs.filter(run => run.status !== "running");
  const selectedRun = (options.runId ? finished.find(run => run.id === options.runId) : null) ?? finished[0] ?? null;
  const now = new Date();
  const current = currentResults(results, selectedRun).filter(result => eventStillRelevant(result, now));
  const views = withNewFlags(current, profile).map(result => ({ ...result, newSinceLastSeen: MONITORING_AGENTS.includes(agentId) && result.newSinceLastSeen }));
  const registry = connectorRegistry();
  return {
    definition,
    profile,
    preference: effectivePreference(profile, agentId),
    card: buildCard({ definition, profile, specialty, latestRun: finished[0] ?? null, current: currentResults(results, finished[0] ?? null), now }),
    results: views.filter(result => !result.partner),
    partner: views.filter(result => result.partner),
    runs: finished,
    selectedRun,
    actions: actions.filter(action => action.agentId === agentId),
    connectors: AGENT_CONNECTORS[agentId].map(id => registry.find(connector => connector.id === id)).filter((value): value is ConnectorDescriptor => Boolean(value)),
  };
}

export interface MaterialsView {
  profile: UserProfile;
  materials: Material[];
  collections: MaterialCollection[];
  lastAnswer: AgentRun | null;
  answerResults: AgentResultView[];
}

export async function getMaterialsView(sessionId: string | null, specialty: SpecialtyId, runId?: string | null): Promise<MaterialsView> {
  const profile = await loadProfile(sessionId, specialty);
  if (!sessionId) return { profile, materials: [], collections: [], lastAnswer: null, answerResults: [] };
  const store = workspaceStore();
  const [materials, collections, runs, results] = await Promise.all([store.listMaterials(sessionId, specialty), store.listCollections(sessionId, specialty), store.listRuns(sessionId, specialty, "materials", 5), store.listResults(sessionId, specialty, "materials")]);
  const lastAnswer = (runId ? runs.find(run => run.id === runId) : null) ?? runs.find(run => run.input.text) ?? null;
  return { profile, materials, collections, lastAnswer, answerResults: withNewFlags(currentResults(results, lastAnswer), profile).map(result => ({ ...result, newSinceLastSeen: false })) };
}

export async function catalogFor(specialty: SpecialtyId) {
  const [content, sources] = await Promise.all([listContent(specialty), listSources(specialty)]);
  return { content, sources };
}

export async function executeRun(sessionId: string, specialty: SpecialtyId, agentId: AgentId, options: { trigger: "manual" | "composer" | "schedule_catchup" | "configuration"; text?: string | null; routed?: ReturnType<typeof routeTask> | null; job?: PortalJob | null }): Promise<RunOutcome> {
  const store = workspaceStore();
  const profile = await loadProfile(sessionId, specialty);
  const catalog = await catalogFor(specialty);
  const rehydrated = isRehydrated(sessionId, specialty);
  const outcome = await runAgent({ store, sessionId, catalog, rehydrated }, { agentId, specialty, profile, trigger: options.trigger, text: options.text, routed: options.routed, job: options.job ?? null });
  if (rehydrated) markRehydrationConsumed(sessionId, specialty);
  const fresh = await loadProfile(sessionId, specialty);
  fresh.subscriptions[agentId] = { ...fresh.subscriptions[agentId], lastRunAt: outcome.run.completedAt ?? outcome.run.startedAt, lastRunId: outcome.run.id };
  fresh.updatedAt = new Date().toISOString();
  await store.saveProfile(sessionId, fresh);
  return outcome;
}

/** Scheduled agents catch up when the user opens the workspace. */
export async function catchUp(sessionId: string, specialty: SpecialtyId): Promise<{ ran: AgentId[] }> {
  const profile = await loadProfile(sessionId, specialty);
  const now = new Date();
  const due = AGENT_ORDER.filter(agentId => isRunDue(profile, agentId, now));
  for (const agentId of due) await executeRun(sessionId, specialty, agentId, { trigger: "schedule_catchup" });
  return { ran: due };
}
