import { topicById, topicsMentioned } from "@/lib/agents/vocabulary";
import type { ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import { deterministicContentOrder } from "@/lib/ui/feed";
import { rankWorkspaceResearch } from "@/lib/ui/workspace-research-agent";
import { SOURCE_OPTIONS } from "@/lib/agents/vocabulary";
import { contentTokens } from "@/lib/agents/text";
import { isUnverifiedEditorialDraft } from "./evidence";

/**
 * SearchService / SourceService: reuses the existing deterministic lexical
 * ranking over the canonical catalog. Prototype editorial drafts are excluded
 * from every agent search because they are not source-validated.
 */

export function evidenceEligibleCatalog(content: readonly ContentObject[]): ContentObject[] {
  return content.filter(item => !isUnverifiedEditorialDraft(item));
}

export function sourcePreferenceMatches(sourceId: string, preferenceIds: readonly string[]): boolean {
  return preferenceIds.some(id => SOURCE_OPTIONS.find(option => option.id === id)?.matches.includes(sourceId));
}

export function catalogTopicIds(specialty: SpecialtyId, topicIds: readonly string[]): Set<string> {
  return new Set(topicIds.flatMap(id => topicById(specialty, id)?.catalogTopics ?? []));
}

export function contentMatchesTopics(content: ContentObject, specialty: SpecialtyId, topicIds: readonly string[]): string[] {
  return topicIds.filter(id => {
    const topic = topicById(specialty, id);
    if (!topic) return false;
    return content.topics.some(value => topic.catalogTopics.includes(value));
  });
}

export interface CatalogHit {
  content: ContentObject;
  score: number;
  matchedTopics: string[];
  matchedTerms: string[];
}

/** searchMedical(): topic-aware + lexical catalog search with source preferences. */
export function searchMedical(args: {
  specialty: SpecialtyId;
  content: readonly ContentObject[];
  topicIds: readonly string[];
  query?: string | null;
  trustedSources: readonly string[];
  excludedSources: readonly string[];
  kinds?: ReadonlyArray<ContentObject["kind"]>;
  limit?: number;
  /** Typed questions: a lexical hit must also belong to one of the question's topics. */
  requireTopicMatch?: boolean;
}): CatalogHit[] {
  const eligible = evidenceEligibleCatalog(args.content)
    .filter(item => item.specialty === args.specialty)
    .filter(item => !args.kinds || args.kinds.includes(item.kind))
    .filter(item => !sourcePreferenceMatches(item.sourceId, args.excludedSources));
  const byId = new Map<string, CatalogHit>();

  for (const item of eligible) {
    const matchedTopics = contentMatchesTopics(item, args.specialty, args.topicIds);
    if (!matchedTopics.length) continue;
    byId.set(item.id, { content: item, score: 10 * matchedTopics.length, matchedTopics, matchedTerms: [] });
  }
  const meaningful = args.query ? contentTokens(args.query).join(" ") : "";
  if (meaningful) {
    for (const result of rankWorkspaceResearch(eligible, [meaningful], 24)) {
      const existing = byId.get(result.content.id);
      if (!existing && args.topicIds.length && result.matchedTerms.length < 2) continue;
      if (existing) {
        existing.score += result.score;
        existing.matchedTerms = result.matchedTerms;
      } else {
        byId.set(result.content.id, { content: result.content, score: result.score, matchedTopics: contentMatchesTopics(result.content, args.specialty, args.topicIds), matchedTerms: result.matchedTerms });
      }
    }
  }
  for (const hit of byId.values()) {
    if (sourcePreferenceMatches(hit.content.sourceId, args.trustedSources)) hit.score += 4;
    if (hit.content.currentness === "current") hit.score += 3;
    if (hit.content.currentness === "archived") hit.score -= 4;
    if (hit.content.currentness === "superseded") hit.score -= 2;
  }
  return [...byId.values()]
    .filter(hit => !args.requireTopicMatch || !args.topicIds.length || hit.matchedTopics.length > 0 || topicsMentioned(args.specialty, hit.content.title).some(id => args.topicIds.includes(id)))
    .sort((a, b) => b.score - a.score || deterministicContentOrder(a.content, b.content))
    .slice(0, args.limit ?? 12);
}

/** retrieveDocument(): a catalog object with its version chain. */
export function retrieveDocument(content: readonly ContentObject[], id: string): { document: ContentObject; previous: ContentObject | null; next: ContentObject | null } | null {
  const byId = new Map(content.map(item => [item.id, item]));
  const document = byId.get(id);
  if (!document) return null;
  return {
    document,
    previous: document.supersedesId ? byId.get(document.supersedesId) ?? null : null,
    next: document.supersededById ? byId.get(document.supersededById) ?? null : null,
  };
}

/** searchSources(): canonical sources filtered by user preferences. */
export function searchSources(sources: readonly Source[], trusted: readonly string[], excluded: readonly string[]): Array<{ source: Source; trusted: boolean }> {
  return sources
    .filter(source => !source.id.startsWith("hardcoded-editorial"))
    .filter(source => !sourcePreferenceMatches(source.id, excluded))
    .map(source => ({ source, trusted: sourcePreferenceMatches(source.id, trusted) }))
    .sort((a, b) => Number(b.trusted) - Number(a.trusted) || a.source.name.localeCompare(b.source.name, "ru"));
}
