import type { SpecialtyId } from "@/lib/domain/types";

export const IMPLEMENTED_NODE_TYPES = [
  "specialty",
  "topic",
  "professional_job",
  "source",
  "organization",
  "person",
  "guideline",
  "professional_article",
  "educational_material",
  "professional_event",
  "professional_service",
  "reference_entry",
  "media_asset",
  "dataset",
  "external_artifact",
] as const;

export const RESERVED_NODE_TYPES = [
  "condition",
  "clinical_concept",
  "drug_entity",
  "procedure",
  "diagnostic_method",
  "partner",
  "research_study",
  "review",
  "drug_reference",
  "algorithm",
  "tool",
  "calculator",
  "referral_pathway",
  "course",
  "discussion",
  "distribution_post",
] as const;

export const NODE_TYPES = [...IMPLEMENTED_NODE_TYPES, ...RESERVED_NODE_TYPES] as const;

export type ImplementedNodeType = (typeof IMPLEMENTED_NODE_TYPES)[number];
export type ReservedNodeType = (typeof RESERVED_NODE_TYPES)[number];
export type NodeType = (typeof NODE_TYPES)[number];

export type OntologySpecialty = SpecialtyId | null;

export interface OntologyNode {
  id: string;
  type: NodeType;
  specialty: OntologySpecialty;
  label: string;
  /** Stable imported/source identity when one exists. */
  originalId: string | null;
  /** Namespace of the original identity, e.g. `goldenset`, `drive`, `manual`. */
  namespace: string;
  /** Attributes that belong to the entity itself, never user-specific state. */
  attributes: Readonly<Record<string, unknown>>;
  /** Immutable raw source snapshot or a small traceable pointer to it. */
  raw: Readonly<Record<string, unknown>> | null;
}

export const RELATION_TYPES = [
  "applies_to_specialty",
  "concerns",
  "useful_for_job",
  "published_by",
  "provided_by",
  "authored_by",
  "organized_by",
  "references",
  "derived_from",
  "version_of",
  "supersedes",
  "related_to",
  "contains_asset",
  "depicts",
  "features_person",
  "dataset_contains",
  "originated_from",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];
export type RelationReviewState = "candidate" | "approved" | "rejected";

export interface OntologyEdge {
  id: string;
  type: RelationType;
  fromId: string;
  toId: string;
  reviewState: RelationReviewState;
  /** Extraction/matching confidence only; never clinical truth probability. */
  confidence: number | null;
  evidenceIds: readonly string[];
  attributes: Readonly<Record<string, unknown>>;
}

export type StateDimension =
  | "currentness"
  | "editorial"
  | "rights"
  | "availability"
  | "source_standing"
  | "semantic_media_match";

export interface StateValueMap {
  currentness: "unknown" | "current" | "review" | "superseded" | "archived";
  editorial: "raw" | "candidate" | "needs_review" | "approved" | "rejected";
  rights:
    | "unknown"
    | "source_reference_only"
    | "prototype_only"
    | "approved_internal"
    | "approved_product"
    | "licensed"
    | "public_domain"
    | "rejected";
  availability: "unknown" | "available" | "temporarily_unavailable" | "broken" | "removed";
  source_standing: "observed" | "identity_verified" | "editorially_approved" | "restricted" | "rejected";
  semantic_media_match: "unknown" | "candidate" | "strong" | "exact" | "rejected";
}

export interface StateFact<D extends StateDimension = StateDimension> {
  id: string;
  nodeId: string;
  dimension: D;
  value: StateValueMap[D];
  evidenceId: string | null;
  validFrom: string;
  validUntil: string | null;
  recordedAt: string;
}

export type EvidenceTarget =
  | { kind: "node"; nodeId: string }
  | { kind: "node_property"; nodeId: string; property: string }
  | { kind: "edge"; edgeId: string }
  | { kind: "state_fact"; stateFactId: string };

export type EvidenceType =
  | "canonical_import"
  | "source_document"
  | "source_url"
  | "manual_review"
  | "derived_from_source"
  | "model_extraction"
  | "distribution_reference"
  | "rights_review"
  | "system_inference";

export type EvidenceVerification = "unverified" | "verified" | "needs_reverification" | "rejected";

export interface EvidenceRecord {
  id: string;
  target: EvidenceTarget;
  type: EvidenceType;
  sourceNodeId: string | null;
  externalUrl: string | null;
  artifactRef: string | null;
  capturedAt: string;
  verifiedAt: string | null;
  extractionMethod: string;
  /** Extraction/matching confidence only. */
  confidence: number | null;
  verification: EvidenceVerification;
  reviewer: string | null;
  rightsState: StateValueMap["rights"] | null;
  validFrom: string | null;
  expiresAt: string | null;
  notes: string | null;
}

export const DOMAIN_EVENT_TYPES = [
  "content_discovered",
  "content_ingested",
  "content_reviewed",
  "content_updated",
  "content_superseded",
  "content_archived",
  "source_verified",
  "source_unavailable",
  "event_announced",
  "event_updated",
  "event_started",
  "event_finished",
  "media_discovered",
  "media_matched",
  "media_rights_changed",
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export interface DomainEvent {
  id: string;
  type: DomainEventType;
  subjectNodeId: string;
  occurredAt: string;
  evidenceId: string | null;
  payload: Readonly<Record<string, unknown>>;
}

export interface OntologyGraph {
  nodes: readonly OntologyNode[];
  edges: readonly OntologyEdge[];
  evidence: readonly EvidenceRecord[];
  stateFacts: readonly StateFact[];
  events: readonly DomainEvent[];
}
