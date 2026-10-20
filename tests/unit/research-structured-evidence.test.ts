import { describe, expect, it } from "vitest";
import { parsePmcFullTextXml, parsePubmedAbstractXml, type PubmedEvidenceDocument } from "@/server/agents/adapters/pubmed-document";
import { extractStructuredResearchEvidence, enrichResearchResultsWithStructuredEvidence } from "@/server/agents/services/research-structured-evidence";
import { structuredEvidenceFromAttributes } from "@/lib/agents/research-structured-evidence";
import { researchStudyNormalizationFromAttributes } from "@/lib/agents/research-study-normalization";
import type { AgentResult } from "@/lib/agents/types";

const PUBMED_XML = `
<PubmedArticleSet><PubmedArticle><MedlineCitation><Article>
<Abstract>
<AbstractText Label="METHODS">We enrolled 120 adults with chronic heart failure. Participants were randomized to drug A or placebo. The primary endpoint was cardiovascular death or heart failure hospitalization.</AbstractText>
<AbstractText Label="RESULTS">Drug A reduced the primary endpoint versus placebo (hazard ratio 0.72; 95% CI 0.58 to 0.89; p=0.003).</AbstractText>
</Abstract></Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="pmc">PMC1234567</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>`;

const PMC_XML = `
<article><body>
<sec><title>Methods</title><p>We enrolled 120 adults with chronic heart failure.</p><p>Participants were randomized to drug A or placebo.</p><p>The primary endpoint was cardiovascular death or heart failure hospitalization.</p></sec>
<sec><title>Results</title><p>Drug A reduced the primary endpoint versus placebo (hazard ratio 0.72; 95% CI 0.58 to 0.89; p=0.003).</p></sec>
</body></article>`;

function pubmedResult(): AgentResult {
  return {
    id: "r1",
    key: "r1",
    agentId: "research",
    specialty: "cardiology",
    runId: "run-1",
    kind: "research_finding",
    category: "publication",
    title: "Trial",
    summary: "Journal",
    reasonShown: [],
    createdAt: "2026-10-20T00:00:00.000Z",
    observedAt: "2026-01-01",
    evidence: [],
    source: {
      connectorId: "pubmed",
      source: "Journal",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
      publisher: "PubMed / NCBI",
      retrievedAt: "2026-10-20T00:00:00.000Z",
      publishedAt: "2026-01-01",
      version: null,
      ownership: "PUBLIC_SOURCE",
      dataOrigin: "runtime_api",
    },
    actions: [],
    attributes: {},
    partner: null,
    dismissed: false,
    savedMaterialId: null,
    rank: 1,
  };
}

describe("structured research evidence", () => {
  it("parses abstract sections and PMCID without inventing full text", () => {
    const parsed = parsePubmedAbstractXml(PUBMED_XML);
    expect(parsed.pmcid).toBe("PMC1234567");
    expect(parsed.sections.map(section => section.label)).toEqual(["METHODS", "RESULTS"]);
    expect(parsed.sections[1]?.text).toContain("hazard ratio 0.72");
  });

  it("extracts clinical comparison fields only from explicit sentences", () => {
    const sections = parsePmcFullTextXml(PMC_XML);
    const document: PubmedEvidenceDocument = {
      pmid: "12345678",
      pmcid: "PMC1234567",
      access: "full_text",
      sections,
      sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/",
      note: null,
    };
    const structured = extractStructuredResearchEvidence(document);
    expect(structured?.fields.population?.value).toContain("120 adults");
    expect(structured?.fields.intervention?.value).toContain("randomized to drug A or placebo");
    expect(structured?.fields.comparator?.value).toContain("placebo");
    expect(structured?.fields.endpoint?.value).toContain("primary endpoint");
    expect(structured?.fields.effect?.value).toContain("hazard ratio 0.72");
    expect(structured?.access).toBe("full_text");
  });

  it("persists extracted and normalized fields with source-text provenance", async () => {
    const document: PubmedEvidenceDocument = {
      pmid: "12345678",
      pmcid: null,
      access: "abstract",
      sections: parsePubmedAbstractXml(PUBMED_XML).sections,
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
      note: "Full text unavailable",
    };
    const enriched = await enrichResearchResultsWithStructuredEvidence([pubmedResult()], { retrieve: async () => document });
    expect(enriched.enriched).toBe(1);
    expect(enriched.abstracts).toBe(1);
    const attributes = enriched.results[0]!.attributes;
    const structured = structuredEvidenceFromAttributes(attributes);
    const normalized = researchStudyNormalizationFromAttributes(attributes);
    expect(structured?.access).toBe("abstract");
    expect(structured?.fields.effect?.supportText).toContain("95% CI");
    expect(normalized?.fields.sampleSize?.value).toBe("N=120");
    expect(normalized?.fields.effectMeasure?.value).toBe("HR");
    expect(normalized?.fields.effectEstimate?.value).toBe("0.72");
    expect(normalized?.fields.confidenceInterval?.value).toBe("0.58–0.89");
    expect(normalized?.fields.pValue?.value).toBe("p = 0.003");
  });
});
