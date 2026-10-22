import type { ActionRequest, AgentId, AgentResult, AgentRun, Material, MaterialCollection, UserProfile } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { LIMITS, type WorkspaceStore } from "./types";

interface Bucket {
  touchedAt: number;
  profiles: Map<SpecialtyId, UserProfile>;
  results: Map<string, AgentResult>;
  runs: Map<string, AgentRun>;
  materials: Map<string, Material>;
  collections: Map<string, MaterialCollection>;
  actions: Map<string, ActionRequest>;
}

const globals = globalThis as unknown as { kardioAgentBuckets?: Map<string, Bucket> };
const buckets = globals.kardioAgentBuckets ?? new Map<string, Bucket>();
globals.kardioAgentBuckets = buckets;

function bucket(sessionId: string): Bucket {
  let value = buckets.get(sessionId);
  if (!value) {
    if (buckets.size >= LIMITS.sessions) {
      const oldest = [...buckets.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
      if (oldest) buckets.delete(oldest[0]);
    }
    value = { touchedAt: Date.now(), profiles: new Map(), results: new Map(), runs: new Map(), materials: new Map(), collections: new Map(), actions: new Map() };
    buckets.set(sessionId, value);
  }
  value.touchedAt = Date.now();
  return value;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function trimByAgent<T extends { agentId: AgentId; specialty: SpecialtyId }>(map: Map<string, T>, limit: number, sortKey: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of map.values()) {
    const key = `${value.specialty}:${value.agentId}`;
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  for (const values of groups.values()) {
    if (values.length <= limit) continue;
    const ordered = values.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    for (const stale of ordered.slice(limit)) {
      const entry = [...map.entries()].find(([, value]) => value === stale);
      if (entry) map.delete(entry[0]);
    }
  }
}

export class MemoryWorkspaceStore implements WorkspaceStore {
  readonly kind = "memory" as const;

  async getProfile(sessionId: string, specialty: SpecialtyId) {
    const value = buckets.get(sessionId)?.profiles.get(specialty);
    return value ? clone(value) : null;
  }

  async saveProfile(sessionId: string, profile: UserProfile) {
    bucket(sessionId).profiles.set(profile.specialty, clone(profile));
  }

  async listResults(sessionId: string, specialty: SpecialtyId, agentId?: AgentId) {
    const values = [...(buckets.get(sessionId)?.results.values() ?? [])].filter(result => result.specialty === specialty && (!agentId || result.agentId === agentId));
    return clone(values.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.rank - b.rank));
  }

  async getResult(sessionId: string, id: string) {
    const value = buckets.get(sessionId)?.results.get(id);
    return value ? clone(value) : null;
  }

  async upsertResults(sessionId: string, results: readonly AgentResult[]) {
    const target = bucket(sessionId).results;
    for (const result of results) {
      const existing = [...target.values()].find(value => value.specialty === result.specialty && value.key === result.key);
      if (existing && existing.id !== result.id) target.delete(existing.id);
      target.set(result.id, clone(result));
    }
    trimByAgent(target, LIMITS.resultsPerAgent, value => value.createdAt);
  }

  async listRuns(sessionId: string, specialty: SpecialtyId, agentId?: AgentId, limit = 20) {
    const values = [...(buckets.get(sessionId)?.runs.values() ?? [])].filter(run => run.specialty === specialty && (!agentId || run.agentId === agentId));
    return clone(values.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit));
  }

  async findRunSession(id: string) {
    for (const [sessionId, value] of buckets) if (value.runs.has(id)) return sessionId;
    return null;
  }

  async getRun(sessionId: string, id: string) {
    const value = buckets.get(sessionId)?.runs.get(id);
    return value ? clone(value) : null;
  }

  async saveRun(sessionId: string, run: AgentRun) {
    const target = bucket(sessionId).runs;
    target.set(run.id, clone(run));
    trimByAgent(target, LIMITS.runsPerAgent, value => value.startedAt);
  }

  async listMaterials(sessionId: string, specialty: SpecialtyId) {
    const values = [...(buckets.get(sessionId)?.materials.values() ?? [])].filter(material => material.specialty === specialty);
    return clone(values.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async saveMaterial(sessionId: string, material: Material) {
    const target = bucket(sessionId).materials;
    target.set(material.id, clone(material));
    if (target.size > LIMITS.materials) {
      const oldest = [...target.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (oldest) target.delete(oldest.id);
    }
  }

  async deleteMaterial(sessionId: string, specialty: SpecialtyId, id: string) {
    const target = buckets.get(sessionId)?.materials;
    const value = target?.get(id);
    if (!target || !value || value.specialty !== specialty) return false;
    return target.delete(id);
  }

  async listCollections(sessionId: string, specialty: SpecialtyId) {
    return clone([...(buckets.get(sessionId)?.collections.values() ?? [])].filter(collection => collection.specialty === specialty).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async saveCollection(sessionId: string, collection: MaterialCollection) {
    bucket(sessionId).collections.set(collection.id, clone(collection));
  }

  async deleteCollection(sessionId: string, specialty: SpecialtyId, id: string) {
    const target = buckets.get(sessionId)?.collections;
    const value = target?.get(id);
    if (!target || !value || value.specialty !== specialty) return false;
    return target.delete(id);
  }

  async listActions(sessionId: string, specialty: SpecialtyId) {
    return clone([...(buckets.get(sessionId)?.actions.values() ?? [])].filter(action => action.specialty === specialty).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async getAction(sessionId: string, id: string) {
    const value = buckets.get(sessionId)?.actions.get(id);
    return value ? clone(value) : null;
  }

  async saveAction(sessionId: string, action: ActionRequest) {
    const target = bucket(sessionId).actions;
    target.set(action.id, clone(action));
    if (target.size > LIMITS.actions) {
      const oldest = [...target.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (oldest) target.delete(oldest.id);
    }
  }
}

/** Test helper: wipe one session. */
export function resetMemorySession(sessionId: string) {
  buckets.delete(sessionId);
}
