import { describe, expect, it } from "vitest";
import { decideRelease } from "@/control-plane/lib/decision";
import type { GateResult, RiskAssessment } from "@/control-plane/lib/model";

function assessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    change_id: "CHG-release",
    candidate_sha: "candidate",
    baseline_sha: "baseline",
    risk_class: "R2",
    experience_impact: "E2",
    reasons: [],
    experience_reasons: [],
    changed_files: ["server/agents/example.ts"],
    required_gates: ["static", "task_fit_eval", "representation_eval", "experience_contract"],
    max_recommended_rollout_percent: 5,
    ...overrides,
  };
}

function pass(gate: string, sha = "candidate"): GateResult {
  return { gate, status: "PASS", candidate_sha: sha, source: "test" };
}

describe("control-plane release decision", () => {
  it("blocks when an E2 experience gate is missing", () => {
    const result = decideRelease({
      assessment: assessment(),
      gates: [pass("static"), pass("task_fit_eval"), pass("experience_contract")],
      now: "2026-10-21T00:00:00.000Z",
    });
    expect(result.status).toBe("BLOCK");
    expect(result.missing_or_failed_gates).toContain("representation_eval");
    expect(result.experience_impact).toBe("E2");
  });

  it("does not accept evidence produced for a different candidate SHA", () => {
    const result = decideRelease({
      assessment: assessment(),
      gates: [
        pass("static"),
        pass("task_fit_eval"),
        pass("representation_eval", "another-candidate"),
        pass("experience_contract"),
      ],
    });
    expect(result.status).toBe("BLOCK");
    expect(result.reasons.join(" ")).toContain("different candidate SHA");
  });

  it("permits only the conservative next cohort when engineering and experience gates pass", () => {
    const result = decideRelease({
      assessment: assessment(),
      gates: [pass("static"), pass("task_fit_eval"), pass("representation_eval"), pass("experience_contract")],
      metrics: { stage: "preview", observation_events: 0 },
    });
    expect(result.status).toBe("CANARY_ELIGIBLE");
    expect(result.eligible_rollout_percent).toBe(1);
    expect(result.next_stage).toBe("canary_1");
  });

  it("rolls back on a stable-shell regression even when gates are green", () => {
    const result = decideRelease({
      assessment: assessment({ experience_impact: "E4", max_recommended_rollout_percent: 1 }),
      gates: [pass("static"), pass("task_fit_eval"), pass("representation_eval"), pass("experience_contract")],
      metrics: {
        stage: "canary_1",
        observation_events: 100,
        error_rate_relative_increase: 0,
        p95_latency_relative_increase: 0,
        target_metric_delta: 0.2,
        stable_shell_regression: true,
      },
    });
    expect(result.status).toBe("ROLLBACK_RECOMMENDED");
    expect(result.reasons).toContain("stable-shell regression");
  });

  it("rolls back on personalization privacy breach before considering growth metrics", () => {
    const result = decideRelease({
      assessment: assessment({ experience_impact: "E3" }),
      gates: [pass("static"), pass("task_fit_eval"), pass("representation_eval"), pass("experience_contract")],
      metrics: {
        stage: "canary_5",
        observation_events: 1000,
        target_metric_delta: 0.5,
        personalization_privacy_breach: true,
      },
    });
    expect(result.status).toBe("ROLLBACK_RECOMMENDED");
    expect(result.eligible_rollout_percent).toBe(0);
  });
});
