import type { AgentResult } from "@/lib/agents/types";
import {
  structuredEvidenceCompleteness,
  structuredEvidenceToAttributes,
  type ResearchEvidenceField,
  type ResearchEvidenceFieldId,
  type ResearchStructuredEvidence,
} from "@/lib/agents/research-structured-evidence";
import { normalizeResearchStudy, researchStudyNormalizationToAttributes } from "@/lib/agents/research-study-normalization";
import { extractConclusion } from "../adapters/pubmed-abstracts";
import { retrievePubmedEvidenceDocument, type PubmedDocumentSection, type PubmedEvidenceDocument } from "../adapters/pubmed-document";

const FIELD_RULES: Record<ResearchEvidenceFieldId, { sectionHints: RegExp[]; sentence: RegExp }> = {
  population: {
    sectionHints: [/method/iu, /patient/iu, /participant/iu, /population/iu],
    sentence: /\b(patients?|participants?|subjects?|adults?|children|women|men|aged|mean\s+age|median\s+age|age\s+(?:range|was)|enrolled|included|with\s+[A-Za-z])/iu,
  },
  intervention: {
    sectionHints: [/method/iu, /intervention/iu, /treatment/iu, /procedure/iu],
    sentence: /\b(randomi[sz]ed\s+to|assigned\s+to|received|treated\s+with|intervention|therapy|regimen|dose[sd]?\s+of|\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|g|ml|IU))\b/iu,
  },
  comparator: {
    sectionHints: [/method/iu, /intervention/iu, /treatment/iu],
    sentence: /\b(placebo|usual\s+care|standard\s+care|control\s+group|compared\s+with|versus|\bvs\.?\b)\b/iu,
  },
  endpoint: {
    sectionHints: [/method/iu, /outcome/iu, /endpoint/iu, /result/iu],
    sentence: /\b(primary|secondary)\s+(endpoint|outcome)|\b(endpoint|outcome)\s+(was|were)|composite\s+(endpoint|outcome)|follow[- ]up/iu,
  },
  effect: {
    sectionHints: [/result/iu, /outcome/iu, /conclusion/iu],
    sentence: /\b(hazard\s+ratio|risk\s+ratio|relative\s+risk|odds\s+ratio|rate\s+ratio|mean\s+difference|HR\s*[=(:]|RR\s*[=(:]|OR\s*[=(:]|95%\s*CI|confidence\s+interval|p\s*[<=>]\s*0?\.|follow[- ]up)/iu,
  },
};

function splitSentences(value: string): string[] {
  // A point followed by a digit is a decimal point: «HR 0. 79» in a reflowed abstract does not end a sentence.
  return value
    .replace(/\s+/gu, " ")
    .replace(/(\d)\.\s+(?=\d)/gu, "$1.")
    .split(/(?<=[.!?])\s+(?=[A-ZА-Я0-9])/u)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 30 && sentence.length <= 900);
}

function wholeSentences(sentences: readonly string[], max = 760): string {
  const kept: string[] = [];
  let length = 0;
  for (const sentence of sentences) {
    const clean = sentence.replace(/\s+/gu, " ").trim();
    if (kept.length && length + clean.length + 1 > max) break;
    kept.push(clean);
    length += clean.length + 1;
  }
  return kept.join(" ");
}

function fieldFromSections(fieldId: ResearchEvidenceFieldId, sections: readonly PubmedDocumentSection[], access: "full_text" | "abstract"): ResearchEvidenceField | null {
  const rule = FIELD_RULES[fieldId];
  const ranked = [...sections].sort((a, b) => {
    const aScore = rule.sectionHints.some(pattern => pattern.test(a.label)) ? 1 : 0;
    const bScore = rule.sectionHints.some(pattern => pattern.test(b.label)) ? 1 : 0;
    return bScore - aScore;
  });
  const matches: Array<{ sentence: string; section: string }> = [];
  for (const section of ranked) {
    for (const sentence of splitSentences(section.text)) {
      if (!rule.sentence.test(sentence)) continue;
      matches.push({ sentence, section: section.label });
      if (matches.length >= 3) break;
    }
    if (matches.length >= 3) break;
  }
  if (!matches.length) return null;
  // Whole sentences only: a cut at a fixed length turned «n = 4744» into «N=47» and «P<0.001» into «p < 0».
  const supportText = wholeSentences(matches.map(match => match.sentence));
  const section = [...new Set(matches.map(match => match.section).filter(Boolean))].join(" · ") || null;
  return {
    value: supportText,
    supportText,
    section,
    confidence: access === "full_text" ? 0.9 : 0.78,
  };
}

export function extractStructuredResearchEvidence(document: PubmedEvidenceDocument): ResearchStructuredEvidence | null {
  if (document.access === "unavailable" || !document.sections.length) return null;
  const fields: ResearchStructuredEvidence["fields"] = {};
  // The abstract states the main result; a full text also carries subgroup and prognostic statistics.
  // Fields are read from the abstract first and only the missing ones from the full text.
  const abstract = document.access === "full_text" && document.abstract?.length ? document.abstract : null;
  for (const fieldId of Object.keys(FIELD_RULES) as ResearchEvidenceFieldId[]) {
    const field = (abstract ? fieldFromSections(fieldId, abstract, "abstract") : null) ?? fieldFromSections(fieldId, document.sections, document.access);
    if (field) fields[fieldId] = field;
  }
  const value: ResearchStructuredEvidence = { access: document.access, sourceUrl: document.sourceUrl, fields };
  return structuredEvidenceCompleteness(value) ? value : null;
}

function pmidFromResult(result: AgentResult): string | null {
  if (result.source.connectorId !== "pubmed" || !result.source.sourceUrl) return null;
  return result.source.sourceUrl.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/iu)?.[1] ?? null;
}

