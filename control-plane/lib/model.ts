export type RiskClass = "R0" | "R1" | "R2" | "R3" | "R4";
export type GateStatus = "PASS" | "FAIL" | "MISSING" | "SKIPPED";
export type DecisionStatus =
  | "BLOCK"
  | "HOLD"
  | "PREVIEW_ELIGIBLE"
  | "CANARY_ELIGIBLE"
  | "ROLLOUT_ELIGIBLE"
  | "ROLLBACK_RECOMMENDED";

export interface ChangeContract {
  change_id: string;
  title: string;
  problem: string;
  hypothesis: string;
  target_metric: {
    name: string;
    desired_direction: "increase" | "decrease" | "non_negative";
  };
  guardrails: Array<{
    name: string;
    operator: "=" | "<=" | ">=";
    threshold: number;
  }>;
  semantic_triggers?: string[];
  expected_paths?: string[];
  requested_rollout_percent?: number;
  kill_criteria?: string[];
}

export interface RiskAssessment {
  change_id: string;
  candidate_sha: string;
  baseline_sha: string;
  risk_class: RiskClass;
  reasons: string[];
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
}

export interface ReleaseDecision {
  change_id: string;
  candidate_sha: string;
  baseline_sha: string;
  risk_class: RiskClass;
  status: DecisionStatus;
  eligible_rollout_percent: number;
  current_stage: CohortMetrics["stage"];
  next_stage: CohortMetrics["stage"] | null;
  reasons: string[];
  missing_or_failed_gates: string[];
  generated_at: string;
}
