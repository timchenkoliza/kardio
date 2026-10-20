export const RESEARCH_MODES = ["articles", "brief", "academic"] as const;
export type ResearchMode = (typeof RESEARCH_MODES)[number];

export const RESEARCH_SOURCE_SCOPES = ["all", "russia", "international"] as const;
export type ResearchSourceScope = (typeof RESEARCH_SOURCE_SCOPES)[number];

export const RESEARCH_CONTENT_SCOPES = ["all", "guidelines", "research"] as const;
export type ResearchContentScope = (typeof RESEARCH_CONTENT_SCOPES)[number];

export const MAX_RESEARCH_DOMAINS = 8;

export interface ResearchRunOptions {
  mode: ResearchMode;
  sourceScope: ResearchSourceScope;
  contentScope: ResearchContentScope;
  /** Exact host allow-list for this run. Empty means no extra allow-list. */
  includeDomains: readonly string[];
  /** Exact host deny-list for this run. Deny always wins over allow. */
  excludeDomains: readonly string[];
}

export const DEFAULT_RESEARCH_RUN_OPTIONS: ResearchRunOptions = {
  mode: "brief",
  sourceScope: "all",
  contentScope: "all",
  includeDomains: [],
  excludeDomains: [],
};

export function normalizeResearchDomain(value: string): string | null {
  const raw = value.trim().toLocaleLowerCase("en-US");
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = url.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "").replace(/\.$/, "");
    if (!host || (!host.includes(".") && host !== "localhost")) return null;
    return host;
  } catch {
    return null;
  }
}

export function normalizeResearchDomains(values: readonly string[]): string[] {
  const normalized = values
    .flatMap(value => value.split(/[\s,;]+/u))
    .map(normalizeResearchDomain)
    .filter((value): value is string => Boolean(value));
  return [...new Set(normalized)].slice(0, MAX_RESEARCH_DOMAINS);
}

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

export function researchDomainPolicyLabel(options: Pick<ResearchRunOptions, "includeDomains" | "excludeDomains">): string | null {
  const parts = [
    options.includeDomains.length ? `только: ${options.includeDomains.join(", ")}` : null,
    options.excludeDomains.length ? `исключены: ${options.excludeDomains.join(", ")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
