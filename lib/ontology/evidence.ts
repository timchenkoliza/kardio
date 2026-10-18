import type { EvidenceRecord, EvidenceTarget, EvidenceType, EvidenceVerification, StateValueMap } from "@/lib/ontology/types";
import { effectiveEvidenceVerification } from "@/lib/ontology/states";

export interface EvidenceInput {
  id: string;
  target: EvidenceTarget;
  type: EvidenceType;
  sourceNodeId?: string | null;
  externalUrl?: string | null;
  artifactRef?: string | null;
  capturedAt: string;
  verifiedAt?: string | null;
  extractionMethod: string;
  confidence?: number | null;
  verification?: EvidenceVerification;
  reviewer?: string | null;
  rightsState?: StateValueMap["rights"] | null;
  validFrom?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
}

export function createEvidence(input: EvidenceInput): EvidenceRecord {
  if (input.confidence !== undefined && input.confidence !== null && (input.confidence < 0 || input.confidence > 1)) {
    throw new Error(`Evidence confidence must be between 0 and 1 for ${input.id}`);
  }
  return {
    id: input.id,
    target: input.target,
    type: input.type,
    sourceNodeId: input.sourceNodeId ?? null,
    externalUrl: input.externalUrl ?? null,
    artifactRef: input.artifactRef ?? null,
    capturedAt: input.capturedAt,
    verifiedAt: input.verifiedAt ?? null,
    extractionMethod: input.extractionMethod,
    confidence: input.confidence ?? null,
    verification: input.verification ?? "unverified",
    reviewer: input.reviewer ?? null,
    rightsState: input.rightsState ?? null,
    validFrom: input.validFrom ?? null,
    expiresAt: input.expiresAt ?? null,
    notes: input.notes ?? null,
  };
}

export function evidenceNeedsReverification(record: EvidenceRecord, now = new Date()): boolean {
  return effectiveEvidenceVerification({ verification: record.verification, expiresAt: record.expiresAt, now }) === "needs_reverification";
}

export function withEffectiveVerification(record: EvidenceRecord, now = new Date()): EvidenceRecord {
  return {
    ...record,
    verification: effectiveEvidenceVerification({ verification: record.verification, expiresAt: record.expiresAt, now }),
  };
}
