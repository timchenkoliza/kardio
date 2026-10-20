import { describe, expect, it } from "vitest";
import { defaultProfile, effectivePreference } from "@/lib/agents/profile";
import type { ContentObject } from "@/lib/domain/types";
import type { AgentContext } from "@/server/agents/context";
import { bindResearchRunOptions, catalogSourceRegion, filterCatalogForResearch } from "@/server/agents/services/research-runtime-policy";
import { searchPubmed } from "@/server/agents/tools";

function content(id: string, kind: ContentObject["kind"], sourceName: string, url: string): ContentObject {
  return {
    id,
    specialty: "cardiology",
    kind,
    type: kind,
    title: id,
    summary: id,
    sourceId: `src-${id}`,
    source: {
      id: `src-${id}`,
      specialty: "cardiology",
      name: sourceName,
      type: "journal",
      publisher: null,
      url,
      trustStatus: "observed",
      commercialStatus: "none",
      metadataCompleteness: 100,
      notes: null,
      lastCheckedAt: null,
    },
    canonicalUrl: url,
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
    priority: 0,
    author: null,
    provenance: { type: "test", asset: null, location: null, notes: null },
    asset: null,
  };
}

describe("research retrieval policy", () => {
  const russianGuideline = content("rko-guideline", "guideline", "РКО", "https://scardio.ru/recommendations/");
  const internationalGuideline = content("esc-guideline", "guideline", "ESC", "https://www.escardio.org/Guidelines");
  const internationalArticle = content("nejm-article", "article", "NEJM", "https://www.nejm.org/article");

  it("classifies catalog sources conservatively by provenance", () => {
    expect(catalogSourceRegion(russianGuideline)).toBe("russia");
    expect(catalogSourceRegion(internationalGuideline)).toBe("international");
  });

  it("filters source region and content class before catalog retrieval", () => {
    const catalog = [russianGuideline, internationalGuideline, internationalArticle];
    expect(filterCatalogForResearch(catalog, { mode: "brief", sourceScope: "russia", contentScope: "all" }).map(item => item.id)).toEqual(["rko-guideline"]);
    expect(filterCatalogForResearch(catalog, { mode: "brief", sourceScope: "international", contentScope: "guidelines" }).map(item => item.id)).toEqual(["esc-guideline"]);
    expect(filterCatalogForResearch(catalog, { mode: "articles", sourceScope: "international", contentScope: "research" }).map(item => item.id)).toEqual(["nejm-article"]);
  });

  it("does not call PubMed when the physician selected only Russian sources", async () => {
    const profile = defaultProfile("cardiology");
    bindResearchRunOptions(profile, { mode: "brief", sourceScope: "russia", contentScope: "research" });
    let calls = 0;
    const ctx: AgentContext = {
      agentId: "research",
      specialty: "cardiology",
      now: new Date("2026-10-20T00:00:00.000Z"),
      nowIso: "2026-10-20T00:00:00.000Z",
      profile,
      preference: effectivePreference(profile, "research"),
      lastSeenAt: null,
      catalog: { content: [], sources: [] },
      materials: [],
      pubmed: async query => {
        calls += 1;
        return { status: "ok", query: query.term, total: 0, articles: [], error: null, durationMs: 1 };
      },
      inputText: "фибрилляция предсердий",
    };

    const output = await searchPubmed(ctx, { term: "atrial fibrillation[tiab]", retmax: 6 });
    expect(calls).toBe(0);
    expect(output.use.status).toBe("ok");
    expect(output.use.note).toContain("только по источникам РФ");
  });
});
