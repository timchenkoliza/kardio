import { PROMOTION_RULES, RELEASE_STAGES } from "./policy";
import type { CohortMetrics, GateResult, ReleaseDecision, RiskAssessment } from "./model";

function stageIndex(stage: CohortMetrics["stage"]): number {
  return RELEASE_STAGES.findIndex(item => item.name === stage);
}

function nextStage(stage: CohortMetrics["stage"]): (typeof RELEASE_STAGES)[number] | null {
  const index = stageIndex(stage);
  return index >= 0 && index < RELEASE_STAGES.length - 1 ? RELEASE_STAGES[index + 1]! : null;
}

function immediateRollbackReasons(metrics: CohortMetrics): string[] {
  const reasons: string[] = [];
  if ((metrics.new_safety_breaches ?? 0) > 0) reasons.push("new safety breach");
  if (metrics.evidence_integrity_breach) reasons.push("evidence integrity breach");
  if (metrics.destructive_migration_failure) reasons.push("destructive migration failure");
  if (metrics.auth_or_access_control_regression) reasons.push("auth/access-control regression");
  if (metrics.sustained_5xx_spike) reasons.push("sustained 5xx spike");
  return reasons;
}

function cohortHoldReasons(metrics: CohortMetrics, target: CohortMetrics["stage"]): string[] {
  if (target === "preview") return [];
  const rule = PROMOTION_RULES[target as keyof typeof PROMOTION_RULES];
  if (!rule) return [];

  const reasons: string[] = [];
  if (metrics.observation_events < rule.minObservationEvents) {
    reasons.push(`insufficient observations: ${metrics.observation_events} < ${rule.minObservationEvents}`);
  }
  if (
    metrics.error_rate_relative_increase !== undefined &&
    metrics.error_rate_relative_increase > rule.maxErrorRateRelativeIncrease
  ) {
    reasons.push(`error-rate guardrail breached: ${metrics.error_rate_relative_increase}`);
  }
  if (
    metrics.p95_latency_relative_increase !== undefined &&
    metrics.p95_latency_relative_increase > rule.maxP95LatencyRelativeIncrease
  ) {
    reasons.push(`p95 latency guardrail breached: ${metrics.p95_latency_relative_increase}`);
  }
  if ("requireTargetMetricNonNegative" in rule && rule.requireTargetMetricNonNegative && (metrics.target_metric_delta ?? 0) < 0) {
    reasons.push(`target metric degraded: ${metrics.target_metric_delta}`);
  }
  if (
    "requireZeroBlockingGuardrailBreaches" in rule &&
    rule.requireZeroBlockingGuardrailBreaches &&
    (metrics.blocking_guardrail_breaches ?? 0) > 0
  ) {
    reasons.push("blocking product guardrail breached");
  }
  if (metrics.simulation_mismatch_seen_in_prod) reasons.push("production behavior contradicts pre-release simulation");
  return reasons;
}

export function decideRelease(args: {
  assessment: RiskAssessment;
  gates: GateResult[];
  metrics?: CohortMetrics;
  now?: string;
}): ReleaseDecision {
  const metrics: CohortMetrics = args.metrics ?? { stage: "preview", observation_events: 0 };
  const reasons: string[] = [];
  const badGates: string[] = [];

  const gateByName = new Map(args.gates.map(gate => [gate.gate, gate]));
  for (const required of args.assessment.required_gates) {
    const gate = gateByName.get(required);
    if (!gate) {
      badGates.push(required);
      reasons.push(`required gate missing: ${required}`);
      continue;
    }
    if (gate.candidate_sha !== args.assessment.candidate_sha) {
      badGates.push(required);
      reasons.push(`gate ${required} belongs to different candidate SHA`);
      continue;
    }
    if (gate.status !== "PASS") {
      badGates.push(required);
      reasons.push(`gate ${required} is ${gate.status}`);
    }
  }

  const rollback = immediateRollbackReasons(metrics);
  if (rollback.length) {
    return {
      change_id: args.assessment.change_id,
      candidate_sha: args.assessment.candidate_sha,
      baseline_sha: args.assessment.baseline_sha,
      risk_class: args.assessment.risk_class,
      status: "ROLLBACK_RECOMMENDED",
      eligible_rollout_percent: 0,
      current_stage: metrics.stage,
      next_stage: null,
      reasons: rollback,
      missing_or_failed_gates: badGates,
      generated_at: args.now ?? new Date().toISOString(),
    };
  }

  if (badGates.length) {
    return {
      change_id: args.assessment.change_id,
      candidate_sha: args.assessment.candidate_sha,
      baseline_sha: args.assessment.baseline_sha,
      risk_class: args.assessment.risk_class,
      status: "BLOCK",
      eligible_rollout_percent: 0,
      current_stage: metrics.stage,
      next_stage: null,
      reasons,
      missing_or_failed_gates: badGates,
      generated_at: args.now ?? new Date().toISOString(),
    };
  }

  const next = nextStage(metrics.stage);
  if (!next) {
    return {
      change_id: args.assessment.change_id,
      candidate_sha: args.assessment.candidate_sha,
      baseline_sha: args.assessment.baseline_sha,
      risk_class: args.assessment.risk_class,
      status: "ROLLOUT_ELIGIBLE",
      eligible_rollout_percent: 100,
      current_stage: metrics.stage,
      next_stage: null,
      reasons: ["all required gates green; already at stable stage"],
      missing_or_failed_gates: [],
      generated_at: args.now ?? new Date().toISOString(),
    };
  }

  const hold = cohortHoldReasons(metrics, next.name);
  if (hold.length) {
    return {
      change_id: args.assessment.change_id,
      candidate_sha: args.assessment.candidate_sha,
      baseline_sha: args.assessment.baseline_sha,
      risk_class: args.assessment.risk_class,
      status: "HOLD",
      eligible_rollout_percent: RELEASE_STAGES[stageIndex(metrics.stage)]!.exposurePercent,
      current_stage: metrics.stage,
      next_stage: next.name,
      reasons: hold,
      missing_or_failed_gates: [],
      generated_at: args.now ?? new Date().toISOString(),
    };
  }

  const eligible = Math.min(next.exposurePercent, args.assessment.max_recommended_rollout_percent);
  const status = metrics.stage === "preview" ? "CANARY_ELIGIBLE" : "ROLLOUT_ELIGIBLE";
  return {
    change_id: args.assessment.change_id,
    candidate_sha: args.assessment.candidate_sha,
    baseline_sha: args.assessment.baseline_sha,
    risk_class: args.assessment.risk_class,
    status,
    eligible_rollout_percent: eligible,
    current_stage: metrics.stage,
    next_stage: next.name,
    reasons: [`all required gates green; policy permits up to ${eligible}% at next step`],
    missing_or_failed_gates: [],
    generated_at: args.now ?? new Date().toISOString(),
  };
}
