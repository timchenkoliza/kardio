import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { AgentResult, AgentRun } from "@/lib/agents/types";
import { researchExportBlocks } from "@/lib/agents/research-citations";
import { buildDocx } from "@/server/export/docx";
import { docxToText } from "@/server/agents/services/material";

/**
 * B1 export (docs/CAPABILITY_COVERAGE_MATRIX.md, research.literature_review):
 * the report is a real .docx — a valid ZIP package with the four required
 * parts — whose text is the same report as every other export.
 */

function entries(buffer: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extra = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const body = buffer.subarray(offset + 30 + nameLength + extra, offset + 30 + nameLength + extra + size);
    out.set(name, method === 8 ? inflateRawSync(body) : body);
    offset += 30 + nameLength + extra + size;
  }
  return out;
}

const RUN = { id: "run-docx", agentId: "research", specialty: "cardiology", startedAt: "2026-10-24T10:00:00.000Z", completedAt: "2026-10-24T10:01:00.000Z", input: { text: "Эмпаглифлозин при ХСНсФВ & <пожилые>", preferenceDigest: "" }, synthesis: "Обзоры показывают снижение госпитализаций.", status: "completed", plan: [], toolsUsed: [], resultIds: [] } as unknown as AgentRun;

function result(id: string, title: string): AgentResult {
  const provenance = { connectorId: "pubmed", source: "N Engl J Med", sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, publisher: null, retrievedAt: "2026-10-24T10:00:00.000Z", publishedAt: "2024-05-01", version: null, ownership: "PUBLIC_SOURCE" as const, dataOrigin: "runtime_api" as const };
  return { id: `res-${id}`, key: id, agentId: "research", specialty: "cardiology", runId: RUN.id, kind: "research_finding", category: null, title, summary: "Вывод авторов — в источнике.", reasonShown: [], createdAt: RUN.startedAt, observedAt: "2024-05-01", evidence: [{ id: `ev-${id}`, claim: "SGLT2 inhibitors reduced hospitalisation.", sourceId: `pubmed:${id}`, sourceUrl: provenance.sourceUrl, sourceType: "peer_reviewed", publicationDate: "2024-05-01", retrievedAt: RUN.startedAt, evidenceLevel: "peer_reviewed", confidence: 0.8, verificationStatus: "SUPPORTED", verificationNote: null, supportText: null, provenance }], source: provenance, actions: [], attributes: { journal: "N Engl J Med", year: "2024", pmid: id }, partner: null, dismissed: false, savedMaterialId: null, rank: 1 };
}

describe("DOCX export", () => {
  it("is a valid package that Word reads: content types, relationships, document, styles", () => {
    const blocks = researchExportBlocks({ run: RUN, results: [result("38000001", "Empagliflozin in HFpEF: a systematic review")], mode: "brief", citationStyle: "gost", bibliographyOrder: "appearance", includeBibliography: true });
    const file = buildDocx(blocks, { title: "Исследовательский отчёт", createdAt: RUN.completedAt! });
    expect(file.subarray(0, 2).toString("latin1")).toBe("PK");
    const parts = entries(file);
    expect([...parts.keys()]).toEqual(expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels", "word/styles.xml", "docProps/core.xml"]));
    expect(parts.get("[Content_Types].xml")!.toString("utf8")).toContain("wordprocessingml.document.main+xml");
    // Special characters of the question are escaped, never raw XML.
    const xml = parts.get("word/document.xml")!.toString("utf8");
    expect(xml).toContain("&amp; &lt;пожилые&gt;");
    expect(xml).not.toContain("<пожилые>");
    expect(xml).toContain('<w:pStyle w:val="Title"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    // Same bytes for the same input (no clock inside the package).
    expect(buildDocx(blocks, { title: "Исследовательский отчёт", createdAt: RUN.completedAt! }).equals(file)).toBe(true);
  });

  it("holds the same report as the other formats: question, summary, sources by ГОСТ", () => {
    const blocks = researchExportBlocks({ run: RUN, results: [result("38000001", "Empagliflozin in HFpEF: a systematic review")], mode: "brief", citationStyle: "gost", bibliographyOrder: "appearance", includeBibliography: true });
    const text = docxToText(buildDocx(blocks, { title: "t", createdAt: RUN.completedAt! }))!;
    expect(text).toMatch(/^Исследовательский отчёт/u);
    expect(text).toContain("Вопрос: Эмпаглифлозин при ХСНсФВ & <пожилые>");
    expect(text).toContain("Сводка");
    expect(text).toContain("Обзоры показывают снижение госпитализаций.");
    expect(text).toContain("Источники, использованные в сводке");
    expect(blocks.filter(block => block.kind === "item").length).toBeGreaterThan(0);
  });
});
