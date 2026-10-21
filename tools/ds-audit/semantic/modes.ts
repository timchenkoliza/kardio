/**
 * Semantic layer (advisory only). Prepared in v1, not executed: no Anthropic API calls.
 * Model ids, the reasoning parameter and prices must be checked against the Claude API
 * docs before the layer is switched on.
 */
export type SemanticMode = "pr" | "deep";

export interface SemanticModeConfig {
  mode: SemanticMode;
  maxRoutes: number;
  /** Reasoning effort label; "max" is reserved for deep mode and is never automatic. */
  effort: "medium" | "max";
  fullPageScreenshots: boolean;
  budgetEnv: string;
  automatic: boolean;
}

export const SEMANTIC_MODES: Record<SemanticMode, SemanticModeConfig> = {
  pr: { mode: "pr", maxRoutes: 4, effort: "medium", fullPageScreenshots: false, budgetEnv: "DS_AUDIT_PR_BUDGET_USD", automatic: true },
  deep: { mode: "deep", maxRoutes: 8, effort: "max", fullPageScreenshots: true, budgetEnv: "DS_AUDIT_DEEP_BUDGET_USD", automatic: false },
};

/** v1 switch: the layer stays off regardless of secrets until it is implemented and reviewed. */
export const SEMANTIC_ENABLED = false;
