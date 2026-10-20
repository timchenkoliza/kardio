import type { AgentResultView, UserProfile } from "@/lib/agents/types";
import { catalogTopicLabel, topicLabels } from "@/lib/agents/vocabulary";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { EXAMPLE_DISCLOSURE, EXAMPLE_SPONSOR, PLACEMENT_FORMATS, type PlacementExample } from "@/lib/pharma/placement-formats";
import { illustrateFeed, isArticleResult, matchFor, toMedia, type AgentResultMedia } from "@/lib/ui/agent-result-media";
import { matchCardioIllustration, type IllustrationMatch } from "@/lib/ui/approved-medical-media";
import { kindLabel } from "@/lib/ui/labels";
import { listContent } from "@/server/repositories/catalog";
import { contentMatchesTopics, evidenceEligibleCatalog } from "./services/search";

/**
 * Home feed «Что нового для вас»: the first thing a physician sees.
 * Agent findings come first; until the agents have run (or when they found
 * little), current catalog material fills the feed so the home is never empty.
 * One video lecture and one clearly labelled partner placement are slotted in.
 */

export interface FeedCatalogItem {
  id: string;
  href: string;
  kind: ContentObject["kind"];
  kindLabel: string;
  title: string;
  summary: string;
  source: string;
  year: number | null;
  needsCheck: boolean;
  topic: string | null;
}

export type FeedEntry =
  | { type: "result"; id: string; result: AgentResultView; media: AgentResultMedia | null }
  | { type: "catalog"; id: string; item: FeedCatalogItem; media: AgentResultMedia | null };

export interface FeedVideo {
  id: string;
  href: string;
  sourceUrl: string | null;
  title: string;
  source: string;
  needsCheck: boolean;
  poster: AgentResultMedia | null;
}

export interface FeedPartnerSlot {
  sponsor: string;
  disclosure: string;
  example: Extract<PlacementExample, { type: "article" }>;
}

export interface HomeFeed {
  personalized: boolean;
  topics: string[];
  entries: FeedEntry[];
  video: FeedVideo | null;
  partner: FeedPartnerSlot | null;
  /** Feed positions (0-based, counted in entries) after which the slots are shown. */
  slots: { partnerAfter: number; videoAfter: number };
}

const FEED_SIZE = 10;
const FIRST_SCREEN_MODALITIES = ["ecg", "echo"] as const;
const FEED_KINDS: ReadonlySet<ContentObject["kind"]> = new Set(["guideline", "article", "clinical"]);
const CURRENTNESS_ORDER: Record<string, number> = { current: 0, review: 1 };

function showable(item: ContentObject): boolean {
  return item.currentness === "current" || item.currentness === "review";
}

function byCurrentnessThenPriority(a: ContentObject, b: ContentObject): number {
  return (CURRENTNESS_ORDER[a.currentness] ?? 9) - (CURRENTNESS_ORDER[b.currentness] ?? 9)
    || (b.publicationYear ?? 0) - (a.publicationYear ?? 0)
    || b.priority - a.priority
    || a.id.localeCompare(b.id);
}

function toCatalogItem(item: ContentObject, specialty: SpecialtyId, matchedTopics: readonly string[]): FeedCatalogItem {
  const topic = matchedTopics.length ? topicLabels(specialty, [matchedTopics[0]])[0] : item.topics[0] ? catalogTopicLabel(specialty, item.topics[0]) : null;
  return {
    id: item.id,
    href: `/${specialty}/content/${encodeURIComponent(item.id)}`,
    kind: item.kind,
    kindLabel: kindLabel[item.kind],
    title: item.title,
    summary: item.summary,
    source: item.source.name,
    year: item.publicationYear,
    needsCheck: item.currentness !== "current",
    topic,
  };
}

/**
 * Visual rhythm of the starter feed: illustrated clinical material leads, and
 * society / journal news (usually without a matching illustration) takes every
 * third place so «что нового» is visible without filling the first screen.
 */
function interleaveNews<T extends { match: IllustrationMatch | null }>(scored: readonly T[], size: number): T[] {
  // Round-robin over image modalities (echo, ECG, blood pressure, CT…) keeps rank within each and avoids a wall of one picture.
  // The first screen opens with ECG (animated) and echo, then the rest by rank.
  const groups = new Map<string, T[]>(FIRST_SCREEN_MODALITIES.map(modality => [modality, []]));
  for (const entry of scored) if (entry.match) groups.set(entry.match.asset.modality, [...(groups.get(entry.match.asset.modality) ?? []), entry]);
  const illustrated: T[] = [];
  while ([...groups.values()].some(group => group.length)) for (const group of groups.values()) { const next = group.shift(); if (next) illustrated.push(next); }
  const plain = scored.filter(entry => !entry.match);
  const out: T[] = [];
  while (out.length < size && (illustrated.length || plain.length)) {
    const takePlain = out.length % 3 === 2 && plain.length > 0;
    const next = takePlain ? plain.shift() : illustrated.shift() ?? plain.shift();
    if (next) out.push(next);
  }
  return out;
}

