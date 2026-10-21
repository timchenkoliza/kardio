import { z } from "zod";
import { countLabel } from "@/lib/agents/format";
import { AGENT_IDS, type ActionRequest, type AgentId, type AgentPreference, type Material, type UserProfile } from "@/lib/agents/types";
import { CONTENT_TYPE_OPTIONS, DELIVERY_OPTIONS, FORMAT_OPTIONS, GOAL_OPTIONS, SOURCE_OPTIONS, TOPICS } from "@/lib/agents/vocabulary";
import { SPECIALTY_IDS, type SpecialtyId } from "@/lib/domain/types";
import { HttpError } from "@/server/http";
import { cancelAction, confirmAction, prepareAction } from "./services/action-confirmation";
import { materialFromLink, materialFromNote, materialFromResult } from "./services/material";
import { workspaceStore } from "./store";
import { routeTask } from "./supervisor";
import { recordAgentEvent } from "./telemetry";
import { catchUp, executeRun, loadProfile } from "./workspace";
import { PORTAL_JOBS, type PortalJob } from "@/lib/portal/jobs";
import { CLIENT_PORTAL_EVENTS } from "@/lib/portal/metrics";
import { handleAsk, recordPortalOpen } from "@/server/portal/manager";
import { recordPortalEvent } from "@/server/portal/telemetry";

const specialty = z.enum(SPECIALTY_IDS);
const agentId = z.enum(AGENT_IDS as unknown as [AgentId, ...AgentId[]]);
const topicIds = Array.from(new Set(Object.values(TOPICS).flat().map(topic => topic.id)));
const topic = z.string().refine(value => topicIds.includes(value), "Unknown topic");
const sourceId = z.string().refine(value => SOURCE_OPTIONS.some(option => option.id === value), "Unknown source");
const resultId = z.string().regex(/^res-[a-f0-9-]{36}$/);
const actionId = z.string().regex(/^act-[a-f0-9-]{36}$/);
const materialId = z.string().regex(/^mat-[a-f0-9-]{36}$/);
const collectionId = z.string().regex(/^col-[a-f0-9-]{36}$/);
const freeText = z.string().trim().min(2).max(1200);

const preferencePatch = z.object({
  topics: z.array(topic).max(16).nullable().optional(),
  contentTypes: z.array(z.enum(CONTENT_TYPE_OPTIONS.map(option => option.id) as [string, ...string[]])).max(5).optional(),
  frequency: z.enum(["important_only", "daily", "weekly"]).optional(),
  delivery: z.array(z.enum(DELIVERY_OPTIONS.map(option => option.id) as [string, ...string[]])).max(4).optional(),
  formats: z.array(z.enum(FORMAT_OPTIONS.map(option => option.id) as [string, ...string[]])).max(5).optional(),
  horizonDays: z.number().int().min(7).max(365).optional(),
  goals: z.array(z.enum(GOAL_OPTIONS.map(option => option.id) as [string, ...string[]])).max(4).optional(),
}).strict();

