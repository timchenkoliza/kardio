import { describe, expect, it } from "vitest";
import { evaluateManifestAgainstChange } from "@/control-plane/lib/manifest";
import type { ChangeContract, DecisionTrace, ExperienceManifest } from "@/control-plane/lib/model";

const contract: ChangeContract = {
  change_id: "CHG-manifest",
  title: "Reference answer relevance",
  problem: "irrelevant adjacent results",
  hypothesis: "ranking improves task fit",
  target_metric: { name: "task_success", desired_direction: "increase" },
  guardrails: [],
  experience_contract: {
    user_visible: true,
    primary_job: "reference_answer",
    impact_triggers: ["result_ranking_change"],
    capability_transition: "none",
    module: {
      strategy: "reuse",
      allowed_modules: ["reference"],
      forbidden_modules: ["research"],
    },
    representation: {
      primary: "SHORT_TEXT",
      secondary: ["EVIDENCE_STACK"],
      visualization: "forbidden",
      text_summary: "required",
      semantic_equivalence_required: true,
      accessibility_fallback_required: true,
    },
    personalization: {
      mode: "preference",
      min_confidence: 0.65,
      inferred_traits_expire: true,
      sensitive_traits_forbidden: true,
    },
    onboarding: {
      meaningful_capability_transition: false,
      required_when_relevant: false,
      dismissal_respected: true,
      mastery_suppresses_future_guides: true,
    },
  },
};

function manifest(patch: Partial<ExperienceManifest> = {}): ExperienceManifest {
  return {
    request_id: "request-1",
    primary_job: "reference_answer",
    module_id: "reference",
    representation: {
      primary: "SHORT_TEXT",
      secondary: ["EVIDENCE_STACK"],
      text_summary_required: true,
    },
    personalization: {
      applied: false,
      confidence: 0,
      source: "default",
    },
    onboarding: { show: false, reason: null },
    stable_shell_version: "v1",
    compiler_warnings: [],
    ...patch,
  };
}

function trace(): DecisionTrace {
  return {
    request_id: "request-1",
    change_id: "CHG-manifest",
    inferred_job: "reference_answer",
    job_confidence: 0.95,
    module_candidates: ["reference", "research"],
    selected_module: "reference",
    rejected_modules: ["research"],
    representation_candidates: ["SHORT_TEXT", "EVIDENCE_STACK"],
    selected_representation: "SHORT_TEXT",
    personalization_applied: false,
    onboarding_decision: "suppress",
    compiler_warnings: [],
    eval_scores: { taskFit: 0.95, moduleFit: 0.95 },
  };
}

describe("ExperienceManifest contract evaluation", () => {
  it("accepts a manifest that preserves job, module and representation", () => {
    const result = evaluateManifestAgainstChange({ contract, manifest: manifest(), trace: trace() });
    expect(result.valid).toBe(true);
  });

  it("blocks an opportunistic module invention/reroute", () => {
    const result = evaluateManifestAgainstChange({
      contract,
      manifest: manifest({ module_id: "research" }),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("forbidden");
  });

  it("blocks representation drift", () => {
    const result = evaluateManifestAgainstChange({
      contract,
      manifest: manifest({
        representation: { primary: "LINE_CHART", secondary: [], text_summary_required: true },
      }),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("representation drift");
  });

  it("blocks low-confidence personalization", () => {
    const result = evaluateManifestAgainstChange({
      contract,
      manifest: manifest({
        personalization: { applied: true, confidence: 0.4, source: "preference" },
      }),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("below threshold");
  });

  it("blocks onboarding spam for non-capability changes", () => {
    const result = evaluateManifestAgainstChange({
      contract,
      manifest: manifest({ onboarding: { show: true, reason: "new build" } }),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("without a meaningful capability transition");
  });

  it("requires trace and manifest to describe the same compiled experience", () => {
    const mismatched = trace();
    mismatched.selected_module = "research";
    const result = evaluateManifestAgainstChange({ contract, manifest: manifest(), trace: mismatched });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("DecisionTrace selected module");
  });
});
