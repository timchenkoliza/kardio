import { describe, expect, it } from "vitest";
import type { ContentObject } from "@/lib/domain/types";
import { hasBlockedPatientLevelMarkers, rankWorkspaceResearch } from "@/lib/ui/workspace-research-agent";

function item(id: string, title: string, topics: string[] = [], summary = ""): ContentObject {
  return {
    id,
    specialty: "cardiology",
    kind: "article",
    type: "article",
    title,
    summary,
    sourceId: "source",
    source: { id: "source", specialty: "cardiology", name: "Журнал", type: "journal", publisher: null, url: null, trustStatus: "observed", commercialStatus: "none", metadataCompleteness: 100, notes: null, lastCheckedAt: null },
    canonicalUrl: null,
    publicationDate: null,
    publicationYear: null,
    updatedAt: null,
    lastCheckedAt: null,
    language: "ru",
    topics,
    tags: [],
    currentness: "current",
    requiresReview: false,
    freshness: "unknown",
    version: null,
    parentId: null,
    supersedesId: null,
    supersededById: null,
    trustLayer: "source",
    editorialStatus: "reviewed",
    rightsStatus: "needs_rights_review",
    priority: 0,
    author: null,
    provenance: { type: "test", asset: null, location: null, notes: null },
    asset: null,
  };
}

describe("workspace research navigator", () => {
  it("ranks source-grounded catalog content by explicit topic signals", () => {
    const results = rankWorkspaceResearch([
      item("af", "Фибрилляция предсердий: современная тактика", ["Фибрилляция предсердий"]),
      item("htn", "Артериальная гипертензия", ["Гипертензия"]),
    ], ["фибрилляция предсердий"]);
    expect(results.map((result) => result.content.id)).toEqual(["af"]);
    expect(results[0]?.matchedTerms).toContain("фибрилляция");
  });

  it("does not invent recommendations without an explicit signal", () => {
    expect(rankWorkspaceResearch([item("a", "Любая статья")], [])).toEqual([]);
  });

  it("blocks obvious patient-level identifiers in local aggregate input", () => {
    expect(hasBlockedPatientLevelMarkers("ФИО; дата рождения; диагноз")).toBe(true);
    expect(hasBlockedPatientLevelMarkers("Агрегированная доля ФП 18%, n=240")).toBe(false);
  });
});
