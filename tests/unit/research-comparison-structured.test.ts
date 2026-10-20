import { describe, expect, it } from "vitest";
import { buildResearchComparison, structuredFieldValue } from "@/lib/agents/research-comparison";
import { structuredEvidenceToAttributes } from "@/lib/agents/research-structured-evidence";
import type { AgentResult } from "@/lib/agents/types";

function result(id: string): AgentResult {
  return {
    id,
    key: id,
    agentId: "research",
    specialty: "cardiology",
    runId: "run-1",
    kind: "research_finding",
    category: "publication",
    title: `Trial ${id}`,
    summary: "Journal",
    reasonShown: [],
    createdAt: "2026-10-20T00:00:00.000Z",
    observedAt: "2026-01-01",
    evidence: [{
      id: `ev-${id}`,
      claim: `Published ${id}`,
      sourceId: `pubmed:${id}`,
      sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      sourceType: "peer_reviewed",
      publicationDate: "2026-01-01",
      retrievedAt: "2026-10-20T00:00:00.000Z",
      evidenceLevel: "peer_reviewed",
      confidence: 1,
      verificationStatus: "SUPPORTED",
      verificationNote: null,
      supportText: `Published ${id}`,
      provenance: {
        connectorId: "pubmed",
        source: "Journal",
        sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        publisher: "PubMed / NCBI",
        retrievedAt: "2026-10-20T00:00:00.000Z",
        publishedAt: "2026-01-01",
        version: null,
        ownership: "PUBLIC_SOURCE",
        dataOrigin: "runtime_api",
      },
    }],
    source: {
      connectorId: "pubmed",
      source: "Journal",
      sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      publisher: "PubMed / NCBI",
      retrievedAt: "2026-10-20T00:00:00.000Z",
      publishedAt: "2026-01-01",
      version: null,
      ownership: "PUBLIC_SOURCE",
      dataOrigin: "runtime_api",
    },
    actions: [],
    attributes: structuredEvidenceToAttributes({
      access: "full_text",
      sourceUrl: `https://pmc.ncbi.nlm.nih.gov/articles/PMC${id}/`,
      fields: {
        population: { value: "120 adults with heart failure.", supportText: "120 adults with heart failure.", section: "Methods", confidence: 0.9 },
        effect: { value: "Hazard ratio 0.72; 95% CI 0.58 to 0.89.", supportText: "Hazard ratio 0.72; 95% CI 0.58 to 0.89.", section: "Results", confidence: 0.9 },
      },
    }),
    partner: null,
    dismissed: false,
    savedMaterialId: null,
    rank: 1,
  };
}

describe("structured evidence comparison", () => {
  it("surfaces only persisted structured fields", () => {
    const [column] = buildResearchComparison([result("123")]);
    expect(column?.structured?.access).toBe("full_text");
    expect(column?.structuredCompleteness).toBe(2);
    expect(column && structuredFieldValue(column, "population")).toContain("120 adults");
    expect(column && structuredFieldValue(column, "comparator")).toBeNull();
  });
});
