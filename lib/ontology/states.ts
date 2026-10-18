import type { EvidenceVerification, StateDimension, StateFact, StateValueMap } from "@/lib/ontology/types";

export const CURRENTNESS_VALUES = ["unknown", "current", "review", "superseded", "archived"] as const;
export const EDITORIAL_VALUES = ["raw", "candidate", "needs_review", "approved", "rejected"] as const;
export const RIGHTS_VALUES = ["unknown", "source_reference_only", "prototype_only", "approved_internal", "approved_product", "licensed", "public_domain", "rejected"] as const;
export const AVAILABILITY_VALUES = ["unknown", "available", "temporarily_unavailable", "broken", "removed"] as const;
export const SOURCE_STANDING_VALUES = ["observed", "identity_verified", "editorially_approved", "restricted", "rejected"] as const;
export const SEMANTIC_MEDIA_MATCH_VALUES = ["unknown", "candidate", "strong", "exact", "rejected"] as const;

export const STATE_VALUES: Readonly<Record<StateDimension, readonly string[]>> = {
  currentness: CURRENTNESS_VALUES,
  editorial: EDITORIAL_VALUES,
  rights: RIGHTS_VALUES,
  availability: AVAILABILITY_VALUES,
  source_standing: SOURCE_STANDING_VALUES,
  semantic_media_match: SEMANTIC_MEDIA_MATCH_VALUES,
};

export function isStateValue<D extends StateDimension>(dimension: D, value: string): value is StateValueMap[D] {
  return STATE_VALUES[dimension].includes(value);
}

export function latestStateFact<D extends StateDimension>(facts: readonly StateFact<D>[], dimension: D): StateFact<D> | null {
  const matching = facts.filter((fact) => fact.dimension === dimension);
  if (!matching.length) return null;
  return [...matching].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0] ?? null;
}

export function effectiveEvidenceVerification(args: {
  verification: EvidenceVerification;
  expiresAt: string | null;
  now?: Date;
}): EvidenceVerification {
  if (args.verification !== "verified" || !args.expiresAt) return args.verification;
  const expiresAt = new Date(args.expiresAt);
  const now = args.now ?? new Date();
  if (Number.isNaN(expiresAt.getTime())) return args.verification;
  return expiresAt.getTime() <= now.getTime() ? "needs_reverification" : "verified";
}
