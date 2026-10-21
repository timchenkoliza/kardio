import type { RiskClass } from "./model";

export interface RiskPolicy {
  description: string;
  pathPrefixes: string[];
  pathSuffixes?: string[];
  semanticTriggers?: string[];
  requiredGates: string[];
  maxRecommendedRolloutPercent: number;
}

export const RISK_ORDER: RiskClass[] = ["R0", "R1", "R2", "R3", "R4"];

export const RISK_POLICIES: Record<RiskClass, RiskPolicy> = {
  R0: {
    description: "Copy, docs, non-functional presentation changes",
    pathPrefixes: ["docs/"],
    pathSuffixes: [".md"],
    requiredGates: ["static", "preview"],
    maxRecommendedRolloutPercent: 100,
  },
  R1: {
    description: "UI/layout/product interaction without medical or persistent-state semantics",
    pathPrefixes: ["components/", "styles/"],
    pathSuffixes: [".tsx"],
    requiredGates: ["static", "e2e", "ds_audit", "preview"],
    maxRecommendedRolloutPercent: 20,
  },
  R2: {
    description: "Agent behavior, routing, prompts, source ranking, content selection",
    pathPrefixes: ["server/agents/", "lib/agents/", "lib/portal/"],
    requiredGates: ["static", "unit", "integration", "eval", "simulation", "preview"],
    maxRecommendedRolloutPercent: 5,
  },
  R3: {
    description: "Database, migrations, API, auth, persistent state, external actions or release infrastructure",
    pathPrefixes: [
      "db/",
      "migrations/",
      "app/api/",
      "server/services/",
      "server/agents/store/",
      ".github/workflows/",
      "control-plane/",
    ],
    requiredGates: [
      "static",
      "migration",
      "unit",
      "integration",
      "e2e",
      "simulation",
      "preview",
      "human_engineering_review",
    ],
    maxRecommendedRolloutPercent: 1,
  },
  R4: {
    description: "Medical evidence policy, safety-critical behavior, claims or clinical-risk gates",
    pathPrefixes: [],
    semanticTriggers: [
      "medical_evidence",
      "drug_safety",
      "contraindication",
      "clinical_recommendation",
      "source_verification",
    ],
    requiredGates: [
      "static",
      "unit",
      "integration",
      "medical_eval",
      "adversarial_simulation",
      "live_source_smoke",
      "preview",
      "human_domain_review",
    ],
    maxRecommendedRolloutPercent: 1,
  },
};

export const UNKNOWN_CHANGE_DEFAULT: RiskClass = "R3";

export const RELEASE_STAGES = [
  { name: "preview", exposurePercent: 0 },
  { name: "canary_1", exposurePercent: 1 },
  { name: "canary_5", exposurePercent: 5 },
  { name: "cohort_20", exposurePercent: 20 },
  { name: "cohort_50", exposurePercent: 50 },
  { name: "stable", exposurePercent: 100 },
] as const;

export const PROMOTION_RULES = {
  canary_1: {
    minObservationEvents: 0,
    maxErrorRateRelativeIncrease: 0,
    maxP95LatencyRelativeIncrease: 0,
  },
  canary_5: {
    minObservationEvents: 50,
    maxErrorRateRelativeIncrease: 0.1,
    maxP95LatencyRelativeIncrease: 0.2,
  },
  cohort_20: {
    minObservationEvents: 200,
    maxErrorRateRelativeIncrease: 0.05,
    maxP95LatencyRelativeIncrease: 0.2,
    requireTargetMetricNonNegative: true,
  },
  cohort_50: {
    minObservationEvents: 500,
    maxErrorRateRelativeIncrease: 0.05,
    maxP95LatencyRelativeIncrease: 0.2,
    requireTargetMetricNonNegative: true,
  },
  stable: {
    minObservationEvents: 1000,
    maxErrorRateRelativeIncrease: 0.05,
    maxP95LatencyRelativeIncrease: 0.2,
    requireTargetMetricNonNegative: true,
    requireZeroBlockingGuardrailBreaches: true,
  },
} as const;
