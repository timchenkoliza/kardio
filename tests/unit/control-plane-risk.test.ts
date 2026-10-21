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
  it("uses the highest matching risk when UI and persistent state change together", () => {
    const result = classify(["components/workspace/result-card.tsx", "server/agents/store/postgres.ts"]);
    expect(result.risk_class).toBe("R3");
    expect(result.required_gates).toContain("human_engineering_review");
    expect(result.max_recommended_rollout_percent).toBe(1);
  });

  it("raises a code change to R4 when the product intent touches medical evidence", () => {
    const result = classify(["server/agents/executor-reference.ts"], {
      semantic_triggers: ["medical_evidence", "source_verification"],
    });
    expect(result.risk_class).toBe("R4");
    expect(result.required_gates).toContain("live_source_smoke");
    expect(result.required_gates).toContain("human_domain_review");
  });

  it("fails safe to R3 for an unknown path", () => {
    const result = classify(["unknown/new-runtime.xyz"]);
    expect(result.risk_class).toBe("R3");
    expect(result.reasons.join(" ")).toContain("fail-safe default");
  });

  it("treats control-plane changes as R3 release infrastructure", () => {
    const result = classify(["control-plane/lib/decision.ts"]);
    expect(result.risk_class).toBe("R3");
  });
});
