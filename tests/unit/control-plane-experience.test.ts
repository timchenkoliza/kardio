import { describe, expect, it } from "vitest";
import { validateExperienceContract } from "@/control-plane/lib/experience";
import { classifyRisk } from "@/control-plane/lib/risk";
import type { ChangeContract, ExperienceContract } from "@/control-plane/lib/model";

const baseExperience: ExperienceContract = {
  user_visible: true,
  primary_job: "reference_answer",
  impact_triggers: [],
  capability_transition: "none",
  module: { strategy: "reuse", allowed_modules: ["reference"] },
  representation: {
    primary: "SHORT_TEXT",
    secondary: ["EVIDENCE_STACK"],
    visualization: "forbidden",
    text_summary: "required",
    semantic_equivalence_required: true,
    accessibility_fallback_required: true,
  },
  stable_shell: {
    navigation_landmarks_unchanged: true,
    action_semantics_unchanged: true,
    factual_meaning_unchanged: true,
    safety_thresholds_unchanged: true,
  },
  personalization: {
    mode: "none",
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
};

function contract(experience_contract: ExperienceContract = baseExperience): ChangeContract {
  return {
    change_id: "CHG-exp",
    title: "experience change",
    problem: "reduce cognitive effort",
    hypothesis: "better representation improves task success",
    target_metric: { name: "task_success", desired_direction: "increase" },
    guardrails: [],
    experience_contract,
  };
}

describe("experience impact classification", () => {
  it("classifies result ranking as E2 and adds task-fit gates", () => {
    const result = classifyRisk({
      contract: contract({ ...baseExperience, impact_triggers: ["result_ranking_change"] }),
      changedFiles: ["server/agents/executor-reference.ts"],
      candidateSha: "candidate",
      baselineSha: "baseline",
    });
    expect(result.experience_impact).toBe("E2");
    expect(result.required_gates).toContain("task_fit_eval");
    expect(result.required_gates).toContain("representation_eval");
  });

  it("classifies a meaningful personalized capability transition as E3", () => {
    const result = classifyRisk({
      contract: contract({
        ...baseExperience,
        capability_transition: "meaningful",
        personalization: {
          ...baseExperience.personalization!,
          mode: "preference",
        },
        onboarding: {
          meaningful_capability_transition: true,
          required_when_relevant: true,
          dismissal_respected: true,
          mastery_suppresses_future_guides: true,
        },
      }),
      changedFiles: ["components/workspace/result-card.tsx"],
      candidateSha: "candidate",
      baselineSha: "baseline",
    });
    expect(result.experience_impact).toBe("E3");
    expect(result.required_gates).toContain("personalization_privacy");
    expect(result.required_gates).toContain("onboarding_eval");
  });

  it("raises navigation or action-semantic changes to E4", () => {
    const result = classifyRisk({
      contract: contract({
        ...baseExperience,
        capability_transition: "mental_model_change",
        stable_shell: {
          ...baseExperience.stable_shell!,
          navigation_landmarks_unchanged: false,
        },
      }),
      changedFiles: ["components/workspace/app-shell.tsx"],
      candidateSha: "candidate",
      baselineSha: "baseline",
    });
    expect(result.experience_impact).toBe("E4");
    expect(result.required_gates).toContain("stable_shell_eval");
    expect(result.max_recommended_rollout_percent).toBe(1);
  });

  it("fails safe to E2 when user-visible paths change without an experience contract", () => {
    const noExperience = contract();
    delete noExperience.experience_contract;
    const result = classifyRisk({
      contract: noExperience,
      changedFiles: ["components/workspace/result-card.tsx"],
      candidateSha: "candidate",
      baselineSha: "baseline",
    });
    expect(result.experience_impact).toBe("E2");
    expect(result.experience_reasons.join(" ")).toContain("without experience_contract");
  });
});

describe("experience contract validation", () => {
  it("rejects decorative chart contradictions", () => {
    const result = validateExperienceContract(contract({
      ...baseExperience,
      representation: {
        ...baseExperience.representation!,
        primary: "LINE_CHART",
        visualization: "forbidden",
      },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("visualization is forbidden");
  });

  it("requires a reason before inventing a new module", () => {
    const result = validateExperienceContract(contract({
      ...baseExperience,
      module: { strategy: "new", new_module_justification: null },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("explicit justification");
  });

  it("requires invalidation rules for structural personalization", () => {
    const result = validateExperienceContract(contract({
      ...baseExperience,
      personalization: {
        mode: "structural",
        min_confidence: 0.8,
        inferred_traits_expire: true,
        sensitive_traits_forbidden: true,
        structural_layout_change: true,
        blueprint_invalidation_triggers: [],
      },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("blueprint invalidation");
  });

  it("requires contextual onboarding for a meaningful capability transition", () => {
    const result = validateExperienceContract(contract({
      ...baseExperience,
      capability_transition: "meaningful",
      onboarding: {
        meaningful_capability_transition: true,
        required_when_relevant: false,
        dismissal_respected: true,
        mastery_suppresses_future_guides: true,
      },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("contextual onboarding");
  });
});
