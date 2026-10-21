export type RiskClass = "R0" | "R1" | "R2" | "R3" | "R4";
export type ExperienceImpactClass = "E0" | "E1" | "E2" | "E3" | "E4";
export type GateStatus = "PASS" | "FAIL" | "MISSING" | "SKIPPED";
export type DecisionStatus =
  | "BLOCK"
  | "HOLD"
  | "PREVIEW_ELIGIBLE"
  | "CANARY_ELIGIBLE"
  | "ROLLOUT_ELIGIBLE"
  | "ROLLBACK_RECOMMENDED";

export type RepresentationMode =
  | "TEXT"
  | "SHORT_TEXT"
  | "TABLE"
  | "COMPARISON_MATRIX"
  | "BAR_CHART"
  | "LINE_CHART"
  | "AREA_CHART"
  | "SCATTER"
  | "DISTRIBUTION"
  | "TIMELINE"
  | "NETWORK_GRAPH"
  | "FLOW"
  | "TREE"
  | "DIAGRAM"
  | "MAP"
  | "IMAGE"
  | "IMAGE_GALLERY"
  | "EVIDENCE_STACK"
  | "SOURCE_TRAIL"
  | "CHECKLIST"
  | "FORM"
  | "ACTION_PANEL"
  | "INTERACTIVE_SIMULATION"
  | "HYBRID";

export interface ExperienceContract {
  user_visible: boolean;
  primary_job?: string;
  secondary_jobs?: string[];
  impact_triggers?: string[];
  capability_transition?: "none" | "incremental" | "meaningful" | "mental_model_change";
  module?: {
    strategy: "reuse" | "compose" | "new";
    allowed_modules?: string[];
    forbidden_modules?: string[];
    new_module_justification?: string | null;
  };
  representation?: {
    primary?: RepresentationMode;
    secondary?: RepresentationMode[];
    visualization: "required" | "conditional" | "forbidden";
    text_summary: "required" | "optional" | "forbidden";
    semantic_equivalence_required: boolean;
    accessibility_fallback_required: boolean;
  };
  stable_shell?: {
    navigation_landmarks_unchanged: boolean;
    action_semantics_unchanged: boolean;
    factual_meaning_unchanged: boolean;
    safety_thresholds_unchanged: boolean;
  };
  personalization?: {
    mode: "none" | "session" | "preference" | "structural";
    allowed_dimensions?: string[];
    min_confidence?: number;
    inferred_traits_expire: boolean;
    sensitive_traits_forbidden: boolean;
    structural_layout_change?: boolean;
    blueprint_invalidation_triggers?: string[];
  };
  onboarding?: {
    meaningful_capability_transition: boolean;
    required_when_relevant: boolean;
    trigger?: string;
    dismissal_respected: boolean;
    mastery_suppresses_future_guides: boolean;
  };
  cache?: {
    blueprint_cacheable: boolean;
    invalidation_triggers?: string[];
  };
  golden_set?: {
    required_cases?: string[];
    same_job_paraphrase_count?: number;
    require_default_ux_on_low_personalization_confidence?: boolean;
  };
}

export interface ExperienceManifest {
  request_id: string;
  primary_job: string;
  module_id: string;
  representation: {
    primary: RepresentationMode;
    secondary: RepresentationMode[];
    text_summary_required: boolean;
  };
  personalization: {
    applied: boolean;
    confidence: number;
    source: "session" | "preference" | "structural" | "default";
  };
  onboarding: {
    show: boolean;
    reason: string | null;
  };
  stable_shell_version: string;
  compiler_warnings: string[];
}

export interface DecisionTrace {
  request_id: string;
  change_id?: string;
  inferred_job: string;
  job_confidence: number;
  module_candidates: string[];
  selected_module: string;
  rejected_modules: string[];
  representation_candidates: RepresentationMode[];
  selected_representation: RepresentationMode;
  personalization_applied: boolean;
  personalization_confidence?: number;
  onboarding_decision: "show" | "suppress" | "defer";
  compiler_warnings: string[];
  eval_scores: Record<string, number>;
}

/** What caused a Change. Code is only one of six causes; knowledge and policy move too. */
export type ChangeCause = "code" | "source_delta" | "policy_delta" | "ranking_delta" | "experience_delta" | "taxonomy_delta";

/** Knowledge that moved: documents, versions, chunks, claims, scenarios. */
export interface KnowledgeDelta {
  sources: string[];
  documents: Array<{
    id: string;
    url: string;
    from_version: string | null;
    to_version: string;
    chunks_changed: string[];
    chunks_total: number;
  }>;
  claims_added: string[];
  claims_removed: string[];
  claim_kinds: string[];
  entities: string[];
  scenarios_stale: string[];
  scenarios_untouched: number;
}

