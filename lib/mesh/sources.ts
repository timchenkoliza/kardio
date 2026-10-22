import type { SpecialtyId } from "@/lib/domain/types";
import type { EvidenceRequirement, JobType } from "./jobs";

/**
 * SOURCE — where evidence, data and actions come from.
 *
 * A source is not a UI route and not a capability. Its execution mode is an
 * implementation detail that can change (browser today → API tomorrow →
 * another authoritative source later) without changing the product contract:
 * downstream layers only see normalized documents, chunks and claims.
 */

export type SourceId =
  | "pubmed"
  | "openfda"
  | "medi"
  | "goldenset_catalog"
  | "esc_guidelines_snapshot"
  | "regulatory_snapshot"
  | "minzdrav_rubricator"
  | "grls";

export type SourceDomain = "drug" | "inn" | "disease" | "guideline" | "research" | "article" | "regulatory" | "event" | "learning" | "user_material";

/** official = issued by the authority; primary = original publication; professional = curated professional publisher; secondary = summary of others. */
export type SourceAuthority = "official" | "primary" | "professional" | "secondary";

export type SourceExecution = "api" | "http" | "browser" | "web-search" | "mcp" | "snapshot" | "manual-handoff";

/**
 * LIVE        executes at request time with the intended execution mode
 * LIMITED     executes, but with a reduced mode (e.g. HTTP instead of a browser) or partial coverage
 * SNAPSHOT    curated copy with a retrieval date
 * HANDOFF     not executed: the physician gets a verified link to check it themselves
 * UNAVAILABLE cannot be used right now (disabled, quota, driver missing)
 */
export type SourceStatus = "LIVE" | "LIMITED" | "SNAPSHOT" | "HANDOFF" | "UNAVAILABLE";

/** Operations a source can perform. A source implements a subset. */
export type SourceOperation =
  | "drug_reference"
  | "inn_lookup"
  | "disease_reference"
  | "guideline_discovery"
  | "professional_article_search"
  | "literature_search"
  | "drug_label"
  | "safety_signals"
  | "society_guideline"
  | "handoff";

export interface FreshnessPolicy {
  /** live: fetched at request time; versioned: fingerprints decide staleness; snapshot: curated date. */
  kind: "live" | "versioned" | "snapshot";
  /** Re-verification interval. TTL expiry means «re-check», never «false» and never «changed». */
  reverifyAfterHours: number | null;
  note: string;
}

export interface CachePolicy {
  scope: "none" | "process" | "knowledge_store";
  /** How long a fetched document may be reused without re-fetching. */
  ttlSeconds: number;
}

export interface RobotsSnapshot {
  url: string;
  checkedAt: string;
  /** Disallowed path prefixes for all user agents, verbatim from robots.txt. */
  disallow: string[];
}

export interface UsagePolicy {
  robots: RobotsSnapshot | null;
  terms: { url: string; checkedAt: string; summary: string } | null;
  audience: "healthcare_professionals" | "public";
  /** What the product may show from the source. */
  reuse: "full_text" | "excerpt_with_attribution" | "link_and_metadata" | "link_only";
  maxExcerptChars: number | null;
  attributionRequired: boolean;
  /** Requests per minute per host (politeness), when executed automatically. */
  rateLimitPerMinute: number | null;
  /** Automated access is a technical possibility, not a contract. */
  agreement: "not_required" | "none" | "requested" | "in_place";
  jurisdiction: "RU" | "US" | "INT";
  openQuestions: string[];
}

export interface SourceDescriptor {
  id: SourceId;
  name: string;
  /** Connector id used in provenance and run traces (server/agents/connectors.ts). */
  connectorId: string;
  domains: SourceDomain[];
  specialties: readonly SpecialtyId[] | "all";
  jobs: JobType[];
  provides: EvidenceRequirement[];
  operations: SourceOperation[];
  authority: SourceAuthority;
  execution: SourceExecution;
  freshnessPolicy: FreshnessPolicy;
  cachePolicy: CachePolicy;
  usagePolicy: UsagePolicy;
  /** Relative cost of one invocation (latency/quota), used to minimise calls. */
  cost: 0 | 1 | 2 | 3;
  /** Verified link for HANDOFF sources (and for «check it yourself» actions). */
  handoffUrl: string | null;
}

export interface SourceStatusReport {
  status: SourceStatus;
  reason: string;
  /** Execution actually available right now (e.g. browser → http when no browser is installed). */
  execution: SourceExecution;
}

export function servesSpecialty(descriptor: Pick<SourceDescriptor, "specialties">, specialty: SpecialtyId): boolean {
  return descriptor.specialties === "all" || descriptor.specialties.includes(specialty);
}
