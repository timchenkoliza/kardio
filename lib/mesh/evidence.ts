import type { VerificationStatus } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import type { CapabilityState } from "@/lib/portal/cards";
import type { PortalJob } from "@/lib/portal/jobs";
import type { EvidenceRequirement, JobType } from "./jobs";
import type { SourceAuthority, SourceExecution, SourceId, SourceOperation, SourceStatus } from "./sources";

/**
 * Normalized evidence: every source adapter returns these shapes and nothing
 * else. The Experience layer never sees raw pages, API payloads or HTML.
 *
 *   Source → Document → Version → SemanticChunk → Entity → Claim
 */

export type EntityKind = "drug" | "product" | "nosology" | "subtype" | "population";

export interface EntityRef {
  /** Deterministic id: `drug:empagliflozin`, `nosology:cardiology/heart_failure`, `product:medi:dzhardins_6916`. */
  id: string;
  kind: EntityKind;
  label: string;
  codes?: { inn?: string; icd10?: string[]; atc?: string; registration?: string };
}

export type DocumentKind =
  | "drug_instruction"
  | "drug_label"
  | "inn_listing"
  | "guideline"
  | "review"
  | "guideline_publication"
  | "society_guideline_summary"
  | "regulatory_signal"
  | "catalog_item";

export interface DocumentVersion {
  /** Content fingerprint of the normalized document (sha-256 of its chunks). */
  fingerprint: string;
  /** What the source itself calls the version (year, revision, label version), when it says so. */
  label: string | null;
  /** Date the source attaches to this version, when it states one. */
  date: string | null;
}

export interface SemanticChunk {
  id: string;
  documentId: string;
  /** Section path as the source names it, e.g. ["3. Лечение", "3.1.11 Лечение больных с сохраненной фракцией выброса…"]. */
  path: string[];
  heading: string;
  /** Excerpt kept under the source's usage policy (never the whole page). */
  text: string;
  /** sha-256 of the full normalized section text (detects change even when the excerpt is shortened). */
  fingerprint: string;
  entityIds: string[];
  truncated: boolean;
}

export type ClaimKind =
  | "indication"
  | "contraindication"
  | "warning"
  | "dosing"
  | "label_section"
  | "guideline_statement"
  | "guideline_metadata"
  | "drug_not_mentioned"
  | "review_conclusion"
  | "society_assertion"
  | "regulatory_signal"
  | "product_listing"
  | "currentness";

export type ClaimMethod = "verbatim" | "metadata" | "rule_derived" | "absence_check";

export interface NormalizedClaim {
  id: string;
  documentId: string;
  chunkId: string | null;
  kind: ClaimKind;
  /** What is shown. For `verbatim` it is the quote itself; for derived claims a fixed template filled with source values. */
  statement: string;
  quote: string | null;
  language: "ru" | "en";
  /** Direction of the statement about its subject, decided by deterministic rules (never a model). */
  polarity: "positive" | "negative" | "neutral";
  entityIds: string[];
  /** Subtype coverage stated by the source (e.g. «независимо от фракции выброса» covers all subtypes). */
  covers: string[];
  method: ClaimMethod;
  /** Extraction/matching confidence in [0,1] — never the probability that the statement is true. */
  confidence: number;
  verification: VerificationStatus;
  verificationNote: string | null;
}

export interface NormalizedDocument {
  id: string;
  sourceId: SourceId;
  kind: DocumentKind;
  title: string;
  url: string;
  language: "ru" | "en";
  publisher: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  version: DocumentVersion;
  jurisdiction: "RU" | "US" | "INT";
  authority: SourceAuthority;
  state: CapabilityState;
  /** Source-stated facts about the document (registration number, ICD-10, approval note…). */
  attributes: Record<string, string | number | boolean | null>;
  chunks: SemanticChunk[];
  claims: NormalizedClaim[];
  entities: EntityRef[];
  /** Persisted result this document became (for save / open tracking). */
  resultKey?: string;
}

export type SourceOutcome = "ok" | "empty" | "failed" | "unavailable" | "handoff" | "blocked";