const isLecture =(item: ContentObject) => /лекци/iu.test(item.type);

function pickVideo(content: readonly ContentObject[], specialty: SpecialtyId, topics: readonly string[]): FeedVideo | null {
  const videos = content.filter(item => item.kind === "video" && showable(item));
  const onTopic = (item: ContentObject) => contentMatchesTopics(item, specialty, topics).length > 0;
  const ranked = [...videos].sort((a, b) => Number(onTopic(b)) - Number(onTopic(a)) || Number(isLecture(b)) - Number(isLecture(a)) || byCurrentnessThenPriority(a, b));
  const video = ranked[0];
  if (!video) return null;
  const match = specialty === "cardiology" ? matchCardioIllustration({ text: video.title, kind: "guideline" }) : null;
  return {
    id: video.id,
    href: `/${specialty}/content/${encodeURIComponent(video.id)}`,
    sourceUrl: video.canonicalUrl,
    title: video.title,
    source: video.source.name,
    needsCheck: video.currentness !== "current",
    poster: match ? { ...toMedia(match.asset), animated: false } : null,
  };
}

function partnerSlot(profile: UserProfile, specialty: SpecialtyId): FeedPartnerSlot | null {
  if (!profile.partnerContent || specialty !== "cardiology") return null;
  const example = PLACEMENT_FORMATS.find(format => format.id === "article")?.example;
  return example?.type === "article" ? { sponsor: EXAMPLE_SPONSOR, disclosure: EXAMPLE_DISCLOSURE, example } : null;
}

export function buildHomeFeed(args: { specialty: SpecialtyId; profile: UserProfile; results: readonly AgentResultView[]; content: readonly ContentObject[] }): HomeFeed {
  const { specialty, profile } = args;
  const topics = profile.interests.topics;
  const catalog = evidenceEligibleCatalog(args.content).filter(item => item.specialty === specialty && showable(item));
  const results = args.results.filter(result => !result.partner);
  const seen = new Set(results.map(result => result.title.toLocaleLowerCase("ru-RU")));

  const scored = catalog
    .filter(item => FEED_KINDS.has(item.kind) && !seen.has(item.title.toLocaleLowerCase("ru-RU")))
    .map(item => ({ item, matched: contentMatchesTopics(item, specialty, topics), match: specialty === "cardiology" ? matchCardioIllustration({ text: [item.title, item.summary].join(" "), kind: item.kind }) : null }))
    .sort((a, b) => Number(b.matched.length > 0) - Number(a.matched.length > 0) || byCurrentnessThenPriority(a.item, b.item));
  const fill = interleaveNews(scored, Math.max(0, FEED_SIZE - results.length));

  const ordered: Array<{ id: string; article: boolean; match: IllustrationMatch | null; result?: AgentResultView; item?: ContentObject; matched?: string[] }> = [
    ...results.map(result => ({ id: result.id, article: isArticleResult(result), match: matchFor(result), result })),
    ...fill.map(({ item, matched, match }) => ({ id: item.id, article: true, match, item, matched })),
  ];
  const media = illustrateFeed(ordered, { textOnlyEvery: ordered.some(entry => entry.article && !entry.match) ? 0 : 5 });

  const entries: FeedEntry[] = ordered.map(entry => entry.result
    ? { type: "result", id: entry.id, result: entry.result, media: media.get(entry.id) ?? null }
    : { type: "catalog", id: entry.id, item: toCatalogItem(entry.item as ContentObject, specialty, entry.matched ?? []), media: media.get(entry.id) ?? null });

  return {
    personalized: topics.length > 0,
    topics: topicLabels(specialty, topics),
    entries,
    video: pickVideo(catalog, specialty, topics),
    partner: partnerSlot(profile, specialty),
    slots: { partnerAfter: 1, videoAfter: 3 },
  };
}

export async function getHomeFeed(specialty: SpecialtyId, profile: UserProfile, results: readonly AgentResultView[]): Promise<HomeFeed> {
  return buildHomeFeed({ specialty, profile, results, content: await listContent(specialty) });
}
