import type { ContentKind, ContentObject } from "@/lib/domain/types";
import { selectFeedContent } from "@/lib/ui/feed";

export interface ExploreCompositionModel {
  lead: ContentObject | null;
  clinical: ContentObject[];
  guidelines: ContentObject[];
  evidence: ContentObject[];
  learning: ContentObject[];
  events: ContentObject[];
  overflow: ContentObject[];
}

const activeCurrentness = new Set<ContentObject["currentness"]>(["current", "review"]);

function isActive(item: ContentObject): boolean {
  return activeCurrentness.has(item.currentness);
}

function hasProductMedia(item: ContentObject): boolean {
  // The catalog repository already nulls asset.url when rights / verification are insufficient.
  return Boolean(item.asset?.url);
}

function takeByKind(
  items: readonly ContentObject[],
  kind: ContentKind,
  limit: number,
  used: Set<string>,
): ContentObject[] {
  const selected = items
    .filter(item => item.kind === kind && !used.has(item.id))
    .slice(0, limit);
  selected.forEach(item => used.add(item.id));
  return selected;
}

export function buildExploreComposition(content: readonly ContentObject[]): ExploreCompositionModel {
  const ordered = selectFeedContent({ content, query: "", kind: "all", savedIds: [] });
  const active = ordered.filter(isActive);
  const leadPool = active.length ? active : ordered;

  const lead = (
    leadPool.find(item => item.kind === "clinical" && hasProductMedia(item))
    ?? leadPool.find(item => item.kind === "article" && hasProductMedia(item))
    ?? leadPool.find(item => item.kind === "clinical")
    ?? leadPool.find(item => item.kind === "article")
    ?? leadPool.find(item => item.kind === "guideline")
    ?? leadPool[0]
    ?? null
  );

  const used = new Set<string>();
  if (lead) used.add(lead.id);

  // Keep active professional objects ahead of archived / superseded ones without hiding history.
  const remaining = [
    ...active.filter(item => !used.has(item.id)),
    ...ordered.filter(item => !activeCurrentness.has(item.currentness) && !used.has(item.id)),
  ];

  const clinical = takeByKind(remaining, "clinical", 4, used);
  const guidelines = takeByKind(remaining, "guideline", 5, used);
  const evidence = takeByKind(remaining, "article", 4, used);
  const learning = takeByKind(remaining, "video", 4, used);
  const events = takeByKind(remaining, "event", 3, used);
  const overflow = remaining.filter(item => !used.has(item.id)).slice(0, 6);

  return { lead, clinical, guidelines, evidence, learning, events, overflow };
}
