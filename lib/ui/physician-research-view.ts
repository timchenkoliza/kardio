import type { AgentResultView } from "@/lib/agents/types";
import {
  DEFAULT_RESEARCH_RUN_OPTIONS,
  normalizeResearchDomains,
  type ResearchContentScope,
  type ResearchMode,
  type ResearchRunOptions,
  type ResearchSourceScope,
} from "@/lib/agents/research-options";

export type PhysicianResearchMode = ResearchMode;
export type PhysicianResearchSourceScope = ResearchSourceScope;
export type PhysicianResearchContentScope = ResearchContentScope;
export type PhysicianResearchViewOptions = ResearchRunOptions;

export const DEFAULT_PHYSICIAN_RESEARCH_VIEW: PhysicianResearchViewOptions = DEFAULT_RESEARCH_RUN_OPTIONS;

export const RESEARCH_MODE_OPTIONS: readonly Array<{
  id: PhysicianResearchMode;
  label: string;
  description: string;
}> = [
  { id: "articles", label: "Найти статьи", description: "Сводная таблица без длинного отчёта" },
  { id: "brief", label: "Краткий обзор", description: "Короткая сводка + проверяемые находки" },
  { id: "academic", label: "Академическая основа · beta", description: "Структура и источники; пока не готовая статья" },
] as const;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function domains(value: string | string[] | undefined): string[] {
  const raw = one(value);
  return raw ? normalizeResearchDomains([raw]) : [];
}

export function researchViewFromSearchParams(params: Record<string, string | string[] | undefined>): PhysicianResearchViewOptions {
  const mode = one(params.mode);
  const sourceScope = one(params.scope);
  const contentScope = one(params.content);
  const excludeDomains = domains(params.exclude);
  return {
    mode: mode === "articles" || mode === "academic" || mode === "brief" ? mode : DEFAULT_PHYSICIAN_RESEARCH_VIEW.mode,
    sourceScope: sourceScope === "russia" || sourceScope === "international" || sourceScope === "all" ? sourceScope : DEFAULT_PHYSICIAN_RESEARCH_VIEW.sourceScope,
    contentScope: contentScope === "guidelines" || contentScope === "research" || contentScope === "all" ? contentScope : DEFAULT_PHYSICIAN_RESEARCH_VIEW.contentScope,
    includeDomains: domains(params.include).filter(domain => !excludeDomains.includes(domain)),
    excludeDomains,
  };
}

function sourceRegion(result: AgentResultView): "russia" | "international" {
  if (result.source.connectorId === "pubmed") return "international";
  const haystack = [result.source.source, result.source.publisher ?? ""].join(" ").toLocaleLowerCase("ru-RU");
  if (/scardio|cardio-journal|минздрав|росздрав|\bрко\b|\bркж\b/u.test(haystack)) return "russia";

  if (result.source.sourceUrl) {
    try {
      const host = new URL(result.source.sourceUrl).hostname.toLocaleLowerCase("en-US");
      if (host === "localhost" || host.endsWith(".ru") || host.endsWith(".рф")) return "russia";
      return "international";
    } catch {
      // Fall back to provenance when a stored URL cannot be parsed.
    }
  }
  return "international";
}

function contentGroup(result: AgentResultView): "guidelines" | "research" {
  if (result.kind === "guideline_change" || result.category === "guideline" || result.evidence.some(item => item.evidenceLevel === "guideline")) return "guidelines";
  return "research";
}

function sourceHost(result: AgentResultView): string | null {
  if (!result.source.sourceUrl) return null;
  try {
    return new URL(result.source.sourceUrl).hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Compatibility filter for old saved runs. New runs are filtered before retrieval. */
export function filterPhysicianResearchResults(results: readonly AgentResultView[], options: PhysicianResearchViewOptions): AgentResultView[] {
  return results.filter(result => {
    const host = sourceHost(result);
    if (host && options.excludeDomains.some(domain => hostMatches(host, domain))) return false;
    if (options.includeDomains.length && (!host || !options.includeDomains.some(domain => hostMatches(host, domain)))) return false;
    if (options.sourceScope !== "all" && sourceRegion(result) !== options.sourceScope) return false;
    if (options.contentScope !== "all" && contentGroup(result) !== options.contentScope) return false;
    return true;
  });
}

export function researchViewQuery(options: PhysicianResearchViewOptions): string {
  const params = new URLSearchParams({ mode: options.mode, scope: options.sourceScope, content: options.contentScope });
  if (options.includeDomains.length) params.set("include", options.includeDomains.join(","));
  if (options.excludeDomains.length) params.set("exclude", options.excludeDomains.join(","));
  return params.toString();
}
