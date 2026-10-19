import { describe, expect, it } from "vitest";
import type { ContentObject, Source } from "@/lib/domain/types";
import {
  HARD_CODED_UNITS_PER_TOPIC,
  hardcodedTopicContent,
  topicLabelsForHardcodedExpansion,
} from "@/lib/demo/hardcoded-topic-content";

const source: Source = {
  id: "source",
  specialty: "cardiology",
  name: "Source",
  type: "journal",
  publisher: null,
  url: null,
  trustStatus: "verified",
  commercialStatus: "non_commercial",
  metadataCompleteness: 100,
  notes: null,
  lastCheckedAt: null,
};

const existing: ContentObject = {
  id: "existing",
  specialty: "cardiology",
  kind: "article",
  type: "Статья",
  title: "Existing",
  summary: "Existing",
  sourceId: source.id,
  source,
  canonicalUrl: null,
  publicationDate: null,
  publicationYear: null,
  updatedAt: null,
  lastCheckedAt: null,
  language: "ru",
  topics: ["topic-id", "Редкая тестовая тема"],
  tags: [],
  currentness: "current",
  requiresReview: false,
  freshness: "current",
  version: null,
  parentId: null,
  supersedesId: null,
  supersededById: null,
  trustLayer: "professional",
  editorialStatus: "verified",
  rightsStatus: "needs_rights_review",
  priority: 10,
  author: null,
  provenance: { type: "test", asset: null, location: null, notes: null },
  asset: null,
};

describe("hardcoded topic content", () => {
  it("keeps the editorial pack fixed at exactly 20 units per topic", () => {
    expect(HARD_CODED_UNITS_PER_TOPIC).toBe(20);
    const topics = topicLabelsForHardcodedExpansion("cardiology", [existing]);
    const content = hardcodedTopicContent("cardiology", [existing]);
    expect(content).toHaveLength(topics.length * 20);

    for (const topic of topics) {
      expect(content.filter(item => item.topics.includes(topic))).toHaveLength(20);
    }
  });

  it("seeds oncology even when its canonical catalog is empty", () => {
    const topics = topicLabelsForHardcodedExpansion("oncology", []);
    const content = hardcodedTopicContent("oncology", []);
    expect(topics).toHaveLength(10);
    expect(content).toHaveLength(200);
    expect(new Set(content.map(item => item.id)).size).toBe(200);
  });

  it("marks every hardcoded unit as review-only prototype copy", () => {
    const content = hardcodedTopicContent("oncology", []);
    expect(content.every(item => item.currentness === "review")).toBe(true);
    expect(content.every(item => item.requiresReview)).toBe(true);
    expect(content.every(item => item.editorialStatus === "prototype_hardcoded")).toBe(true);
    expect(content.every(item => item.canonicalUrl === null)).toBe(true);
  });
});
