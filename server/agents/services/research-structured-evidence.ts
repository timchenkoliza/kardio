import type { AgentResult } from "@/lib/agents/types";
import {
  structuredEvidenceCompleteness,
  structuredEvidenceToAttributes,
  type ResearchEvidenceField,
  type ResearchEvidenceFieldId,
  type ResearchStructuredEvidence,
} from "@/lib/agents/research-structured-evidence";
import { retrievePubmedEvidenceDocument, type PubmedDocumentSection, type PubmedEvidenceDocument } from "../adapters/pubmed-document";

const FIELD_RULES: Record<ResearchEvidenceFieldId, { sectionHints: RegExp[]; sentence: RegExp }> = {
  population: {
    sectionHints: [/method/iu, /patient/iu, /participant/iu, /population/iu],
    sentence: /\b(patients?|participants?|subjects?|adults?|children|women|men|aged|enrolled|included|with\s+[A-Za-z])/iu,
  },
  intervention: {
    sectionHints: [/method/iu, /intervention/iu, /treatment/iu, /procedure/iu],
    sentence: /\b(randomi[sz]ed\s+to|assigned\s+to|received|treated\s+with|intervention|therapy|regimen|dose[sd]?\s+of)\b/iu,
  },
  comparator: {
    sectionHints: [/method/iu, /intervention/iu, /treatment/iu],
    sentence: /\b(placebo|usual\s+care|standard\s+care|control\s+group|compared\s+with|versus|\bvs\.?\b)\b/iu,
  },
  endpoint: {
    sectionHints: [/method/iu, /outcome/iu, /endpoint/iu, /result/iu],
    sentence: /\b(primary|secondary)\s+(endpoint|outcome)|\b(endpoint|outcome)\s+(was|were)|composite\s+(endpoint|outcome)/iu,
  },
  effect: {
    sectionHints: [/result/iu, /outcome/iu, /conclusion/iu],
    sentence: /\b(hazard\s+ratio|risk\s+ratio|relative\s+risk|odds\s+ratio|rate\s+ratio|mean\s+difference|HR\s*[=(:]|RR\s*[=(:]|OR\s*[=(:]|95%\s*CI|confidence\s+interval|p\s*[<=>]\s*0?\.)/iu,
  },
};

function splitSentences(value: string): string[] {
  return value
    .replace(/\s+/gu, " ")
    .split(/(?<=[.!?])\s+(?=[A-ZА-Я0-9])/u)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 30 && sentence.length <= 900);
}

function clampText(value: string, max = 420): string {
  const clean = value.replace(/\s+/gu, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function fieldFromSections(fieldId: ResearchEvidenceFieldId, sections: readonly PubmedDocumentSection[], access: "full_text" | "abstract"): ResearchEvidenceField | null {
  const rule = FIELD_RULES[fieldId];
  const ranked = [...sections].sort((a, b) => {
    const aScore = rule.sectionHints.some(pattern => pattern.test(a.label)) ? 1 : 0;
    const bScore = rule.sectionHints.some(pattern => pattern.test(b.label)) ? 1 : 0;
    return bScore - aScore;
  });
  for (const section of ranked) {
    for (const sentence of splitSentences(section.text)) {
      if (!rule.sentence.test(sentence)) continue;
      const supportText = clampText(sentence);
      return {
        value: supportText,
        supportText,
        section: section.label || null,
        confidence: access === "full_text" ? 0.9 : 0.78,
      };
    }
  }
  return null;
}

export function extractStructuredResearchEvidence(document: PubmedEvidenceDocument): ResearchStructuredEvidence | null {
  if (document.access === "unavailable" || !document.sections.length) return null;
  const fields: ResearchStructuredEvidence["fields"] = {};
  for (const fieldId of Object.keys(FIELD_RULES) as ResearchEvidenceFieldId[]) {
    const field = fieldFromSections(fieldId, document.sections, document.access);
    if (field) fields[fieldId] = field;
  }
  const value: ResearchStructuredEvidence = { access: document.access, sourceUrl: document.sourceUrl, fields };
  return structuredEvidenceCompleteness(value) ? value : null;
}

function pmidFromResult(result: AgentResult): string | null {
  if (result.source.connectorId !== "pubmed" || !result.source.sourceUrl) return null;
  return result.source.sourceUrl.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/iu)?.[1] ?? null;
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
    if (document.access === "unavailable") {
      unavailable += 1;
      if (document.note) notes.push(`${pmid}: ${document.note}`);
      continue;
    }
    if (document.access === "full_text") fullText += 1;
    else abstracts += 1;
    if (document.note) notes.push(`${pmid}: ${document.note}`);
    const structured = extractStructuredResearchEvidence(document);
    if (!structured) continue;
    const current = enrichedById.get(result.id);
    if (!current) continue;
    current.attributes = { ...current.attributes, ...structuredEvidenceToAttributes(structured) };
    enrichedById.set(current.id, current);
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
