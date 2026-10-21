import { RISK_ORDER, RISK_POLICIES, UNKNOWN_CHANGE_DEFAULT } from "./policy";
import type { ChangeContract, RiskAssessment, RiskClass } from "./model";

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
    reasons.push(`${UNKNOWN_CHANGE_DEFAULT}: no explicit policy match; fail-safe default`);
  }

  const riskClass = [...matched].sort((a, b) => RISK_ORDER.indexOf(b) - RISK_ORDER.indexOf(a))[0]!;
  const policy = RISK_POLICIES[riskClass];

  return {
    change_id: args.contract.change_id,
    candidate_sha: args.candidateSha,
    baseline_sha: args.baselineSha,
    risk_class: riskClass,
    reasons,
    changed_files: [...args.changedFiles].sort(),
    required_gates: [...policy.requiredGates],
    max_recommended_rollout_percent: policy.maxRecommendedRolloutPercent,
  };
}