export interface SourceInvocation {
  stepId: string;
  sourceId: SourceId;
  operation: SourceOperation;
  requirement: EvidenceRequirement;
  outcome: SourceOutcome;
  status: SourceStatus;
  execution: SourceExecution;
  durationMs: number;
  /** Machine-readable failure, e.g. `layout_changed:#content h1`, `robots_disallow:/search`, `http_503`. */
  errorCode: string | null;
  note: string | null;
  documentIds: string[];
  /** Pages actually opened (provenance of the execution itself). */
  urls: string[];
}

export interface SourceResult {
  invocation: SourceInvocation;
  documents: NormalizedDocument[];
}

/* ------------------------------------------------------------------ */
/* Evidence Graph v0.1                                                 */
/* ------------------------------------------------------------------ */

export type RelationType =
  | "supported_by"      // claim → document (and chunk)
  | "about"             // claim → entity
  | "agrees_with"       // claim ↔ claim
  | "conflicts_with"    // claim ↔ claim
  | "not_mentioned_in"  // entity → document
  | "listed_in"         // product entity → listing document
  | "version_of";       // document → document (same work, other version)

export interface GraphRelation {
  id: string;
  type: RelationType;
  from: string;
  to: string;
  /** Rule-derived relations stay candidates until promoted under policy. */
  status: "asserted" | "candidate";
  method: string;
  note: string | null;
}

export interface GraphConflict {
  id: string;
  claimIds: [string, string];
  kind: "polarity" | "temporal_divergence" | "jurisdiction";
  /** Facts that explain the divergence (dates, jurisdictions) — never a verdict on who is right. */
  explanation: string;
  resolution: "unresolved";
}

export type FreshnessState = "live" | "snapshot" | "revision_overdue" | "needs_reverification" | "unknown";

export interface GraphFreshness {
  documentId: string;
  state: FreshnessState;
  reason: string;
  checkedAt: string;
}

/** `pending`: the planned source has not answered yet (progressive runs only) — neither met nor a gap. */
export type CoverageState = "met" | "partial" | "missing" | "handoff" | "pending";

export interface GraphSource {
  id: SourceId;
  name: string;
  authority: SourceAuthority;
  status: SourceStatus;
  execution: SourceExecution;
  invoked: boolean;
  /** `pending`: still being checked in a progressive run. */
  outcome: SourceOutcome | "not_invoked" | "pending";
  handoffUrl: string | null;
  requirement: EvidenceRequirement | null;
}

export interface GraphDocument extends Omit<NormalizedDocument, "chunks" | "claims" | "entities"> {
  chunkIds: string[];
}

export interface EvidenceGraph {
  schema: "kardio.evidence-graph/0.1";
  id: string;
  createdAt: string;
  job: JobType;
  family: PortalJob;
  specialty: SpecialtyId;
  /** Interpreted question context; `terms` are lowercase words that make a claim on-topic (drug INN/names, drug class, subtype). */
  context: { nosology: string | null; subtype: string | null; drugs: string[]; terms?: string[]; asked?: string[][]; conditions?: string[]; topics?: string[][] };
  sources: GraphSource[];
  documents: GraphDocument[];
  versions: Array<{ documentId: string } & DocumentVersion>;
  chunks: SemanticChunk[];
  entities: EntityRef[];
  claims: NormalizedClaim[];
  relations: GraphRelation[];
  conflicts: GraphConflict[];
  freshness: GraphFreshness[];
  confidence: { extractionMin: number; extractionMean: number; coverage: Partial<Record<EvidenceRequirement, CoverageState>> };
  /** Requirement-level gaps, in physician language. */
  gaps: string[];
  /** False while planned sources are still being checked (a validated partial graph). Absent on older graphs = complete. */
  complete?: boolean;
}

/**
 * Marks a claim quoted from an instruction passage about the population the question names (`NormalizedClaim.covers`):
 * the key takeaway reads these first (R1 C-4).
 */
export const POPULATION_PASSAGE = "focus:population";
