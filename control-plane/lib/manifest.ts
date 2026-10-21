import type { ChangeContract, DecisionTrace, ExperienceManifest } from "./model";

export interface ManifestEvaluation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function evaluateManifestAgainstChange(args: {
  contract: ChangeContract;
  manifest: ExperienceManifest;
  trace?: DecisionTrace;
}): ManifestEvaluation {
  const exp = args.contract.experience_contract;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!exp) {
    return {
      valid: false,
      errors: ["cannot evaluate user experience without experience_contract"],
      warnings,
    };
  }

  if (exp.primary_job && args.manifest.primary_job !== exp.primary_job) {
    errors.push(`primary job drift: expected ${exp.primary_job}, got ${args.manifest.primary_job}`);
  }

  const allowed = exp.module?.allowed_modules ?? [];
  const forbidden = exp.module?.forbidden_modules ?? [];
  if (allowed.length && !allowed.includes(args.manifest.module_id)) {
    errors.push(`module ${args.manifest.module_id} is outside allowed module set`);
  }
  if (forbidden.includes(args.manifest.module_id)) {
    errors.push(`module ${args.manifest.module_id} is explicitly forbidden`);
  }

  const expectedPrimary = exp.representation?.primary;
  if (expectedPrimary && args.manifest.representation.primary !== expectedPrimary) {
    errors.push(`representation drift: expected ${expectedPrimary}, got ${args.manifest.representation.primary}`);
  }
  if (exp.representation?.text_summary === "required" && !args.manifest.representation.text_summary_required) {
    errors.push("required textual takeaway is missing");
  }
  if (exp.representation?.text_summary === "forbidden" && args.manifest.representation.text_summary_required) {
    errors.push("manifest requests text summary where contract forbids it");
  }

  const personalization = exp.personalization;
  if (personalization?.mode === "none" && args.manifest.personalization.applied) {
    errors.push("personalization applied although Change contract forbids it");
  }
  if (
    args.manifest.personalization.applied &&
    personalization?.min_confidence !== undefined &&
    args.manifest.personalization.confidence < personalization.min_confidence
  ) {
    errors.push(`personalization confidence ${args.manifest.personalization.confidence} is below threshold ${personalization.min_confidence}`);
  }

  const onboarding = exp.onboarding;
  if (args.manifest.onboarding.show && !onboarding?.meaningful_capability_transition) {
    errors.push("onboarding shown without a meaningful capability transition");
  }
  if (onboarding?.meaningful_capability_transition && onboarding.required_when_relevant && !args.manifest.onboarding.show) {
    warnings.push("meaningful capability has no guide in this sample; verify relevance/interruption conditions explain suppression");
  }

  if (args.trace) {
    if (args.trace.inferred_job !== args.manifest.primary_job) {
      errors.push("DecisionTrace inferred job does not match ExperienceManifest primary job");
    }
    if (args.trace.selected_module !== args.manifest.module_id) {
      errors.push("DecisionTrace selected module does not match ExperienceManifest module");
    }
    if (args.trace.selected_representation !== args.manifest.representation.primary) {
      errors.push("DecisionTrace representation does not match ExperienceManifest primary representation");
    }
    if (args.trace.personalization_applied !== args.manifest.personalization.applied) {
      errors.push("DecisionTrace personalization state does not match ExperienceManifest");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
