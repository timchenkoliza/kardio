import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { anonymousSessions } from "@/db/schema";
import { emptyUserState, type StateCommand, type UserState } from "@/lib/domain/types";
import { getContent, getSource, listContent } from "@/server/repositories/catalog";
import { HttpError, idSchema, specialtySchema } from "@/server/http";

export const SESSION_COOKIE = "kardio_session";
const sessionIdPattern = /^[a-f0-9]{64}$/;
const item = { id: idSchema, enabled: z.boolean(), specialty: specialtySchema };
export const stateCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preferences"), specialty: specialtySchema.optional(), shell: z.enum(["explore", "practice", "workspace"]).optional() }).strict(),
  z.object({ action: z.literal("save"), ...item }).strict(),
  z.object({ action: z.literal("pin"), ...item }).strict(),
  z.object({ action: z.literal("followSource"), ...item }).strict(),
  z.object({ action: z.literal("pinSource"), ...item }).strict(),
  z.object({ action: z.literal("followTopic"), ...item }).strict(),
  z.object({ action: z.literal("recent"), entry: z.object({ kind: z.enum(["content", "source", "query"]), specialty: specialtySchema, id: idSchema.optional(), query: z.string().trim().min(1).max(160).optional() }).strict() }).strict(),
  z.object({ action: z.literal("createCollection"), name: z.string().trim().min(1).max(80), specialty: specialtySchema }).strict(),
  z.object({ action: z.literal("collectionItem"), collectionId: z.string().uuid(), contentId: idSchema, enabled: z.boolean(), specialty: specialtySchema }).strict(),
  z.object({ action: z.literal("deleteCollection"), collectionId: z.string().uuid(), specialty: specialtySchema }).strict(),
  z.object({ action: z.literal("clearHistory") }).strict(),
]);

export async function readState(sessionId?: string): Promise<UserState> {
  if (!sessionId || !sessionIdPattern.test(sessionId)) return emptyUserState();
  const [record] = await db.select().from(anonymousSessions).where(eq(anonymousSessions.id, sessionId));
  return record && Date.now() - record.updatedAt.getTime() < 180 * 86400_000 ? record.state : emptyUserState();
}
export async function ensureSession(candidate?: string): Promise<{ id: string; state: UserState; created: boolean }> {
  if (candidate && sessionIdPattern.test(candidate)) {
    const [record] = await db.select().from(anonymousSessions).where(eq(anonymousSessions.id, candidate));
    if (record && Date.now() - record.updatedAt.getTime() < 180 * 86400_000) return { id: candidate, state: record.state, created: false };
  }
  const id = randomBytes(32).toString("hex");
  const state = emptyUserState();
  await db.insert(anonymousSessions).values({ id, state, updatedAt: new Date() });
  return { id, state, created: true };
}
function toggle(values: string[], id: string, enabled: boolean) {
  if (enabled && !values.includes(id) && values.length >= 500) throw new HttpError(400, "Достигнут лимит сохранённых элементов.");
  return enabled ? [...new Set([...values, id])] : values.filter(value => value !== id);
}
async function validateReference(command: StateCommand) {
  if (command.action === "save" || command.action === "pin") {
    if (!await getContent(command.specialty, command.id)) throw new HttpError(404, "Материал не найден в этой специальности.");
  } else if (command.action === "followSource" || command.action === "pinSource") {
    if (!await getSource(command.specialty, command.id)) throw new HttpError(404, "Источник не найден в этой специальности.");
  } else if (command.action === "followTopic") {
    if (!(await listContent(command.specialty)).some(content => content.topics.includes(command.id))) throw new HttpError(404, "Тема не найдена.");
  } else if (command.action === "collectionItem") {
    if (!await getContent(command.specialty, command.contentId)) throw new HttpError(404, "Материал не найден в этой специальности.");
  } else if (command.action === "recent") {
    const entry = command.entry;
    if (entry.kind === "query" ? (!entry.query || entry.id) : (!entry.id || entry.query)) throw new HttpError(400, "Некорректная запись истории.");
    if (entry.kind === "content" && !await getContent(entry.specialty, entry.id!)) throw new HttpError(404, "Материал не найден.");
    if (entry.kind === "source" && !await getSource(entry.specialty, entry.id!)) throw new HttpError(404, "Источник не найден.");
  }
}
export async function mutateState(sessionId: string, command: StateCommand): Promise<UserState> {
  await validateReference(command);
  return db.transaction(async tx => {
    const [record] = await tx.select().from(anonymousSessions).where(eq(anonymousSessions.id, sessionId)).for("update");
    if (!record) throw new HttpError(401, "Сессия завершена. Обновите страницу.");
    const state = structuredClone(record.state);
    switch (command.action) {
      case "preferences":
        if (command.specialty) state.specialty = command.specialty;
        if (command.shell) state.shell = command.shell;
        break;
      case "save": state.savedIds = toggle(state.savedIds, command.id, command.enabled); break;
      case "pin": state.pinnedIds = toggle(state.pinnedIds, command.id, command.enabled); break;
      case "followSource": state.followedSourceIds = toggle(state.followedSourceIds, command.id, command.enabled); break;
      case "pinSource": state.pinnedSourceIds = toggle(state.pinnedSourceIds, command.id, command.enabled); break;
      case "followTopic": state.followedTopics = toggle(state.followedTopics, `${command.specialty}:${command.id}`, command.enabled); break;
      case "recent": {
        const entry = { ...command.entry, at: new Date().toISOString() };
        state.recent = [entry, ...state.recent.filter(old => !(old.specialty === entry.specialty && old.kind === entry.kind && old.id === entry.id && old.query === entry.query))].slice(0, 40);
        break;
      }
      case "createCollection":
        if (state.collections.length >= 30) throw new HttpError(400, "Можно создать до 30 подборок.");
        state.collections.push({ id: randomUUID(), specialty: command.specialty, name: command.name, contentIds: [] });
        break;
      case "collectionItem": {
        const collection = state.collections.find(value => value.id === command.collectionId && value.specialty === command.specialty);
        if (!collection) throw new HttpError(404, "Подборка не найдена.");
        collection.contentIds = toggle(collection.contentIds, command.contentId, command.enabled);
        break;
      }
      case "deleteCollection": state.collections = state.collections.filter(value => !(value.id === command.collectionId && value.specialty === command.specialty)); break;
      case "clearHistory": state.recent = []; break;
    }
    await tx.update(anonymousSessions).set({ state, updatedAt: new Date() }).where(eq(anonymousSessions.id, sessionId));
    return state;
  });
}
