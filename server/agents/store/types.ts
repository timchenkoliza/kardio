import type { ActionRequest, AgentId, AgentResult, AgentRun, Material, MaterialCollection, UserProfile } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";

/**
 * Persistence boundary for agent workspace state. PostgreSQL when
 * DATABASE_URL is configured; otherwise a bounded in-process store (same
 * fallback model as the existing session state on Vercel).
 */
export interface WorkspaceStore {
  readonly kind: "postgres" | "memory";
  getProfile(sessionId: string, specialty: SpecialtyId): Promise<UserProfile | null>;
  saveProfile(sessionId: string, profile: UserProfile): Promise<void>;

  listResults(sessionId: string, specialty: SpecialtyId, agentId?: AgentId): Promise<AgentResult[]>;
  getResult(sessionId: string, id: string): Promise<AgentResult | null>;
  upsertResults(sessionId: string, results: readonly AgentResult[]): Promise<void>;

  listRuns(sessionId: string, specialty: SpecialtyId, agentId?: AgentId, limit?: number): Promise<AgentRun[]>;
  getRun(sessionId: string, id: string): Promise<AgentRun | null>;
  saveRun(sessionId: string, run: AgentRun): Promise<void>;

  listMaterials(sessionId: string, specialty: SpecialtyId): Promise<Material[]>;
  saveMaterial(sessionId: string, material: Material): Promise<void>;
  deleteMaterial(sessionId: string, specialty: SpecialtyId, id: string): Promise<boolean>;

  listCollections(sessionId: string, specialty: SpecialtyId): Promise<MaterialCollection[]>;
  saveCollection(sessionId: string, collection: MaterialCollection): Promise<void>;
  deleteCollection(sessionId: string, specialty: SpecialtyId, id: string): Promise<boolean>;

  listActions(sessionId: string, specialty: SpecialtyId): Promise<ActionRequest[]>;
  getAction(sessionId: string, id: string): Promise<ActionRequest | null>;
  saveAction(sessionId: string, action: ActionRequest): Promise<void>;
}

export const LIMITS = {
  resultsPerAgent: 120,
  runsPerAgent: 30,
  materials: 300,
  collections: 40,
  actions: 120,
  sessions: 5000,
} as const;
