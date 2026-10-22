import type { ChangeContract, ExperienceSample, ObligationEvaluation, ObligationKey, ObligationViolation } from "./model";

/**
 * Negative obligations: what a Change declares it does NOT change, checked
 * against compiled experiences before and after. A declaration that is both
 * «changes» and «does not change» is a contradiction and fails the contract.
 */

const DIMENSION: Record<ObligationKey, (sample: ExperienceSample) => string> = {
  module_family: sample => [...sample.module_families].sort().join(","),
  navigation: sample => sample.stable_shell_version,
  user_job: sample => sample.primary_job,
  source_policy: sample => sample.source_policy_version,
  onboarding: sample => String(sample.onboarding_shown),
  representation: sample => sample.representation,
  ranking: sample => sample.ranking.join(">"),
  safety_thresholds: () => "unchanged-by-experience-layer",
};

export function evaluateNegativeObligations(contract: ChangeContract, before: readonly ExperienceSample[], after: readonly ExperienceSample[]): ObligationEvaluation {
  const declared = (Object.entries(contract.does_not_change ?? {}) as Array<[ObligationKey, boolean | undefined]>).filter(([, value]) => value === true).map(([key]) => key);
  const contradictions = declared.filter(key => contract.changes?.[key] === true);
  const violations: ObligationViolation[] = [];
  const previous = new Map(before.map(sample => [sample.scenario, sample]));
  for (const sample of after) {
    const prior = previous.get(sample.scenario);
    if (!prior) continue;
    for (const key of declared) {
      const a = DIMENSION[key](prior);
      const b = DIMENSION[key](sample);
      if (a !== b) violations.push({ obligation: key, scenario: sample.scenario, before: a, after: b });
    }
  }
  return { passed: !violations.length && !contradictions.length, checked: declared, violations, contradictions };
}
