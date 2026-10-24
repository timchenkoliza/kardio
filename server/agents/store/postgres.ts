import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionRequests, agentProfiles, agentResults, agentRuns, materialCollections, userMaterials } from "@/db/agent-schema";
import { maskStoredRun } from "@/server/agents/services/risk";
import type { ActionRequest, AgentId, AgentResult, AgentRun, Material, MaterialCollection, UserProfile } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { LIMITS, type WorkspaceStore } from "./types";

export class PostgresWorkspaceStore implements WorkspaceStore {
  readonly kind = "postgres" as const;

  async getProfile(sessionId: string, specialty: SpecialtyId) {
    const [row] = await db.select().from(agentProfiles).where(and(eq(agentProfiles.sessionId, sessionId), eq(agentProfiles.specialty, specialty)));
    return row?.profile ?? null;
  }

  async saveProfile(sessionId: string, profile: UserProfile) {
    await db.insert(agentProfiles).values({ sessionId, specialty: profile.specialty, profile, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [agentProfiles.sessionId, agentProfiles.specialty], set: { profile, updatedAt: new Date() } });
  }

  async listResults(sessionId: string, specialty: SpecialtyId, agentId?: AgentId) {
    const rows = await db.select({ payload: agentResults.payload }).from(agentResults)
      .where(and(eq(agentResults.sessionId, sessionId), eq(agentResults.specialty, specialty), agentId ? eq(agentResults.agentId, agentId) : undefined))
      .orderBy(desc(agentResults.createdAt))
      .limit(agentId ? LIMITS.resultsPerAgent : LIMITS.resultsPerAgent * 7);
    return rows.map(row => row.payload);
  }

  async getResult(sessionId: string, id: string) {
    const [row] = await db.select({ payload: agentResults.payload }).from(agentResults).where(and(eq(agentResults.sessionId, sessionId), eq(agentResults.id, id)));
    return row?.payload ?? null;
  }

  async upsertResults(sessionId: string, results: readonly AgentResult[]) {
    if (!results.length) return;
    await db.transaction(async tx => {
      for (const result of results) {
        await tx.insert(agentResults).values({
          id: result.id, sessionId, specialty: result.specialty, agentId: result.agentId, resultKey: result.key, runId: result.runId, kind: result.kind, createdAt: new Date(result.createdAt), payload: result,
        }).onConflictDoUpdate({
          target: [agentResults.sessionId, agentResults.specialty, agentResults.resultKey],
          set: { runId: result.runId, kind: result.kind, payload: result },
        });
      }
    });
  }

  async listRuns(sessionId: string, specialty: SpecialtyId, agentId?: AgentId, limit = 20) {
    const rows = await db.select({ payload: agentRuns.payload }).from(agentRuns)
      .where(and(eq(agentRuns.sessionId, sessionId), eq(agentRuns.specialty, specialty), agentId ? eq(agentRuns.agentId, agentId) : undefined))
      .orderBy(desc(agentRuns.startedAt))
      .limit(limit);
    return rows.map(row => maskStoredRun(row.payload));
  }

  async getRun(sessionId: string, id: string) {
    const [row] = await db.select({ payload: agentRuns.payload }).from(agentRuns).where(and(eq(agentRuns.sessionId, sessionId), eq(agentRuns.id, id)));
    return row?.payload ? maskStoredRun(row.payload) : null;
  }

  async findRunSession(id: string) {
    const [row] = await db.select({ sessionId: agentRuns.sessionId }).from(agentRuns).where(eq(agentRuns.id, id)).limit(1);
    return row?.sessionId ?? null;
  }

  async saveRun(sessionId: string, run: AgentRun) {
    await db.insert(agentRuns).values({
      id: run.id, sessionId, specialty: run.specialty, agentId: run.agentId, status: run.status, trigger: run.trigger,
      startedAt: new Date(run.startedAt), completedAt: run.completedAt ? new Date(run.completedAt) : null, durationMs: run.durationMs, payload: run,
    }).onConflictDoUpdate({ target: agentRuns.id, set: { status: run.status, completedAt: run.completedAt ? new Date(run.completedAt) : null, durationMs: run.durationMs, payload: run } });
  }

