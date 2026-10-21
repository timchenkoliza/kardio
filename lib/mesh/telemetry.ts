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
  // Skills & Flows (ids, categories and counts only — never the physician's text).
  "intent_skill_matched",
  "intent_skill_missed",
  "intent_skill_ambiguous",
  "clarification_shown",
  "clarification_resolved",
  "intent_flow_started",
  "intent_flow_step_completed",
  "intent_flow_branch_taken",
  "experience_patch_compiled",
  "experience_patch_applied",
  "skill_candidate_created",
  "dynamic_plan_used",
  "intent_skill_shadow_compared",
  "plan_preview_shown",
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
  skillId?: string;
  skillVersion?: string;
  confidence?: number;
  mode?: string;
  flowId?: string;
  stepId?: string;
  branch?: string;
  clarificationId?: string;
  optionId?: string;
  signature?: string;
  manifestVersion?: number;
  added?: number;
  updated?: number;
  removed?: number;
  preserved?: number;
  deltaKind?: string;
  retrieval?: boolean;
  candidateId?: string;
  count?: number;
  sessions?: number;
  executionClass?: string;
  verdict?: string;
}