export const agentCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setInterests"), specialty, topics: z.array(topic).max(16), trustedSources: z.array(sourceId).max(12), excludedSources: z.array(sourceId).max(12), runAgents: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("configureAgent"), specialty, agentId, preference: preferencePatch, run: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("setAgentEnabled"), specialty, agentId, enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("runAgent"), specialty, agentId, text: freeText.optional() }).strict(),
  z.object({ action: z.literal("runTask"), specialty, text: freeText, agentId: z.union([agentId, z.literal("auto")]).optional(), materialId: materialId.optional() }).strict(),
  z.object({ action: z.literal("catchUp"), specialty }).strict(),
  z.object({ action: z.literal("ask"), specialty, text: freeText, job: z.enum(PORTAL_JOBS as unknown as [PortalJob, ...PortalJob[]]).optional(), followup: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("track"), specialty, event: z.enum(CLIENT_PORTAL_EVENTS), job: z.enum(PORTAL_JOBS as unknown as [PortalJob, ...PortalJob[]]).optional(), resultId: resultId.optional(), resultKind: z.string().regex(/^[a-z_]{2,40}$/).optional() }).strict(),
  z.object({ action: z.literal("markSeen"), specialty, agentId }).strict(),
  z.object({ action: z.literal("resetSeen"), specialty }).strict(),
  z.object({ action: z.literal("recordVisit"), specialty }).strict(),
  z.object({ action: z.literal("saveResult"), specialty, resultId }).strict(),
  z.object({ action: z.literal("dismissResult"), specialty, resultId }).strict(),
  z.object({ action: z.literal("openResult"), specialty, resultId, evidence: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("addLink"), specialty, url: z.string().trim().url().max(2000).refine(value => /^https?:\/\//i.test(value), "HTTP(S) only"), title: z.string().trim().max(200).optional(), note: z.string().trim().max(4000).optional() }).strict(),
  z.object({ action: z.literal("addNote"), specialty, title: z.string().trim().min(1).max(200), note: z.string().trim().min(2).max(20000) }).strict(),
  z.object({ action: z.literal("deleteMaterial"), specialty, materialId }).strict(),
  z.object({ action: z.literal("createCollection"), specialty, name: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal("deleteCollection"), specialty, collectionId }).strict(),
  z.object({ action: z.literal("collectionItem"), specialty, collectionId, materialId, enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("prepareAction"), specialty, kind: z.enum(["calendar_write", "registration", "email", "external_link"]), resultIds: z.array(resultId).min(1).max(12), url: z.string().url().max(2000).optional() }).strict(),
  z.object({ action: z.literal("confirmAction"), specialty, actionId }).strict(),
  z.object({ action: z.literal("cancelAction"), specialty, actionId }).strict(),
  z.object({ action: z.literal("setPartnerContent"), specialty, enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("learningProgress"), specialty, resultId, done: z.boolean() }).strict(),
]);
export type AgentCommand = z.infer<typeof agentCommandSchema>;

export interface CommandResult {
  ok: true;
  profileChanged: boolean;
  runId?: string;
  agentId?: AgentId;
  ran?: AgentId[];
  action?: ActionRequest;
  actions?: ActionRequest[];
  material?: Material;
  notices?: string[];
  redirect?: string;
}

async function saveProfile(sessionId: string, profile: UserProfile) {
  profile.updatedAt = new Date().toISOString();
  await workspaceStore().saveProfile(sessionId, profile);
}

function filterTopics(specialtyId: SpecialtyId, values: readonly string[] | null | undefined): string[] {
  const allowed = new Set(TOPICS[specialtyId].map(item => item.id));
  return [...new Set((values ?? []).filter(value => allowed.has(value)))];
}

async function resultFor(sessionId: string, specialtyId: SpecialtyId, id: string) {
  const result = await workspaceStore().getResult(sessionId, id);
  if (!result || result.specialty !== specialtyId) throw new HttpError(404, "Результат не найден.");
  return result;
}

export async function executeAgentCommand(sessionId: string, command: AgentCommand): Promise<CommandResult> {
  const store = workspaceStore();
  const now = new Date().toISOString();
  const specialtyId = command.specialty as SpecialtyId;

  switch (command.action) {
    case "setInterests": {
      const profile = await loadProfile(sessionId, specialtyId);
      profile.interests = {
        topics: filterTopics(specialtyId, command.topics),
        trustedSources: [...new Set(command.trustedSources)].filter(id => !command.excludedSources.includes(id)),
        excludedSources: [...new Set(command.excludedSources)],
      };
      const before = new Set((await loadProfile(sessionId, specialtyId)).interests.topics);
      profile.configuredAt ??= now;
      await saveProfile(sessionId, profile);
      await recordAgentEvent(sessionId, "agent_configured", { specialty: specialtyId, agentId: "all", count: profile.interests.topics.length });
      const added = profile.interests.topics.filter(topicId => !before.has(topicId));
      for (const topicId of added) await recordPortalEvent(sessionId, "topic_signal_added", { specialty: specialtyId, signal: topicId });
      const ran = command.runAgents ? (await catchUpAll(sessionId, specialtyId)) : [];
      return { ok: true, profileChanged: true, ran };
    }
    case "configureAgent": {
      const profile = await loadProfile(sessionId, specialtyId);
      const current = profile.preferences[command.agentId];
      const patch = command.preference;
      const next: AgentPreference = {
        ...current,
        ...(patch.topics !== undefined ? { topics: patch.topics === null ? null : filterTopics(specialtyId, patch.topics) } : {}),
        ...(patch.contentTypes ? { contentTypes: patch.contentTypes as AgentPreference["contentTypes"] } : {}),
        ...(patch.frequency ? { frequency: patch.frequency } : {}),
        ...(patch.delivery ? { delivery: patch.delivery as AgentPreference["delivery"] } : {}),
        ...(patch.formats ? { formats: patch.formats as AgentPreference["formats"] } : {}),
        ...(patch.horizonDays ? { horizonDays: patch.horizonDays } : {}),
        ...(patch.goals ? { goals: patch.goals as AgentPreference["goals"] } : {}),
      };
      profile.preferences[command.agentId] = next;
      await saveProfile(sessionId, profile);
      await recordAgentEvent(sessionId, "agent_configured", { specialty: specialtyId, agentId: command.agentId });
      if (command.run) {
        const outcome = await executeRun(sessionId, specialtyId, command.agentId, { trigger: "configuration" });
        return { ok: true, profileChanged: true, runId: outcome.run.id, agentId: command.agentId };
      }
      return { ok: true, profileChanged: true };
    }
    case "setAgentEnabled": {
      const profile = await loadProfile(sessionId, specialtyId);
      profile.subscriptions[command.agentId] = { ...profile.subscriptions[command.agentId], enabled: command.enabled, updatedAt: now };
      await saveProfile(sessionId, profile);
      await recordAgentEvent(sessionId, "agent_configured", { specialty: specialtyId, agentId: command.agentId, status: command.enabled ? "enabled" : "disabled" });
      return { ok: true, profileChanged: true };
    }
    case "runAgent": {
      const outcome = await executeRun(sessionId, specialtyId, command.agentId, { trigger: "manual", text: command.text ?? null });
      return { ok: true, profileChanged: true, runId: outcome.run.id, agentId: command.agentId, notices: outcome.run.riskNotices };
    }
    case "runTask": {
      const preferred = command.agentId && command.agentId !== "auto" ? command.agentId : null;
      const routed = routeTask(command.text, specialtyId, { preferred, hasAttachment: Boolean(command.materialId) });
      const outcome = await executeRun(sessionId, specialtyId, routed.agentId, { trigger: "composer", text: command.text, routed });
      return { ok: true, profileChanged: true, runId: outcome.run.id, agentId: routed.agentId, actions: outcome.actions, notices: outcome.run.riskNotices };
    }
    case "ask": {
      const outcome = await handleAsk(sessionId, specialtyId, command.text, { job: command.job ?? null, followup: command.followup });
      return { ok: true, profileChanged: true, runId: outcome.runId, agentId: outcome.agentId, actions: outcome.actions, notices: outcome.notices, redirect: outcome.href };
    }
    case "track": {
      await recordPortalEvent(sessionId, command.event, { specialty: specialtyId, ...(command.job ? { job: command.job } : {}), ...(command.resultId ? { resultId: command.resultId } : {}), ...(command.resultKind ? { resultKind: command.resultKind } : {}) });
      return { ok: true, profileChanged: false };
    }
    case "catchUp": {
      const result = await catchUp(sessionId, specialtyId);
      return { ok: true, profileChanged: result.ran.length > 0, ran: result.ran };
    }
    case "markSeen": {
      const profile = await loadProfile(sessionId, specialtyId);
      profile.subscriptions[command.agentId] = { ...profile.subscriptions[command.agentId], lastSeenAt: now };
      await saveProfile(sessionId, profile);
      await recordAgentEvent(sessionId, "agent_opened", { specialty: specialtyId, agentId: command.agentId });
      return { ok: true, profileChanged: true };
    }
    case "resetSeen": {
      const profile = await loadProfile(sessionId, specialtyId);
      for (const id of AGENT_IDS) profile.subscriptions[id] = { ...profile.subscriptions[id], lastSeenAt: null };
      await saveProfile(sessionId, profile);
      return { ok: true, profileChanged: true };
    }
    case "recordVisit": {
      // Portal open: anchors the retention cohort and records return sessions.
      const { returning } = await recordPortalOpen(sessionId, specialtyId);
      return { ok: true, profileChanged: returning };
    }
    case "saveResult": {
      const result = await resultFor(sessionId, specialtyId, command.resultId);
      if (result.savedMaterialId) return { ok: true, profileChanged: false };
      const material = materialFromResult(result, now);
      await store.saveMaterial(sessionId, material);
      await store.upsertResults(sessionId, [{ ...result, savedMaterialId: material.id }]);
      await recordAgentEvent(sessionId, "material_saved", { specialty: specialtyId, agentId: result.agentId, resultId: result.id });
      await recordPortalEvent(sessionId, "result_saved", { specialty: specialtyId, resultId: result.id, resultKind: result.kind });
      return { ok: true, profileChanged: false, material };
    }
    case "dismissResult": {
      const result = await resultFor(sessionId, specialtyId, command.resultId);
      await store.upsertResults(sessionId, [{ ...result, dismissed: true }]);
      return { ok: true, profileChanged: false };
    }
    case "openResult": {
      const result = await resultFor(sessionId, specialtyId, command.resultId);
      await recordAgentEvent(sessionId, command.evidence ? "evidence_opened" : "agent_result_opened", { specialty: specialtyId, agentId: result.agentId, resultId: result.id });
      if (command.evidence) await recordPortalEvent(sessionId, "source_opened", { specialty: specialtyId, resultId: result.id, resultKind: result.kind });
      return { ok: true, profileChanged: false };
    }
    case "addLink": {
      const material = materialFromLink({ specialty: specialtyId, url: command.url, title: command.title, note: command.note, now });
      await store.saveMaterial(sessionId, material);
      await recordAgentEvent(sessionId, "material_saved", { specialty: specialtyId, agentId: "materials" });
      return { ok: true, profileChanged: false, material };
    }
    case "addNote": {
      const material = materialFromNote({ specialty: specialtyId, title: command.title, note: command.note, now });
      await store.saveMaterial(sessionId, material);
      await recordAgentEvent(sessionId, "material_saved", { specialty: specialtyId, agentId: "materials" });
      return { ok: true, profileChanged: false, material, notices: material.redactions.length ? ["В заметке были персональные данные — мы их замаскировали."] : [] };
    }
    case "deleteMaterial": {
      if (!await store.deleteMaterial(sessionId, specialtyId, command.materialId)) throw new HttpError(404, "Материал не найден.");
      return { ok: true, profileChanged: false };
    }
    case "createCollection": {
      const existing = await store.listCollections(sessionId, specialtyId);
      if (existing.length >= 40) throw new HttpError(400, "Можно создать до 40 подборок.");
      await store.saveCollection(sessionId, { id: `col-${crypto.randomUUID()}`, specialty: specialtyId, name: command.name, createdAt: now });
      return { ok: true, profileChanged: false };
    }
    case "deleteCollection": {
      if (!await store.deleteCollection(sessionId, specialtyId, command.collectionId)) throw new HttpError(404, "Подборка не найдена.");
      for (const material of await store.listMaterials(sessionId, specialtyId)) {
        if (material.collectionIds.includes(command.collectionId)) await store.saveMaterial(sessionId, { ...material, collectionIds: material.collectionIds.filter(id => id !== command.collectionId) });
      }
      return { ok: true, profileChanged: false };
    }
    case "collectionItem": {
      const [collections, materials] = await Promise.all([store.listCollections(sessionId, specialtyId), store.listMaterials(sessionId, specialtyId)]);
      if (!collections.some(collection => collection.id === command.collectionId)) throw new HttpError(404, "Подборка не найдена.");
      const material = materials.find(item => item.id === command.materialId);
      if (!material) throw new HttpError(404, "Материал не найден.");
      const collectionIds = command.enabled ? [...new Set([...material.collectionIds, command.collectionId])] : material.collectionIds.filter(id => id !== command.collectionId);
      await store.saveMaterial(sessionId, { ...material, collectionIds });
      return { ok: true, profileChanged: false };
    }
    case "prepareAction": {
      const results = await Promise.all(command.resultIds.map(id => resultFor(sessionId, specialtyId, id)));
      const first = results[0];
      const kind = command.kind;
      const url = command.url ?? (typeof first.attributes.registrationUrl === "string" ? first.attributes.registrationUrl : first.source.sourceUrl ?? undefined);
      if ((kind === "registration" || kind === "external_link") && !url) throw new HttpError(400, "У результата нет ссылки для перехода.");
      if (kind === "registration" && url && !results.some(result => result.attributes.registrationUrl === url || result.source.sourceUrl === url)) throw new HttpError(400, "Ссылка не относится к выбранному событию.");
      const titles: Record<typeof kind, string> = {
        calendar_write: results.length === 1 ? `Добавить в календарь: ${first.title}` : `Добавить в календарь: ${countLabel(results.length, ["событие", "события", "событий"])}`,
        registration: `Регистрация: ${first.title}`,
        email: results.length === 1 ? `Письмо себе: ${first.title}` : `Письмо себе: ${countLabel(results.length, results.every(result => result.kind === "event") ? ["событие", "события", "событий"] : ["находка", "находки", "находок"])}`,
        external_link: `Открыть источник: ${first.source.source}`,
      };
      const effects: Record<typeof kind, string> = {
        calendar_write: "Скачается файл .ics с напоминаниями за сутки и за час. В ваш календарь ничего не запишется, пока вы сами не откроете файл.",
        registration: "Откроется страница организатора. Зарегистрироваться от вашего имени агент не может — заполните форму сами.",
        email: "Откроется черновик в вашей почтовой программе. Агент ничего не отправляет сам.",
        external_link: "Откроется внешняя страница. Проверяйте даты и формулировки на ней.",
      };
      const action = prepareAction({
        specialty: specialtyId,
        kind,
        title: titles[kind],
        description: results.map(result => `${result.title} — ${result.summary}`).join("\n"),
        effect: effects[kind],
        agentId: first.agentId,
        results,
        payload: kind === "email" ? { subject: titles.email, body: results.map(result => `${result.title}\n${result.summary}\n${result.source.sourceUrl ?? ""}`).join("\n\n") } : url ? { url } : {},
        now,
      });
      await store.saveAction(sessionId, action);
      await recordAgentEvent(sessionId, "action_started", { specialty: specialtyId, agentId: first.agentId, actionKind: kind });
      return { ok: true, profileChanged: false, action };
    }
    case "confirmAction": {
      const action = await store.getAction(sessionId, command.actionId);
      if (!action || action.specialty !== specialtyId) throw new HttpError(404, "Действие не найдено.");
      if (action.status !== "pending_confirmation") throw new HttpError(409, "Действие уже обработано.");
      const confirmed = confirmAction(action, now);
      await store.saveAction(sessionId, confirmed);
      await recordAgentEvent(sessionId, "action_completed", { specialty: specialtyId, agentId: action.agentId ?? undefined, actionKind: action.kind, status: confirmed.status });
      return { ok: true, profileChanged: false, action: confirmed };
    }
    case "cancelAction": {
      const action = await store.getAction(sessionId, command.actionId);
      if (!action || action.specialty !== specialtyId) throw new HttpError(404, "Действие не найдено.");
      const cancelled = cancelAction(action, now);
      await store.saveAction(sessionId, cancelled);
      return { ok: true, profileChanged: false, action: cancelled };
    }
    case "setPartnerContent": {
      const profile = await loadProfile(sessionId, specialtyId);
      profile.partnerContent = command.enabled;
      await saveProfile(sessionId, profile);
      return { ok: true, profileChanged: true };
    }
    case "learningProgress": {
      const result = await resultFor(sessionId, specialtyId, command.resultId);
      if (result.agentId !== "learning") throw new HttpError(400, "Это не учебный модуль.");
      const profile = await loadProfile(sessionId, specialtyId);
      if (command.done) profile.learningProgress[result.key] = "done";
      else delete profile.learningProgress[result.key];
      await saveProfile(sessionId, profile);
      await store.upsertResults(sessionId, [{ ...result, attributes: { ...result.attributes, done: command.done } }]);
      return { ok: true, profileChanged: true };
    }
  }
}

/** After interests change, every enabled monitoring agent re-runs with the new configuration. */
async function catchUpAll(sessionId: string, specialtyId: SpecialtyId): Promise<AgentId[]> {
  const profile = await loadProfile(sessionId, specialtyId);
  const targets = (["whats_new", "guidelines", "drugs", "events", "learning"] as AgentId[]).filter(id => profile.subscriptions[id].enabled);
  for (const id of targets) await executeRun(sessionId, specialtyId, id, { trigger: "configuration" });
  return targets;
}