/**
 * What text the run actually read for a publication, and the authors' own
 * conclusion quoted from the abstract (original language, never paraphrased).
 */
export function evidenceTextAttributes(document: PubmedEvidenceDocument): Record<string, string> {
  const attributes: Record<string, string> = { "evidenceText.access": document.access, "evidenceText.url": document.sourceUrl };
  if (document.note) attributes["evidenceText.note"] = document.note;
  if (document.access === "unavailable") return attributes;
  const conclusion = extractConclusion(document.abstract?.length ? document.abstract : document.sections);
  if (conclusion) {
    attributes["authorsConclusion.text"] = conclusion.text;
    attributes["authorsConclusion.label"] = conclusion.label;
  }
  return attributes;
}

export interface StructuredEvidenceEnrichment {
  results: AgentResult[];
  attempted: number;
  enriched: number;
  fullText: number;
  abstracts: number;
  unavailable: number;
  notes: string[];
}

type Retriever = (pmid: string) => Promise<PubmedEvidenceDocument>;

export async function enrichResearchResultsWithStructuredEvidence(
  results: readonly AgentResult[],
  options: { limit?: number; retrieve?: Retriever } = {},
): Promise<StructuredEvidenceEnrichment> {
  const retrieve = options.retrieve ?? (pmid => retrievePubmedEvidenceDocument(pmid));
  const candidates = [...results]
    .sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt))
    .map(result => ({ result, pmid: pmidFromResult(result) }))
    .filter((entry): entry is { result: AgentResult; pmid: string } => Boolean(entry.pmid))
    .slice(0, options.limit ?? 4);

  const enrichedById = new Map(results.map(result => [result.id, structuredClone(result)]));
  let enriched = 0;
  let fullText = 0;
  let abstracts = 0;
  let unavailable = 0;
  const notes: string[] = [];

  for (const { result, pmid } of candidates) {
    const document = await retrieve(pmid);
    const current = enrichedById.get(result.id);
    if (current) current.attributes = { ...current.attributes, ...evidenceTextAttributes(document) };
    if (document.access === "unavailable") {
      unavailable += 1;
      if (document.note) notes.push(`${pmid}: ${document.note}`);
      continue;
    }
    if (document.access === "full_text") fullText += 1;
    else abstracts += 1;
    if (document.note) notes.push(`${pmid}: ${document.note}`);
    const structured = extractStructuredResearchEvidence(document);
    if (!structured || !current) continue;
    const normalized = normalizeResearchStudy(structured);
    current.attributes = {
      ...current.attributes,
      ...structuredEvidenceToAttributes(structured),
      ...researchStudyNormalizationToAttributes(normalized),
    };
    enriched += 1;
  }

  return {
    results: results.map(result => enrichedById.get(result.id) ?? structuredClone(result)),
    attempted: candidates.length,
    enriched,
    fullText,
    abstracts,
    unavailable,
    notes: [...new Set(notes)].slice(0, 6),
  };
}
