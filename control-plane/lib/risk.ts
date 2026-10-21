import {
  EXPERIENCE_ORDER,
  EXPERIENCE_POLICIES,
  RISK_ORDER,
  RISK_POLICIES,
  UNKNOWN_CHANGE_DEFAULT,
  UNKNOWN_USER_VISIBLE_EXPERIENCE_DEFAULT,
} from "./policy";
import type {
  ChangeContract,
  ExperienceImpactClass,
  RiskAssessment,
  RiskClass,
} from "./model";

function matchesPath(file: string, risk: RiskClass): boolean {
  const policy = RISK_POLICIES[risk];
  if (policy.pathPrefixes.some(prefix => file.startsWith(prefix))) return true;
  if (policy.pathSuffixes?.some(suffix => file.endsWith(suffix))) return true;
  if (risk === "R3" && (file === "server/http.ts" || file.startsWith(".github/workflows/"))) return true;
  return false;
}

function matchingSemanticRisks(contract: ChangeContract): RiskClass[] {
  const triggers = new Set(contract.semantic_triggers ?? []);
  return RISK_ORDER.filter(risk => {
    const expected = RISK_POLICIES[risk].semanticTriggers ?? [];
    return expected.some(trigger => triggers.has(trigger));
  });
}

function isPotentiallyUserVisible(file: string): boolean {
  return (
    file.startsWith("components/") ||
    file.startsWith("app/") ||
    file.startsWith("server/agents/") ||
    file.startsWith("lib/agents/") ||
    file.startsWith("lib/portal/")
  );
}

function classifyExperienceImpact(contract: ChangeContract, changedFiles: string[]): {
  impact: ExperienceImpactClass;
  reasons: string[];
} {
  const experience = contract.experience_contract;
  const reasons: string[] = [];
  const matched = new Set<ExperienceImpactClass>();

  if (!experience) {
    if (changedFiles.some(isPotentiallyUserVisible)) {
      reasons.push(`${UNKNOWN_USER_VISIBLE_EXPERIENCE_DEFAULT}: user-visible paths changed without experience_contract`);
      return { impact: UNKNOWN_USER_VISIBLE_EXPERIENCE_DEFAULT, reasons };
    }
    return { impact: "E0", reasons: ["E0: no user-visible experience contract required"] };
  }

  const declaredTriggers = new Set(experience.impact_triggers ?? []);
  if (experience.user_visible) declaredTriggers.add("user_visible");
  if (experience.capability_transition === "meaningful") declaredTriggers.add("meaningful_capability");
  if (experience.capability_transition === "mental_model_change") declaredTriggers.add("mental_model_change");
  if (experience.personalization?.mode !== undefined && experience.personalization.mode !== "none") {
    declaredTriggers.add("personalization_change");
  }
  if (experience.personalization?.structural_layout_change) declaredTriggers.add("structural_layout_change");
  if (experience.onboarding?.meaningful_capability_transition) declaredTriggers.add("onboarding_change");

  const shell = experience.stable_shell;
  if (shell) {
    if (!shell.navigation_landmarks_unchanged) declaredTriggers.add("core_navigation_change");
    if (!shell.action_semantics_unchanged) declaredTriggers.add("action_semantics_change");
    if (!shell.factual_meaning_unchanged) declaredTriggers.add("factual_meaning_change");
    if (!shell.safety_thresholds_unchanged) declaredTriggers.add("safety_threshold_change");
  }

  for (const impact of EXPERIENCE_ORDER) {
    const policy = EXPERIENCE_POLICIES[impact];
    const actual = policy.triggers.filter(trigger => declaredTriggers.has(trigger));
    if (!actual.length) continue;
    matched.add(impact);
    reasons.push(`${impact}: experience trigger ${actual.join(", ")}`);
  }

  if (!matched.size) {
    matched.add(experience.user_visible ? "E1" : "E0");
    reasons.push(`${experience.user_visible ? "E1" : "E0"}: explicit experience contract without higher-impact trigger`);
  }

  const impact = [...matched].sort((a, b) => EXPERIENCE_ORDER.indexOf(b) - EXPERIENCE_ORDER.indexOf(a))[0]!;
  return { impact, reasons };
}

export function classifyRisk(args: {
  contract: ChangeContract;
  changedFiles: string[];
  candidateSha: string;
  baselineSha: string;
}): RiskAssessment {
  const matched = new Set<RiskClass>();
  const reasons: string[] = [];

  for (const file of args.changedFiles) {
    for (const risk of RISK_ORDER) {
      if (!matchesPath(file, risk)) continue;
      matched.add(risk);
      reasons.push(`${risk}: path ${file}`);
    }
  }

  for (const risk of matchingSemanticRisks(args.contract)) {
    matched.add(risk);
    const triggers = RISK_POLICIES[risk].semanticTriggers ?? [];
    const actual = (args.contract.semantic_triggers ?? []).filter(trigger => triggers.includes(trigger));
    reasons.push(`${risk}: semantic trigger ${actual.join(", ")}`);
  }

  if (!matched.size) {
    matched.add(UNKNOWN_CHANGE_DEFAULT);
    reasons.push(`${UNKNOWN_CHANGE_DEFAULT}: no explicit engineering/domain policy match; fail-safe default`);
  }

  const riskClass = [...matched].sort((a, b) => RISK_ORDER.indexOf(b) - RISK_ORDER.indexOf(a))[0]!;
  const riskPolicy = RISK_POLICIES[riskClass];
  const experience = classifyExperienceImpact(args.contract, args.changedFiles);
  const experiencePolicy = EXPERIENCE_POLICIES[experience.impact];
  const requiredGates = [...new Set([...riskPolicy.requiredGates, ...experiencePolicy.requiredGates])];

  return {
    change_id: args.contract.change_id,
    candidate_sha: args.candidateSha,
    baseline_sha: args.baselineSha,
    risk_class: riskClass,
    experience_impact: experience.impact,
    reasons,
    experience_reasons: experience.reasons,
    changed_files: [...args.changedFiles].sort(),
    required_gates: requiredGates,
    max_recommended_rollout_percent: Math.min(
      riskPolicy.maxRecommendedRolloutPercent,
      experiencePolicy.maxRecommendedRolloutPercent,
    ),
  };
}
