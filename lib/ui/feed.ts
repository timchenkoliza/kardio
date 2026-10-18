import type { ContentKind, ContentObject } from "@/lib/domain/types";

export type FeedKindFilter = "all" | "guideline" | "article" | "video" | "event" | "clinical";

const currentnessWeight: Record<ContentObject["currentness"], number> = {
  current: 4,
  review: 3,
  superseded: 2,
  archived: 1,
};

export function normalizeQuery(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function searchableText(content: ContentObject): string {
  return normalizeQuery([
    content.title,
    content.summary,
    content.source.name,
    content.author ?? "",
    ...content.topics,
    ...content.tags,
  ].join(" "));
}

function lexicalTermMatches(term: string, haystack: string, haystackTerms: readonly string[]): boolean {
  if (haystack.includes(term)) return true;
  if (term.length < 7) return false;
  const oneCharacterStem = term.slice(0, -1);
  return haystackTerms.some((candidate) => candidate.length >= oneCharacterStem.length && candidate.startsWith(oneCharacterStem));
}

export function deterministicContentOrder(a: ContentObject, b: ContentObject): number {
  return (
    b.priority - a.priority
    || currentnessWeight[b.currentness] - currentnessWeight[a.currentness]
    || Number(Boolean(b.publicationDate)) - Number(Boolean(a.publicationDate))
    || (b.publicationDate ?? "").localeCompare(a.publicationDate ?? "")
    || a.id.localeCompare(b.id)
  );
}

export function selectFeedContent(args: {
  content: readonly ContentObject[];
  query?: string;
  kind?: FeedKindFilter;
  savedIds?: readonly string[];
  savedOnly?: boolean;
}): ContentObject[] {
  const query = normalizeQuery(args.query ?? "");
  const queryTerms = query ? query.split(/\s+/).filter(Boolean) : [];
  const saved = new Set(args.savedIds ?? []);
  const kind = args.kind ?? "all";

  return args.content
    .filter((item) => !args.savedOnly || saved.has(item.id))
    .filter((item) => kind === "all" || item.kind === kind)
    .filter((item) => {
      if (!queryTerms.length) return true;
      const haystack = searchableText(item);
      const haystackTerms = haystack.split(/\s+/).filter(Boolean);
      return queryTerms.every((term) => lexicalTermMatches(term, haystack, haystackTerms));
    })
    .sort(deterministicContentOrder);
}

export function relatedContent(content: ContentObject, candidates: readonly ContentObject[], limit = 4): ContentObject[] {
  const topics = new Set(content.topics.map(normalizeQuery));
  return candidates
    .filter((item) => item.id !== content.id)
    .map((item) => {
      const topicOverlap = item.topics.reduce((count, topic) => count + Number(topics.has(normalizeQuery(topic))), 0);
      const sameSource = Number(item.sourceId === content.sourceId);
      const sameKind = Number(item.kind === content.kind);
      return { item, score: topicOverlap * 10 + sameSource * 3 + sameKind };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || deterministicContentOrder(a.item, b.item))
    .slice(0, Math.max(0, limit))
    .map(({ item }) => item);
}

export function feedKindLabel(kind: FeedKindFilter): string {
  const labels: Record<FeedKindFilter, string> = {
    all: "Для вас",
    guideline: "Клинические рекомендации",
    article: "Исследования и статьи",
    video: "Видео",
    event: "События",
    clinical: "Клинические материалы",
  };
  return labels[kind];
}

export function isFeedKind(value: string | undefined): value is FeedKindFilter {
  return value === "all" || value === "guideline" || value === "article" || value === "video" || value === "event" || value === "clinical";
}

export function contentKindFromView(view: string): ContentKind | null {
  if (view === "events") return "event";
  if (view === "tools") return "tool";
  if (view === "reference") return "drug";
  if (view === "referral") return "referral";
  return null;
}
