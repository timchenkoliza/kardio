import { describe, expect, it } from "vitest";
import { classifyRisk } from "@/control-plane/lib/risk";
import type { ChangeContract } from "@/control-plane/lib/model";

const base: ChangeContract = {
  change_id: "CHG-test",
  title: "test",
  problem: "problem",
  hypothesis: "hypothesis",
  target_metric: { name: "useful", desired_direction: "increase" },
  guardrails: [],
};

function classify(changedFiles: string[], patch: Partial<ChangeContract> = {}) {
  return classifyRisk({
    contract: { ...base, ...patch },
    changedFiles,
    candidateSha: "candidate",
    baselineSha: "baseline",
  });
}

describe("control-plane risk classifier", () => {
  it("uses highest risk label but unions UI and persistent-state gates", () => {
    const result = classify(["components/workspace/result-card.tsx", "server/agents/store/postgres.ts"]);
    expect(result.risk_class).toBe("R3");
    expect(result.required_gates).toContain("human_engineering_review");
    expect(result.required_gates).toContain("ds_audit");
    expect(result.required_gates).toContain("task_fit_eval");
    expect(result.max_recommended_rollout_percent).toBe(1);
  });

  it("keeps agent eval/simulation gates when medical semantics raise the label to R4", () => {
    const result = classify(["server/agents/executor-reference.ts"], {
      semantic_triggers: ["medical_evidence", "source_verification"],
    });
    expect(result.risk_class).toBe("R4");
    expect(result.required_gates).toContain("live_source_smoke");
    expect(result.required_gates).toContain("human_domain_review");
    expect(result.required_gates).toContain("eval");
    expect(result.required_gates).toContain("simulation");
  });

  it("fails safe to R3 for an unknown path", () => {
    const result = classify(["unknown/new-runtime.xyz"]);
    expect(result.risk_class).toBe("R3");
    expect(result.reasons.join(" ")).toContain("fail-safe default");
  });

  it("treats control-plane changes as R3 release infrastructure", () => {
    const result = classify(["control-plane/lib/decision.ts"]);
    expect(result.risk_class).toBe("R3");
    expect(result.experience_impact).toBe("E0");
  });
});
