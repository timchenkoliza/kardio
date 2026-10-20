import type { AgentResult, Evidence, VerificationStatus } from "./types";

export interface ResearchComparisonColumn {
  resultId: string;
  title: string;
  source: string;
  date: string | null;
  evidenceLevel: string;
  verificationStatus: VerificationStatus;
  claim: string;
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

export function buildResearchComparison(results: readonly AgentResult[], limit = 4): ResearchComparisonColumn[] {
  return [...results]
    .sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt))
    .flatMap(result => {
      const evidence = bestEvidence(result);
      if (!evidence || (evidence.verificationStatus !== "SUPPORTED" && evidence.verificationStatus !== "PARTIALLY_SUPPORTED")) return [];
      return [{
        resultId: result.id,
        title: result.title,
        source: result.source.publisher ?? result.source.source,
        date: result.observedAt ?? result.source.publishedAt,
        evidenceLevel: evidence.evidenceLevel,
        verificationStatus: evidence.verificationStatus,
        claim: evidence.claim,
      }];
    })
    .slice(0, limit);
}
