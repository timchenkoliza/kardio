import { describe, expect, it } from "vitest";
import type { ContentObject, UserState } from "@/lib/domain/types";
import { emptyUserState } from "@/lib/domain/types";
import { buildPracticeHomeModel, buildWorkspaceHomeModel } from "@/lib/ui/shell-model";

function item(id: string, kind: ContentObject["kind"] = "article", priority = 0): ContentObject {
  return {
    id,
    specialty: "cardiology",
    kind,
    type: kind,
    title: id,
    summary: "",
    sourceId: "source",
    source: {
      id: "source",
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
    publicationDate: null,
    publicationYear: null,
    updatedAt: null,
    lastCheckedAt: null,
    language: "ru",
    topics: [],
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
    priority,
    author: null,
    provenance: { type: "test", asset: null, location: null, notes: null },
    asset: null,
  };
}

describe("semantic shell models", () => {
  it("workspace never falls back to arbitrary catalog content", () => {
    const model = buildWorkspaceHomeModel([item("article-a"), item("article-b")], emptyUserState(), "cardiology");
    expect(model.hasOwnedState).toBe(false);
    expect(model.saved).toEqual([]);
    expect(model.pinned).toEqual([]);
    expect(model.recent).toEqual([]);
    expect(model.collections).toEqual([]);
    expect(model.researchInterests).toEqual([]);
  });

  it("workspace is built only from user-owned state", () => {
    const state: UserState = {
      ...emptyUserState(),
      savedIds: ["saved"],
      pinnedIds: ["pinned"],
      researchInterests: ["cardiology:фибрилляция предсердий", "oncology:меланома"],
      recent: [{ kind: "content", specialty: "cardiology", id: "recent", at: "2026-10-18T00:00:00.000Z" }],
      collections: [{ id: "00000000-0000-4000-8000-000000000001", specialty: "cardiology", name: "Моя подборка", contentIds: ["saved"] }],
    };
    const model = buildWorkspaceHomeModel([item("random"), item("saved"), item("pinned"), item("recent")], state, "cardiology");
    expect(model.hasOwnedState).toBe(true);
    expect(model.saved.map((value) => value.id)).toEqual(["saved"]);
    expect(model.pinned.map((value) => value.id)).toEqual(["pinned"]);
    expect(model.recent.map((value) => value.id)).toEqual(["recent"]);
    expect(model.collections[0]?.items.map((value) => value.id)).toEqual(["saved"]);
    expect(model.researchInterests).toEqual(["фибрилляция предсердий"]);
    expect([...model.saved, ...model.pinned, ...model.recent].some((value) => value.id === "random")).toBe(false);
  });

  it("practice prioritizes current guidelines and task objects", () => {
    const state: UserState = { ...emptyUserState(), pinnedIds: ["pin"] };
    const model = buildPracticeHomeModel([
      item("article", "article", 100),
      item("guideline-low", "guideline", 1),
      item("guideline-high", "guideline", 20),
      item("tool", "tool", 5),
      item("pin", "article", 0),
    ], state, "cardiology");
    expect(model.currentGuidelines.map((value) => value.id)).toEqual(["guideline-high", "guideline-low"]);
    expect(model.taskObjects.map((value) => value.id)).toEqual(["tool"]);
    expect(model.pinned.map((value) => value.id)).toEqual(["pin"]);
  });
});
