import { describe, expect, it } from "vitest";
import type { ContentObject, Source } from "@/lib/domain/types";
import {
  HARD_CODED_UNITS_PER_TOPIC,
  hardcodedTopicContent,
  topicLabelsForHardcodedExpansion,
} from "@/lib/demo/hardcoded-topic-content-v2";

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

describe("hardcoded topic content v2", () => {
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
    expect(content.every(item => item.version === "copy-v2")).toBe(true);
  });

  it("keeps visible copy free from implementation jargon and unsupported promises", () => {
    const content = hardcodedTopicContent("cardiology", [existing]);
    const forbidden = [
      "alpha",
      "resolver",
      "pipeline",
      "deterministic",
      "staging",
      "verified pipeline",
      "лучший",
      "идеальный",
      "гарантированно",
    ];

    for (const item of content) {
      const text = `${item.title} ${item.summary}`.toLocaleLowerCase("ru-RU");
      for (const token of forbidden) expect(text).not.toContain(token);
    }
  });

  it("keeps the editorial job after the dash concise", () => {
    const content = hardcodedTopicContent("cardiology", [existing]);
    for (const item of content) {
      const tail = item.title.split("—").at(-1)?.trim() ?? item.title;
      expect(tail.split(/\s+/u).filter(Boolean).length).toBeLessThanOrEqual(6);
    }
  });
});
