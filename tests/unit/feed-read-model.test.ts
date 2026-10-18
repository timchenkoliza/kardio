import { describe, expect, it } from "vitest";
import { normalizeQuery, relatedContent, selectFeedContent } from "@/lib/ui/feed";
import type { ContentObject } from "@/lib/domain/types";

function item(overrides: Partial<ContentObject> & Pick<ContentObject, "id" | "title">): ContentObject {
  return {
    id: overrides.id,
    specialty: "cardiology",
    kind: "article",
    type: "article",
    title: overrides.title,
    summary: overrides.summary ?? "",
    sourceId: overrides.sourceId ?? "source-a",
    source: overrides.source ?? {
      id: overrides.sourceId ?? "source-a",
      specialty: "cardiology",
      name: "Источник",
      type: "journal",
      publisher: null,
      url: null,
      trustStatus: "observed",
      commercialStatus: "none",
      metadataCompleteness: 100,
      notes: null,
      lastCheckedAt: null,
    },
    canonicalUrl: null,
    publicationDate: overrides.publicationDate ?? null,
    publicationYear: overrides.publicationYear ?? null,
    updatedAt: null,
    lastCheckedAt: null,
    language: "ru",
    topics: overrides.topics ?? [],
    tags: overrides.tags ?? [],
    currentness: overrides.currentness ?? "current",
    requiresReview: overrides.requiresReview ?? false,
    freshness: "unknown",
    version: null,
    parentId: null,
    supersedesId: null,
    supersededById: null,
    trustLayer: "source",
    editorialStatus: "reviewed",
    rightsStatus: "needs_rights_review",
    priority: overrides.priority ?? 0,
    author: overrides.author ?? null,
    provenance: { type: "test", asset: null, location: null, notes: null },
    asset: null,
    ...overrides,
  };
}

describe("alpha feed read model", () => {
  it("normalizes Cyrillic search deterministically", () => {
    expect(normalizeQuery("  Ёлка: Сердце/2026  ")).toBe("елка сердце 2026");
  });

  it("filters all query terms and orders by explicit priority", () => {
    const content = [
      item({ id: "b", title: "Артериальная гипертензия", summary: "Новые рекомендации", priority: 5 }),
      item({ id: "a", title: "Артериальная гипертензия", summary: "Обзор рекомендаций", priority: 20 }),
      item({ id: "c", title: "Фибрилляция предсердий", priority: 100 }),
    ];
    expect(selectFeedContent({ content, query: "гипертензия рекомендации" }).map(value => value.id)).toEqual(["a", "b"]);
  });

  it("builds explainable related chain from topic, source and kind overlap", () => {
    const primary = item({ id: "primary", title: "A", topics: ["липиды"], sourceId: "source-a" });
    const sameTopic = item({ id: "topic", title: "B", topics: ["Липиды"], sourceId: "source-b" });
    const sameSource = item({ id: "source", title: "C", topics: [], sourceId: "source-a", kind: "video" });
    const unrelated = item({ id: "other", title: "D", topics: ["аритмия"], sourceId: "source-z", kind: "video" });
    expect(relatedContent(primary, [primary, sameSource, unrelated, sameTopic]).map(value => value.id)).toEqual(["topic", "source"]);
  });
});
