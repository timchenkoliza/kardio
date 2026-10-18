import { describe, expect, it } from "vitest";
import type { ContentObject, Source } from "@/lib/domain/types";
import { buildContentCompletenessSnapshot, educationContent, uniqueCuratedSourceCount } from "@/lib/ui/content-completeness";
import { curatedSourcesForSurface } from "@/lib/ui/curated-external-tools";

function source(overrides: Partial<Source> & Pick<Source, "id" | "name">): Source {
  return {
    id: overrides.id,
    specialty: overrides.specialty ?? "cardiology",
    name: overrides.name,
    type: overrides.type ?? "journal",
    publisher: overrides.publisher ?? null,
    url: overrides.url ?? null,
    trustStatus: overrides.trustStatus ?? "observed",
    commercialStatus: overrides.commercialStatus ?? "unknown",
    metadataCompleteness: overrides.metadataCompleteness ?? 100,
    notes: overrides.notes ?? null,
    lastCheckedAt: overrides.lastCheckedAt ?? null,
  };
}

function content(overrides: Partial<ContentObject> & Pick<ContentObject, "id" | "title">): ContentObject {
  const itemSource = overrides.source ?? source({ id: overrides.sourceId ?? "source-a", name: "Источник" });
  return {
    id: overrides.id,
    specialty: overrides.specialty ?? "cardiology",
    kind: overrides.kind ?? "article",
    type: overrides.type ?? "article",
    title: overrides.title,
    summary: overrides.summary ?? "",
    sourceId: overrides.sourceId ?? itemSource.id,
    source: itemSource,
    canonicalUrl: overrides.canonicalUrl ?? null,
    publicationDate: overrides.publicationDate ?? null,
    publicationYear: overrides.publicationYear ?? null,
    updatedAt: overrides.updatedAt ?? null,
    lastCheckedAt: overrides.lastCheckedAt ?? null,
    language: overrides.language ?? "ru",
    topics: overrides.topics ?? [],
    tags: overrides.tags ?? [],
    currentness: overrides.currentness ?? "current",
    requiresReview: overrides.requiresReview ?? false,
    freshness: overrides.freshness ?? "unknown",
    version: overrides.version ?? null,
    parentId: overrides.parentId ?? null,
    supersedesId: overrides.supersedesId ?? null,
    supersededById: overrides.supersededById ?? null,
    trustLayer: overrides.trustLayer ?? "source",
    editorialStatus: overrides.editorialStatus ?? "reviewed",
    rightsStatus: overrides.rightsStatus ?? "needs_rights_review",
    priority: overrides.priority ?? 0,
    author: overrides.author ?? null,
    provenance: overrides.provenance ?? { type: "test", asset: null, location: null, notes: null },
    asset: overrides.asset ?? null,
  };
}

describe("content completeness gate read model", () => {
  it("keeps curated surfaces specialty-safe", () => {
    expect(curatedSourcesForSurface("cardiology", "education").map(item => item.id)).toContain("1med");
    expect(curatedSourcesForSurface("cardiology", "tools").map(item => item.id)).not.toContain("cancer-risk-calculators");
    expect(curatedSourcesForSurface("oncology", "tools").map(item => item.id)).toEqual(expect.arrayContaining(["cancer-risk-calculators", "cancer-survival-rates"]));
    expect(curatedSourcesForSurface("cardiology", "referral").map(item => item.id)).toEqual(expect.arrayContaining(["vmp-program-2026", "vmp-minzdrav-explainer"]));
  });

  it("finds education from canonical videos and explicit education tags", () => {
    const items = [
      content({ id: "video", title: "Лекция", kind: "video" }),
      content({ id: "course", title: "Курс", tags: ["образование"] }),
      content({ id: "article", title: "Статья" }),
    ];
    expect(educationContent(items).map(item => item.id)).toEqual(["video", "course"]);
  });

  it("does not count an external event reference as an event destination", () => {
    const withoutCanonicalEvent = buildContentCompletenessSnapshot({
      specialty: "cardiology",
      content: [content({ id: "article", title: "Ссылка на событие", kind: "article", tags: ["событие"] })],
      sources: [],
    });
    expect(withoutCanonicalEvent.destinations.find(item => item.destination === "events")?.ready).toBe(false);

    const withCanonicalEvent = buildContentCompletenessSnapshot({
      specialty: "cardiology",
      content: [content({ id: "event", title: "Конгресс", kind: "event" })],
      sources: [],
    });
    expect(withCanonicalEvent.destinations.find(item => item.destination === "events")?.ready).toBe(true);
  });

  it("deduplicates curated source extras against canonical names and urls", () => {
    const baseline = uniqueCuratedSourceCount("cardiology", []);
    const canonicalRko = source({ id: "canonical-rko", name: "Российское кардиологическое общество", url: "https://scardio.ru/" });
    expect(uniqueCuratedSourceCount("cardiology", [canonicalRko])).toBe(baseline - 1);
  });

  it("marks reference, education, tools, imaging and VMP ready without promoting external resources into canonical counts", () => {
    const snapshot = buildContentCompletenessSnapshot({ specialty: "cardiology", content: [], sources: [] });
    const byDestination = new Map(snapshot.destinations.map(item => [item.destination, item]));

    expect(byDestination.get("reference")?.ready).toBe(true);
    expect(byDestination.get("reference")?.canonicalObjects).toBe(0);
    expect(byDestination.get("education")?.ready).toBe(true);
    expect(byDestination.get("tools")?.canonicalObjects).toBe(2);
    expect(byDestination.get("imaging")?.ready).toBe(true);
    expect(byDestination.get("referral")?.ready).toBe(true);
    expect(byDestination.get("referral")?.canonicalObjects).toBe(0);
    expect(byDestination.get("events")?.ready).toBe(false);
  });
});