  async listMaterials(sessionId: string, specialty: SpecialtyId) {
    const rows = await db.select({ payload: userMaterials.payload }).from(userMaterials)
      .where(and(eq(userMaterials.sessionId, sessionId), eq(userMaterials.specialty, specialty)))
      .orderBy(desc(userMaterials.createdAt)).limit(LIMITS.materials);
    return rows.map(row => row.payload);
  }

  async saveMaterial(sessionId: string, material: Material) {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(userMaterials).where(and(eq(userMaterials.sessionId, sessionId), eq(userMaterials.specialty, material.specialty)));
    const exists = await db.select({ id: userMaterials.id }).from(userMaterials).where(and(eq(userMaterials.sessionId, sessionId), eq(userMaterials.id, material.id)));
    if (!exists.length && count >= LIMITS.materials) throw new Error("material_limit");
    await db.insert(userMaterials).values({ id: material.id, sessionId, specialty: material.specialty, kind: material.kind, ownership: material.ownership, title: material.title, createdAt: new Date(material.createdAt), payload: material })
      .onConflictDoUpdate({ target: userMaterials.id, set: { title: material.title, payload: material } });
  }

  async deleteMaterial(sessionId: string, specialty: SpecialtyId, id: string) {
    const rows = await db.delete(userMaterials).where(and(eq(userMaterials.sessionId, sessionId), eq(userMaterials.specialty, specialty), eq(userMaterials.id, id))).returning({ id: userMaterials.id });
    return rows.length > 0;
  }

  async listCollections(sessionId: string, specialty: SpecialtyId) {
    const rows = await db.select().from(materialCollections).where(and(eq(materialCollections.sessionId, sessionId), eq(materialCollections.specialty, specialty))).orderBy(materialCollections.createdAt);
    return rows.map(row => ({ id: row.id, specialty: row.specialty, name: row.name, createdAt: row.createdAt.toISOString() }));
  }

  async saveCollection(sessionId: string, collection: MaterialCollection) {
    await db.insert(materialCollections).values({ id: collection.id, sessionId, specialty: collection.specialty, name: collection.name, createdAt: new Date(collection.createdAt) })
      .onConflictDoUpdate({ target: materialCollections.id, set: { name: collection.name } });
  }

  async deleteCollection(sessionId: string, specialty: SpecialtyId, id: string) {
    const rows = await db.delete(materialCollections).where(and(eq(materialCollections.sessionId, sessionId), eq(materialCollections.specialty, specialty), eq(materialCollections.id, id))).returning({ id: materialCollections.id });
    return rows.length > 0;
  }

  async listActions(sessionId: string, specialty: SpecialtyId) {
    const rows = await db.select({ payload: actionRequests.payload }).from(actionRequests)
      .where(and(eq(actionRequests.sessionId, sessionId), eq(actionRequests.specialty, specialty)))
      .orderBy(desc(actionRequests.createdAt)).limit(LIMITS.actions);
    return rows.map(row => row.payload);
  }

  async getAction(sessionId: string, id: string) {
    const [row] = await db.select({ payload: actionRequests.payload }).from(actionRequests).where(and(eq(actionRequests.sessionId, sessionId), eq(actionRequests.id, id)));
    return row?.payload ?? null;
  }

  async saveAction(sessionId: string, action: ActionRequest) {
    await db.insert(actionRequests).values({ id: action.id, sessionId, specialty: action.specialty, kind: action.kind, status: action.status, createdAt: new Date(action.createdAt), payload: action })
      .onConflictDoUpdate({ target: actionRequests.id, set: { status: action.status, payload: action } });
  }
}