/** Capabilities or sources that were added, removed or re-routed. */
export interface CapabilityDelta {
  capabilities: string[];
  sources_added: string[];
  sources_removed: string[];
  operations: string[];
}

/** How compiled experiences moved (before → after), per affected scenario. */
export interface ExperienceDelta {
  manifests_invalidated: string[];
  manifests_regenerated: string[];
  module_families_before: string[][];
  module_families_after: string[][];
  order_changed: boolean;
  representation_changed: boolean;
}

export interface ImplementationDelta {
  files: string[];
  candidate_sha?: string;
  baseline_sha?: string;
}

/** Explicit statements of what a Change does NOT change; each is checked by regression evaluation. */
export interface NegativeObligations {
  module_family?: boolean;
  navigation?: boolean;
  user_job?: boolean;
  source_policy?: boolean;
  onboarding?: boolean;
  representation?: boolean;
  ranking?: boolean;
  safety_thresholds?: boolean;
}
export type ObligationKey = keyof NegativeObligations;

export interface ChangeContract {
  change_id: string;
  /** Defaults to "code" when absent (pre-existing contracts). */
  cause?: ChangeCause;
  status?: "PROPOSED" | "IDEA" | "IN_PROGRESS" | "EVALUATED" | "RELEASED" | "REJECTED";
  title: string;
  problem: string | {
    user_segment?: string;
    job?: string;
    observed_failure?: string;
    evidence?: string[];
  };
  hypothesis: string;
  target_metric?: {
    name: string;
    desired_direction: "increase" | "decrease" | "non_negative";
  };
  target?: {
    primary_metric: string;
    expected_direction: "increase" | "decrease" | "non_negative";
    minimum_effect?: number | null;
  };
  guardrails: Array<{
    name?: string;
    metric?: string;
    operator: "=" | "==" | "<=" | ">=";
    threshold?: number;
    value?: number;
  }>;
  semantic_triggers?: string[];
  expected_paths?: string[];
  requested_rollout_percent?: number;
  kill_criteria?: string[];
  experience_contract?: ExperienceContract;
  knowledge_delta?: KnowledgeDelta;
  capability_delta?: CapabilityDelta;
  experience_delta?: ExperienceDelta;
  implementation_delta?: ImplementationDelta;
  /** What the Change intends to change (positive declarations). */
  changes?: Partial<Record<ObligationKey | "source_content" | "claims", boolean>>;
  /** What the Change must not change (negative obligations). */
  does_not_change?: NegativeObligations;
}

/** One compiled experience reduced to the dimensions negative obligations protect. */
export interface ExperienceSample {
  scenario: string;
  manifest_id: string;
  primary_job: string;
  module_families: string[];
  representation: string;
  stable_shell_version: string;
  source_policy_version: string;
  onboarding_shown: boolean;
  /** Document ids in display order (ranking). */
  ranking: string[];
}

export interface ObligationViolation {
  obligation: ObligationKey;
  scenario: string;
  before: string;
  after: string;
}

export interface ObligationEvaluation {
  passed: boolean;
  checked: ObligationKey[];
  violations: ObligationViolation[];
  contradictions: ObligationKey[];
}

export interface RiskAssessment {
  change_id: string;
  candidate_sha: string;
  baseline_sha: string;
  risk_class: RiskClass;
  experience_impact: ExperienceImpactClass;
  reasons: string[];
  experience_reasons: string[];
  changed_files: string[];
  required_gates: string[];
  max_recommended_rollout_percent: number;
}

export interface GateResult {
  gate: string;
  status: GateStatus;
  candidate_sha: string;
  source: string;
  summary?: string;
  artifact?: string;
}

export interface CohortMetrics {
  stage: "preview" | "canary_1" | "canary_5" | "cohort_20" | "cohort_50" | "stable";
  observation_events: number;
  error_rate_relative_increase?: number;
  p95_latency_relative_increase?: number;
  new_safety_breaches?: number;
  blocking_guardrail_breaches?: number;
  target_metric_delta?: number;
  evidence_integrity_breach?: boolean;
  destructive_migration_failure?: boolean;
  auth_or_access_control_regression?: boolean;
  sustained_5xx_spike?: boolean;
  simulation_mismatch_seen_in_prod?: boolean;
  stable_shell_regression?: boolean;
  personalization_privacy_breach?: boolean;
  onboarding_regression?: boolean;
}

export interface ReleaseDecision {
  change_id: string;
  candidate_sha: string;
  baseline_sha: string;
  risk_class: RiskClass;
  experience_impact: ExperienceImpactClass;
  status: DecisionStatus;
  eligible_rollout_percent: number;
  current_stage: CohortMetrics["stage"];
  next_stage: CohortMetrics["stage"] | null;
  reasons: string[];
  missing_or_failed_gates: string[];
  generated_at: string;
}
