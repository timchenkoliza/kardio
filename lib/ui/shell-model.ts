import type { ContentObject, SpecialtyId, UserState } from "@/lib/domain/types";
import { deterministicContentOrder } from "@/lib/ui/feed";

function scopedContent(content: readonly ContentObject[], specialty: SpecialtyId): ContentObject[] {
  return content.filter((item) => item.specialty === specialty);
}

function contentByIds(content: readonly ContentObject[], ids: readonly string[]): ContentObject[] {
  const byId = new Map(content.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter((item): item is ContentObject => Boolean(item));
}

function uniqueContent(items: readonly ContentObject[]): ContentObject[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export interface PracticeHomeModel {
  currentGuidelines: ContentObject[];
  taskObjects: ContentObject[];
  pinned: ContentObject[];
  saved: ContentObject[];
  recent: ContentObject[];
}

export function buildPracticeHomeModel(
  content: readonly ContentObject[],
  state: UserState,
  specialty: SpecialtyId,
): PracticeHomeModel {
  const scope = scopedContent(content, specialty);
  const currentGuidelines = scope
    .filter((item) => item.kind === "guideline" && item.currentness === "current")
    .sort(deterministicContentOrder)
    .slice(0, 6);
  const taskObjects = scope
    .filter((item) => ["tool", "drug", "referral"].includes(item.kind) && item.currentness !== "archived")
    .sort(deterministicContentOrder)
    .slice(0, 6);
  const pinned = contentByIds(scope, state.pinnedIds).slice(0, 6);
  const saved = contentByIds(scope, state.savedIds).slice(0, 6);
  const recentIds = state.recent
    .filter((entry) => entry.specialty === specialty && entry.kind === "content" && entry.id)
    .map((entry) => entry.id!);
  const recent = uniqueContent(contentByIds(scope, recentIds)).slice(0, 6);
  return { currentGuidelines, taskObjects, pinned, saved, recent };
}

export interface WorkspaceCollectionModel {
  id: string;
  name: string;
  items: ContentObject[];
}

export interface WorkspaceHomeModel {
  pinned: ContentObject[];
  saved: ContentObject[];
  recent: ContentObject[];
  recentQueries: string[];
  collections: WorkspaceCollectionModel[];
  followedTopics: string[];
  followedSourceIds: string[];
  pinnedSourceIds: string[];
  hasOwnedState: boolean;
}

export function buildWorkspaceHomeModel(
  content: readonly ContentObject[],
  state: UserState,
  specialty: SpecialtyId,
): WorkspaceHomeModel {
  const scope = scopedContent(content, specialty);
  const pinned = contentByIds(scope, state.pinnedIds);
  const saved = contentByIds(scope, state.savedIds);
  const recentIds = state.recent
    .filter((entry) => entry.specialty === specialty && entry.kind === "content" && entry.id)
    .map((entry) => entry.id!);
  const recent = uniqueContent(contentByIds(scope, recentIds)).slice(0, 8);
  const recentQueries = state.recent
    .filter((entry) => entry.specialty === specialty && entry.kind === "query" && entry.query)
    .map((entry) => entry.query!)
    .filter((query, index, values) => values.indexOf(query) === index)
    .slice(0, 8);
  const collections = state.collections
    .filter((collection) => collection.specialty === specialty)
    .map((collection) => ({
      id: collection.id,
      name: collection.name,
      items: contentByIds(scope, collection.contentIds),
    }));
  const topicPrefix = `${specialty}:`;
  const followedTopics = state.followedTopics
    .filter((topic) => topic.startsWith(topicPrefix))
    .map((topic) => topic.slice(topicPrefix.length));
  const followedSourceIds = [...state.followedSourceIds];
  const pinnedSourceIds = [...state.pinnedSourceIds];
  const hasOwnedState = Boolean(
    pinned.length
    || saved.length
    || recent.length
    || recentQueries.length
    || collections.length
    || followedTopics.length
    || followedSourceIds.length
    || pinnedSourceIds.length,
  );
  return {
    pinned,
    saved,
    recent,
    recentQueries,
    collections,
    followedTopics,
    followedSourceIds,
    pinnedSourceIds,
    hasOwnedState,
  };
}
