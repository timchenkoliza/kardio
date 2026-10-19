import { describe, expect, it } from "vitest";
import type { ContentKind, ContentObject, Currentness, Source } from "@/lib/domain/types";
import { buildExploreComposition } from "@/lib/ui/explore-composition";

const source: Source = {
  id: "source:test",
  specialty: "cardiology",
  name: "Test Source",
  type: "Научный журнал",
  publisher: null,
  url: "https://example.test",
  trustStatus: "verified",
  commercialStatus: "non_commercial",
  metadataCompleteness: 1,
  notes: null,
  lastCheckedAt: null,
};

function item(id: string, kind: ContentKind, priority: number, currentness: Currentness = "current", withMedia = false): ContentObject {
  return {
    id,
    specialty: "cardiology",
    kind,
    type: kind,
    title: id,
    summary: `Summary ${id}`,
    sourceId: source.id,
    source,
    canonicalUrl: `https://example.test/${id}`,
    publicationDate: "2026-01-01",
    publicationYear: 2026,
    updatedAt: null,
    lastCheckedAt: null,
    language: "ru",
    topics: [],
    tags: [],
    currentness,
    requiresReview: currentness === "review",
    freshness: "current",
    version: null,
    parentId: null,
    supersedesId: null,
    supersededById: null,
    trustLayer: "canonical",
    editorialStatus: "approved",
    rightsStatus: "approved",
    priority,
    author: null,
    provenance: { type: "test", asset: null, location: null, notes: null },
    asset: withMedia ? {
      id: `asset:${id}`,
      url: `https://example.test/${id}.jpg`,
      sourceUrl: `https://example.test/${id}`,
      credit: null,
      caption: null,
      status: "verified",
      rights: "publishable",
      semanticMatch: "exact",
      width: 1200,
      height: 800,
    } : null,
  };
}

describe("explore block composition", () => {
  it("prefers an active clinical object with product-eligible media for the lead", () => {
    const model = buildExploreComposition([
      item("article-high", "article", 100),
      item("clinical-image", "clinical", 20, "current", true),
      item("guideline", "guideline", 90),
    ]);

    expect(model.lead?.id).toBe("clinical-image");
  });

  it("keeps professional kinds in separate buckets without duplicates", () => {
    const model = buildExploreComposition([
      item("lead", "clinical", 100, "current", true),
      item("clinical-2", "clinical", 90),
      item("guideline", "guideline", 80),
      item("article", "article", 70),
      item("video", "video", 60),
      item("event", "event", 50),
      item("tool", "tool", 40),
    ]);

    expect(model.clinical.map(value => value.id)).toEqual(["clinical-2"]);
    expect(model.guidelines.map(value => value.id)).toEqual(["guideline"]);
    expect(model.evidence.map(value => value.id)).toEqual(["article"]);
    expect(model.learning.map(value => value.id)).toEqual(["video"]);
    expect(model.events.map(value => value.id)).toEqual(["event"]);
    expect(model.overflow.map(value => value.id)).toEqual(["tool"]);

    const ids = [
      model.lead?.id,
      ...model.clinical.map(value => value.id),
      ...model.guidelines.map(value => value.id),
      ...model.evidence.map(value => value.id),
      ...model.learning.map(value => value.id),
      ...model.events.map(value => value.id),
      ...model.overflow.map(value => value.id),
    ].filter((value): value is string => Boolean(value));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not promote archived or superseded content above an active lead", () => {
    const model = buildExploreComposition([
      item("archived-clinical", "clinical", 200, "archived", true),
      item("superseded-article", "article", 190, "superseded", true),
      item("active-guideline", "guideline", 10, "current"),
    ]);

    expect(model.lead?.id).toBe("active-guideline");
  });
});
