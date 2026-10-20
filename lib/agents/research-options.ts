export const RESEARCH_MODES = ["articles", "brief", "academic"] as const;
export type ResearchMode = (typeof RESEARCH_MODES)[number];

export const RESEARCH_SOURCE_SCOPES = ["all", "russia", "international"] as const;
export type ResearchSourceScope = (typeof RESEARCH_SOURCE_SCOPES)[number];

export const RESEARCH_CONTENT_SCOPES = ["all", "guidelines", "research"] as const;
export type ResearchContentScope = (typeof RESEARCH_CONTENT_SCOPES)[number];

export interface ResearchRunOptions {
  mode: ResearchMode;
  sourceScope: ResearchSourceScope;
  contentScope: ResearchContentScope;
}

export const DEFAULT_RESEARCH_RUN_OPTIONS: ResearchRunOptions = {
  mode: "brief",
  sourceScope: "all",
  contentScope: "all",
};

export function researchSourceScopeLabel(scope: ResearchSourceScope): string {
  if (scope === "russia") return "только РФ";
  if (scope === "international") return "только международные";
  return "РФ + международные";
}

export function researchContentScopeLabel(scope: ResearchContentScope): string {
  if (scope === "guidelines") return "только клинрекомендации";
  if (scope === "research") return "только исследования";
  return "клинрекомендации + исследования";
}
