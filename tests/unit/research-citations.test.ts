import { describe, expect, it } from "vitest";
import {
  buildResearchExport,
  formatResearchCitation,
  researchSourceBuckets,
} from "@/lib/agents/research-citations";
import type { AgentResult, AgentRun, VerificationStatus } from "@/lib/agents/types";

function result(id: string, status: VerificationStatus, rank: number, url = `https://example.org/${id}`): AgentResult {
  return {
    id,
    key: id,
    agentId: "research",
    specialty: "cardiology",
    runId: "run-00000000-0000-0000-0000-000000000001",
    kind: "research_finding",
    category: "publication",
    title: `Материал ${id}`,
    summary: `Краткое содержание ${id}`,
    reasonShown: [],
    createdAt: "2026-10-20T00:00:00.000Z",
    observedAt: "2025-05-12",
    evidence: [{
      id: `ev-${id}`,
      claim: `Материал ${id}`,
      sourceId: `source-${id}`,
      sourceUrl: url,
      sourceType: "peer_reviewed",
      publicationDate: "2025-05-12",
      retrievedAt: "2026-10-20T00:00:00.000Z",
      evidenceLevel: "peer_reviewed",
      confidence: 1,
      verificationStatus: status,
      verificationNote: null,
      supportText: `Материал ${id}`,
      provenance: {
        connectorId: "pubmed",
        source: "Journal",
        sourceUrl: url,
        publisher: "Journal",
        retrievedAt: "2026-10-20T00:00:00.000Z",
        publishedAt: "2025-05-12",
        version: null,
        ownership: "PUBLIC_SOURCE",
        dataOrigin: "runtime_api",
      },
    }],
    source: {
      connectorId: "pubmed",
      source: "Journal",
      sourceUrl: url,
      publisher: "Journal",
      retrievedAt: "2026-10-20T00:00:00.000Z",
      publishedAt: "2025-05-12",
      version: null,
      ownership: "PUBLIC_SOURCE",
      dataOrigin: "runtime_api",
    },
    actions: [],
    attributes: id === "a" ? { doi: "10.1000/test" } : {},
    partner: null,
    dismissed: false,
    savedMaterialId: null,
    rank,
  };
}

const run: AgentRun = {
  id: "run-00000000-0000-0000-0000-000000000001",
  agentId: "research",
  specialty: "cardiology",
  trigger: "composer",
  startedAt: "2026-10-20T00:00:00.000Z",
  completedAt: "2026-10-20T00:00:02.000Z",
  status: "completed",
  input: { text: "Тестовый вопрос", preferenceDigest: "" },
  intent: "research_question",
  plan: [],
  toolsUsed: [],
  resultIds: ["a", "b", "c"],
  newResultCount: 3,
  error: null,
  durationMs: 2000,
  riskNotices: [],
  synthesis: "Короткая проверяемая сводка.",
};

describe("research citations and exports", () => {
  it("marks only SUPPORTED findings as directly used by the current brief synthesis", () => {
    const buckets = researchSourceBuckets([
      result("a", "SUPPORTED", 1),
      result("b", "UNKNOWN", 2),
      result("c", "PARTIALLY_SUPPORTED", 3),
    ], "brief");
    expect(buckets.used.map(item => item.id)).toEqual(["a"]);
    expect(buckets.additional.map(item => item.id)).toEqual(["b", "c"]);
  });

  it("treats every visible row as directly used in article-table mode", () => {
    const buckets = researchSourceBuckets([
      result("a", "SUPPORTED", 1),
      result("b", "UNKNOWN", 2),
    ], "articles");
    expect(buckets.used.map(item => item.id)).toEqual(["a", "b"]);
    expect(buckets.additional).toEqual([]);
  });

  it("formats only available metadata in GOST APA and MLA templates", () => {
    const item = result("a", "SUPPORTED", 1);
    expect(formatResearchCitation(item, "gost", run.completedAt!)).toContain("DOI: 10.1000/test");
    expect(formatResearchCitation(item, "apa", run.completedAt!)).toContain("https://doi.org/10.1000/test");
    expect(formatResearchCitation(item, "mla", run.completedAt!)).toContain("doi:10.1000/test");
  });

  it("builds Markdown RTF and LaTeX without inventing bibliography when disabled", () => {
    const results = [result("a", "SUPPORTED", 1), result("b", "UNKNOWN", 2)];
    const markdown = buildResearchExport({ run, results, mode: "brief", citationStyle: "gost", bibliographyOrder: "appearance", includeBibliography: false, format: "markdown" });
    expect(markdown).toContain("# Исследовательский отчёт");
    expect(markdown).not.toContain("Источники, использованные в сводке");
    expect(buildResearchExport({ run, results, mode: "brief", citationStyle: "apa", bibliographyOrder: "appearance", includeBibliography: true, format: "rtf" })).toMatch(/^\{\\rtf1/);
    expect(buildResearchExport({ run, results, mode: "brief", citationStyle: "mla", bibliographyOrder: "alphabetical", includeBibliography: true, format: "latex" })).toContain("\\begin{document}");
  });

  it("escapes LaTeX metacharacters in report content", () => {
    const special = { ...result("a", "SUPPORTED", 1), title: "A&B_1 {trial}" };
    const latex = buildResearchExport({ run, results: [special], mode: "brief", citationStyle: "gost", bibliographyOrder: "appearance", includeBibliography: true, format: "latex" });
    expect(latex).toContain("A\\&B\\_1 \\{trial\\}");
  });
});
