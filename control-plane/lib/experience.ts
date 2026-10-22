import type { ChangeContract, RepresentationMode } from "./model";

const CHART_MODES = new Set<RepresentationMode>([
  "BAR_CHART", "LINE_CHART", "AREA_CHART", "SCATTER", "DISTRIBUTION", "NETWORK_GRAPH",
]);

export interface ExperienceValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateExperienceContract(contract: ChangeContract): ExperienceValidation {
  const exp = contract.experience_contract;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!exp) return { valid: true, errors, warnings: ["no experience_contract supplied"] };

  if (exp.module?.strategy === "new" && !exp.module.new_module_justification?.trim()) {
    errors.push("new module requires explicit justification");
  }

  const rep = exp.representation;
  if (rep?.primary && CHART_MODES.has(rep.primary) && rep.visualization === "forbidden") {
    errors.push("chart cannot be primary when visualization is forbidden");
  }
  if (rep && !rep.semantic_equivalence_required) {
    errors.push("representation changes must preserve semantic equivalence");
  }
  if (rep && !rep.accessibility_fallback_required) {
    errors.push("representation contract requires an accessibility fallback");
  }

  const shell = exp.stable_shell;
  if (shell && !shell.factual_meaning_unchanged && exp.capability_transition !== "mental_model_change") {
    errors.push("meaning change must be declared as mental_model_change");
  }
  if (shell && !shell.safety_thresholds_unchanged) {
    errors.push("experience layer cannot silently change safety thresholds");
  }

  const personalization = exp.personalization;
  if (personalization?.min_confidence !== undefined && (personalization.min_confidence < 0 || personalization.min_confidence > 1)) {
    errors.push("personalization min_confidence must be within [0,1]");
  }
  if (personalization && !personalization.inferred_traits_expire) {
    errors.push("inferred personalization state must expire");
  }
  if (personalization?.mode === "structural" && !personalization.blueprint_invalidation_triggers?.length) {
    errors.push("structural personalization requires blueprint invalidation triggers");
  }

  const onboarding = exp.onboarding;
  if (onboarding?.meaningful_capability_transition && !onboarding.required_when_relevant) {
    errors.push("meaningful capability transition requires contextual onboarding when relevant");
  }
  if (onboarding && !onboarding.dismissal_respected) {
    errors.push("onboarding must respect dismissal");
  }
  if (onboarding && !onboarding.mastery_suppresses_future_guides) {
    errors.push("mastery must suppress future onboarding guides");
  }
  if (onboarding && !onboarding.meaningful_capability_transition && onboarding.required_when_relevant) {
    warnings.push("onboarding requested without a meaningful capability transition");
  }

  return { valid: errors.length === 0, errors, warnings };
}
