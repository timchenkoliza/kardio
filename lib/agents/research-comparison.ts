import { structuredEvidenceFromAttributes, structuredEvidenceCompleteness, type ResearchEvidenceFieldId, type ResearchStructuredEvidence } from "./research-structured-evidence";
import {
  normalizeResearchStudy,
  researchStudyNormalizationCompleteness,
  researchStudyNormalizationFromAttributes,
  type ResearchStudyField,
  type ResearchStudyFieldId,
  type ResearchStudyNormalization,
} from "./research-study-normalization";
import type { AgentResult, Evidence, VerificationStatus } from "./types";

export interface ResearchComparisonColumn {
  resultId: string;
  title: string;
  source: string;
  date: string | null;
  evidenceLevel: string;
  verificationStatus: VerificationStatus;
  /** The fact check's reasons, so the label says what was checked (citation, journal, version). */
  verificationNote: string | null;
  claim: string;
  structured: ResearchStructuredEvidence | null;
  structuredCompleteness: number;
  normalized: ResearchStudyNormalization | null;
  normalizedCompleteness: number;
}

const STATUS_WEIGHT: Record<VerificationStatus, number> = {
  SUPPORTED: 3,
  PARTIALLY_SUPPORTED: 2,
  UNKNOWN: 1,
  UNSUPPORTED: 0,
};

function bestEvidence(result: AgentResult): Evidence | null {
  if (!result.evidence.length) return null;
  return [...result.evidence].sort((a, b) => STATUS_WEIGHT[b.verificationStatus] - STATUS_WEIGHT[a.verificationStatus] || b.confidence - a.confidence)[0] ?? null;
}

export function structuredFieldValue(column: ResearchComparisonColumn, field: ResearchEvidenceFieldId): string | null {
  return column.structured?.fields[field]?.value ?? null;
}

export function normalizedStudyField(column: ResearchComparisonColumn, field: ResearchStudyFieldId): ResearchStudyField | null {
  return column.normalized?.fields[field] ?? null;
}

export function buildResearchComparison(results: readonly AgentResult[], limit = 4): ResearchComparisonColumn[] {
  return [...results]
    .sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt))
    .flatMap(result => {
      const evidence = bestEvidence(result);
      if (!evidence || (evidence.verificationStatus !== "SUPPORTED" && evidence.verificationStatus !== "PARTIALLY_SUPPORTED")) return [];
      // Only studies are compared; catalog pages and news are not studies.
      if (evidence.evidenceLevel !== "peer_reviewed") return [];
      const structured = structuredEvidenceFromAttributes(result.attributes);
      // Backward compatibility for runs created before normalized fields were persisted.
      const normalized = researchStudyNormalizationFromAttributes(result.attributes) ?? normalizeResearchStudy(structured);
      return [{
        resultId: result.id,
        title: result.title,
        // The journal the check is about («European heart journal»), PubMed being only the way to it.
        source: (typeof result.attributes.journal === "string" && result.attributes.journal) || result.source.publisher || result.source.source,
        date: result.observedAt ?? result.source.publishedAt,
        evidenceLevel: evidence.evidenceLevel,
        verificationStatus: evidence.verificationStatus,
        verificationNote: evidence.verificationNote ?? null,
        claim: evidence.claim,
        structured,
        structuredCompleteness: structuredEvidenceCompleteness(structured),
        normalized,
        normalizedCompleteness: researchStudyNormalizationCompleteness(normalized),
      }];
    })
    .slice(0, limit);
}
