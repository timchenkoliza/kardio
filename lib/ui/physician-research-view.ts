import type { AgentResultView } from "@/lib/agents/types";

export type PhysicianResearchMode = "articles" | "brief" | "academic";
export type PhysicianResearchSourceScope = "all" | "russia" | "international";
export type PhysicianResearchContentScope = "all" | "guidelines" | "research";

export interface PhysicianResearchViewOptions {
  mode: PhysicianResearchMode;
  sourceScope: PhysicianResearchSourceScope;
  contentScope: PhysicianResearchContentScope;
}

export const DEFAULT_PHYSICIAN_RESEARCH_VIEW: PhysicianResearchViewOptions = {
  mode: "brief",
  sourceScope: "all",
  contentScope: "all",
};

export const RESEARCH_MODE_OPTIONS: readonly Array<{
  id: PhysicianResearchMode;
  label: string;
  description: string;
  estimate: string;
  sources: string;
}> = [
  { id: "articles", label: "Найти статьи", description: "Сводная таблица без длинного отчёта", estimate: "текущий поиск: обычно до 1 мин", sources: "до 12 найденных источников" },
  { id: "brief", label: "Краткий обзор", description: "Короткая сводка + проверяемые находки", estimate: "текущий поиск: обычно до 1 мин", sources: "до 12 найденных источников" },
  { id: "academic", label: "Академическая основа · beta", description: "Структура и источники; пока не готовая статья", estimate: "beta: тот же поиск", sources: "глубокий режим — позже" },
] as const;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function researchViewFromSearchParams(params: Record<string, string | string[] | undefined>): PhysicianResearchViewOptions {
  const mode = one(params.mode);
  const sourceScope = one(params.scope);
  const contentScope = one(params.content);
  return {
    mode: mode === "articles" || mode === "academic" || mode === "brief" ? mode : DEFAULT_PHYSICIAN_RESEARCH_VIEW.mode,
    sourceScope: sourceScope === "russia" || sourceScope === "international" || sourceScope === "all" ? sourceScope : DEFAULT_PHYSICIAN_RESEARCH_VIEW.sourceScope,
    contentScope: contentScope === "guidelines" || contentScope === "research" || contentScope === "all" ? contentScope : DEFAULT_PHYSICIAN_RESEARCH_VIEW.contentScope,
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
  return result.source.dataOrigin === "catalog_snapshot" ? "russia" : "international";
}

function contentGroup(result: AgentResultView): "guidelines" | "research" {
  if (result.kind === "guideline_change" || result.category === "guideline" || result.evidence.some(item => item.evidenceLevel === "guideline")) return "guidelines";
  return "research";
}

export function filterPhysicianResearchResults(results: readonly AgentResultView[], options: PhysicianResearchViewOptions): AgentResultView[] {
  return results.filter(result => {
    if (options.sourceScope !== "all" && sourceRegion(result) !== options.sourceScope) return false;
    if (options.contentScope !== "all" && contentGroup(result) !== options.contentScope) return false;
    return true;
  });
}

export function researchViewQuery(options: PhysicianResearchViewOptions): string {
  const params = new URLSearchParams({ mode: options.mode, scope: options.sourceScope, content: options.contentScope });
  return params.toString();
}
