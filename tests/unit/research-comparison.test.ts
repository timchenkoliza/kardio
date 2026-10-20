import { describe, expect, it } from "vitest";
import { buildResearchComparison } from "@/lib/agents/research-comparison";
import type { AgentResult, VerificationStatus } from "@/lib/agents/types";

function result(id: string, status: VerificationStatus, rank: number): AgentResult {
  return {
    id,
    key: id,
    agentId: "research",
    specialty: "cardiology",
    runId: "run-test",
    kind: "research_finding",
    category: "publication",
    title: `Title ${id}`,
    summary: `Summary ${id}`,
    reasonShown: [],
    createdAt: "2026-10-20T00:00:00.000Z",
    observedAt: "2025-01-01",
    evidence: [{
      id: `ev-${id}`,
      claim: `Claim ${id}`,
      sourceId: `source-${id}`,
      sourceUrl: `https://example.org/${id}`,
      sourceType: "peer_reviewed",
      publicationDate: "2025-01-01",
      retrievedAt: "2026-10-20T00:00:00.000Z",
      evidenceLevel: "peer_reviewed",
      confidence: 1,
      verificationStatus: status,
      verificationNote: null,
      supportText: `Claim ${id}`,
      provenance: {
        connectorId: "pubmed",
        source: "Journal",
        sourceUrl: `https://example.org/${id}`,
        publisher: "Journal",
        retrievedAt: "2026-10-20T00:00:00.000Z",
        publishedAt: "2025-01-01",
        version: null,
        ownership: "PUBLIC_SOURCE",
        dataOrigin: "runtime_api",
      },
    }],
    source: {
      connectorId: "pubmed",
      source: "Journal",
      sourceUrl: `https://example.org/${id}`,
      publisher: "Journal",
      retrievedAt: "2026-10-20T00:00:00.000Z",
      publishedAt: "2025-01-01",
      version: null,
      ownership: "PUBLIC_SOURCE",
      dataOrigin: "runtime_api",
    },
    actions: [],
    attributes: {},
    partner: null,
    dismissed: false,
    savedMaterialId: null,
    rank,
  };
}

describe("research evidence comparison", () => {
  it("includes only supported or partially supported evidence", () => {
    const table = buildResearchComparison([
      result("a", "SUPPORTED", 1),
      result("b", "UNKNOWN", 2),
      result("c", "PARTIALLY_SUPPORTED", 3),
      result("d", "UNSUPPORTED", 4),
    ]);
    expect(table.map(column => column.resultId)).toEqual(["a", "c"]);
    expect(table.map(column => column.claim)).toEqual(["Claim a", "Claim c"]);
  });

  it("limits the matrix so the UI stays scannable", () => {
    const table = buildResearchComparison([
      result("a", "SUPPORTED", 1),
      result("b", "SUPPORTED", 2),
      result("c", "SUPPORTED", 3),
      result("d", "SUPPORTED", 4),
      result("e", "SUPPORTED", 5),
    ]);
    expect(table).toHaveLength(4);
  });
});
