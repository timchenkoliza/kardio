/**
 * Internal observability of the intent → evidence → experience pipeline.
 * Like the retention contract, payloads carry ids, categories, counts and
 * timings only — never the physician's text, quotes or page content.
 */
export const MESH_EVENT_NAMES = [
  "source_plan_created",
  "source_invoked",
  "source_failed",
  "evidence_graph_built",
  "experience_manifest_compiled",
  "experience_fallback_used",
  "source_delta_detected",
  "change_created",
  "change_evaluated",
] as const;
export type MeshEventName = (typeof MESH_EVENT_NAMES)[number];

export interface MeshEventPayload {
  specialty?: string;
  job?: string;
  runId?: string;
  planId?: string;
  sourceId?: string;
  operation?: string;
  requirement?: string;
  role?: string;
  outcome?: string;
  status?: string;
  execution?: string;
  durationMs?: number;
  errorCode?: string;
  steps?: number;
  invocations?: number;
  rejected?: number;
  unmet?: number;
  documents?: number;
  claims?: number;
  conflicts?: number;
  modules?: number;
  findings?: number;
  blocking?: number;
  reason?: string;
  documentId?: string;
  chunksChanged?: number;
  claimsAffected?: number;
  scenariosStale?: number;
  experiencesInvalidated?: number;
  changeId?: string;
  cause?: string;
  riskClass?: string;
  experienceImpact?: string;
  decision?: string;
  violations?: number;
}
