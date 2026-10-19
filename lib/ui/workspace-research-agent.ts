import type { ContentObject } from "@/lib/domain/types";
import { deterministicContentOrder, normalizeQuery } from "@/lib/ui/feed";

const stopWords = new Set([
  "для", "при", "или", "как", "что", "это", "без", "над", "под", "между", "после", "перед", "врач", "врача", "врачи", "пациент", "пациента", "пациенты",
  "данные", "данных", "исследование", "исследования", "материал", "материалы", "тема", "темы", "обзор", "лечение", "терапия",
]);

function stem(value: string): string {
  if (value.length <= 5) return value;
  return value.replace(/(иями|ями|ами|ого|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ий|ый|ой|ов|ев|ам|ям|ах|ях|ом|ем|у|ю|а|я|ы|и|е|о)$/u, "");
}

function termsFromSignals(signals: readonly string[]): string[] {
  const terms = normalizeQuery(signals.join(" "))
    .split(/\s+/)
    .filter((value) => value.length >= 4 && !stopWords.has(value));
  return [...new Set(terms)].slice(0, 40);
}

function fieldMatches(field: string, term: string): boolean {
  const normalized = normalizeQuery(field);
  if (!normalized) return false;
  if (normalized.includes(term)) return true;
  const needle = stem(term);
  if (needle.length < 4) return false;
  return normalized.split(/\s+/).some((word) => {
    const candidate = stem(word);
    return candidate.startsWith(needle) || needle.startsWith(candidate);
  });
}

export interface WorkspaceResearchResult {
  content: ContentObject;
  score: number;
  matchedTerms: string[];
}

export function rankWorkspaceResearch(
  content: readonly ContentObject[],
  signals: readonly string[],
  limit = 6,
): WorkspaceResearchResult[] {
  const terms = termsFromSignals(signals);
  if (!terms.length) return [];

  return content
    .map((item) => {
      let score = 0;
      const matchedTerms: string[] = [];
      for (const term of terms) {
        let matched = false;
        if (fieldMatches(item.title, term)) { score += 8; matched = true; }
        if (item.topics.some((topic) => fieldMatches(topic, term))) { score += 7; matched = true; }
        if (item.tags.some((tag) => fieldMatches(tag, term))) { score += 5; matched = true; }
        if (fieldMatches(item.summary, term)) { score += 3; matched = true; }
        if (fieldMatches(item.source.name, term)) { score += 1; matched = true; }
        if (matched) matchedTerms.push(term);
      }
      if (item.currentness === "current") score += 2;
      if (item.currentness === "archived") score -= 2;
      return { content: item, score, matchedTerms: [...new Set(matchedTerms)] };
    })
    .filter((result) => result.matchedTerms.length > 0)
    .sort((a, b) => b.score - a.score || deterministicContentOrder(a.content, b.content))
    .slice(0, Math.max(0, limit));
}

export function hasBlockedPatientLevelMarkers(value: string): boolean {
  const normalized = normalizeQuery(value);
  return /(фио|фамили|имя пациента|дата рождения|телефон|email|e mail|снилс|полис омс|номер карты|медицинская карта|patient id|mrn)/u.test(normalized);
}
