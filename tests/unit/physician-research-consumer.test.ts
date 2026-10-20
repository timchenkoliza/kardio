import { describe, expect, it } from "vitest";
import type { AgentResultView } from "@/lib/agents/types";
import { agentResultMedia } from "@/lib/ui/agent-result-media";
import { filterPhysicianResearchResults, researchViewFromSearchParams } from "@/lib/ui/physician-research-view";

function result(args: Partial<AgentResultView> & Pick<AgentResultView, "id" | "title">): AgentResultView {
  return {
    key: args.id,
    agentId: "research",
    specialty: "cardiology",
    runId: "run-1",
    kind: "research_finding",
    category: "publication",
    summary: "summary",
    reasonShown: [],
    createdAt: "2026-10-20T00:00:00.000Z",
    observedAt: null,
    evidence: [{
      id: `ev-${args.id}`,
      claim: args.title,
      sourceId: args.source?.connectorId === "pubmed" ? "pubmed:1" : "catalog:1",
      sourceUrl: args.source?.sourceUrl ?? null,
      sourceType: args.source?.connectorId === "pubmed" ? "peer_reviewed" : "guideline",
      publicationDate: null,
      retrievedAt: "2026-10-20T00:00:00.000Z",
      evidenceLevel: args.source?.connectorId === "pubmed" ? "peer_reviewed" : "guideline",
      confidence: 1,
      verificationStatus: "SUPPORTED",
      verificationNote: null,
      supportText: args.title,
      provenance: args.source ?? {
        connectorId: "catalog",
        source: "РКО",
        sourceUrl: "https://scardio.ru/material",
        publisher: "РКО",
        retrievedAt: "2026-10-20T00:00:00.000Z",
        publishedAt: null,
        version: null,
        ownership: "PUBLIC_SOURCE",
        dataOrigin: "catalog_snapshot",
      },
    }],
    source: args.source ?? {
      connectorId: "catalog",
      source: "РКО",
      sourceUrl: "https://scardio.ru/material",
      publisher: "РКО",
      retrievedAt: "2026-10-20T00:00:00.000Z",
      publishedAt: null,
      version: null,
      ownership: "PUBLIC_SOURCE",
      dataOrigin: "catalog_snapshot",
    },
    actions: [],
    attributes: {},
    partner: null,
    dismissed: false,
    savedMaterialId: null,
    rank: 0,
    newSinceLastSeen: false,
    ...args,
  };
}

const baseOptions = { includeDomains: [], excludeDomains: [] } as const;

describe("physician research consumer view", () => {
  it("parses safe research view defaults, modes and exact domains", () => {
    expect(researchViewFromSearchParams({})).toEqual({ mode: "brief", sourceScope: "all", contentScope: "all", includeDomains: [], excludeDomains: [] });
    expect(researchViewFromSearchParams({ mode: "articles", scope: "international", content: "research", include: "https://www.nejm.org, pubmed.ncbi.nlm.nih.gov", exclude: "example.com" })).toEqual({
      mode: "articles",
      sourceScope: "international",
      contentScope: "research",
      includeDomains: ["nejm.org", "pubmed.ncbi.nlm.nih.gov"],
      excludeDomains: ["example.com"],
    });
  });

  it("filters shown research results by region, content group and domain for old runs", () => {
    const russianGuideline = result({ id: "ru", title: "Рекомендации РКО", category: "guideline" });
    const pubmed = result({
      id: "pm",
      title: "Randomized trial",
      source: {
        connectorId: "pubmed",
        source: "European Heart Journal",
        sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/1/",
        publisher: "PubMed / NCBI",
        retrievedAt: "2026-10-20T00:00:00.000Z",
        publishedAt: null,
        version: null,
        ownership: "PUBLIC_SOURCE",
        dataOrigin: "runtime_api",
      },
    });
    expect(filterPhysicianResearchResults([russianGuideline, pubmed], { mode: "brief", sourceScope: "russia", contentScope: "guidelines", ...baseOptions }).map(item => item.id)).toEqual(["ru"]);
    expect(filterPhysicianResearchResults([russianGuideline, pubmed], { mode: "brief", sourceScope: "international", contentScope: "research", includeDomains: ["ncbi.nlm.nih.gov"], excludeDomains: [] }).map(item => item.id)).toEqual(["pm"]);
    expect(filterPhysicianResearchResults([russianGuideline, pubmed], { mode: "brief", sourceScope: "all", contentScope: "all", includeDomains: [], excludeDomains: ["ncbi.nlm.nih.gov"] }).map(item => item.id)).toEqual(["ru"]);
  });

  it("adds only an in-house schematic of the article's subject, never evidence", () => {
    const media = agentResultMedia(result({ id: "mi", title: "Новая версия рекомендаций по инфаркту миокарда", kind: "guideline_change", category: "update" }));
    expect(media?.art).toBe("ventricle");
    expect(media?.alt).toMatch(/^Схема /u);
  });
});
