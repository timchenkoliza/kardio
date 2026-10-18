import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  DomainEventType,
  EvidenceType,
  EvidenceVerification,
  NodeType,
  RelationReviewState,
  RelationType,
  StateDimension,
} from "@/lib/ontology/types";
import type { SpecialtyId } from "@/lib/domain/types";

export const ontologyNodes = pgTable("ontology_nodes", {
  id: text("id").primaryKey(),
  type: text("type").$type<NodeType>().notNull(),
  specialty: text("specialty").$type<SpecialtyId>(),
  label: text("label").notNull(),
  originalId: text("original_id"),
  namespace: text("namespace").notNull(),
  attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull(),
  raw: jsonb("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("ontology_nodes_type_idx").on(table.type),
  index("ontology_nodes_specialty_type_idx").on(table.specialty, table.type),
  index("ontology_nodes_original_idx").on(table.namespace, table.originalId),
]);

export const ontologyEdges = pgTable("ontology_edges", {
  id: text("id").primaryKey(),
  type: text("type").$type<RelationType>().notNull(),
  // Hard-delete is intentionally restricted by the default NO ACTION FK policy.
  // Retire/deprecate ontology facts through state/review transitions instead of cascading history away.
  fromId: text("from_id").references(() => ontologyNodes.id).notNull(),
  toId: text("to_id").references(() => ontologyNodes.id).notNull(),
  reviewState: text("review_state").$type<RelationReviewState>().notNull(),
  confidence: doublePrecision("confidence"),
  attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("ontology_edges_from_type_idx").on(table.fromId, table.type),
  index("ontology_edges_to_type_idx").on(table.toId, table.type),
]);

export const evidenceRecords = pgTable("evidence_records", {
  id: text("id").primaryKey(),
  targetKind: text("target_kind").notNull(),
  targetId: text("target_id").notNull(),
  targetProperty: text("target_property"),
  type: text("type").$type<EvidenceType>().notNull(),
  // Provenance should block destructive source-node deletion instead of silently losing the source link.
  sourceNodeId: text("source_node_id").references(() => ontologyNodes.id),
  externalUrl: text("external_url"),
  artifactRef: text("artifact_ref"),
  capturedAt: timestamp("captured_at", { withTimezone: true, mode: "string" }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }),
  extractionMethod: text("extraction_method").notNull(),
  confidence: doublePrecision("confidence"),
  verification: text("verification").$type<EvidenceVerification>().notNull(),
  reviewer: text("reviewer"),
  rightsState: text("rights_state"),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "string" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
  notes: text("notes"),
}, (table) => [
  index("evidence_target_idx").on(table.targetKind, table.targetId),
  index("evidence_source_idx").on(table.sourceNodeId),
  index("evidence_expiry_idx").on(table.expiresAt),
]);

export const ontologyEdgeEvidence = pgTable("ontology_edge_evidence", {
  edgeId: text("edge_id").references(() => ontologyEdges.id).notNull(),
  evidenceId: text("evidence_id").references(() => evidenceRecords.id).notNull(),
}, (table) => [primaryKey({ columns: [table.edgeId, table.evidenceId] })]);

export const nodeStateFacts = pgTable("node_state_facts", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").references(() => ontologyNodes.id).notNull(),
  dimension: text("dimension").$type<StateDimension>().notNull(),
  value: text("value").notNull(),
  evidenceId: text("evidence_id").references(() => evidenceRecords.id),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "string" }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true, mode: "string" }),
  recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [
  index("node_state_history_idx").on(table.nodeId, table.dimension, table.recordedAt),
]);

export const ontologyDomainEvents = pgTable("ontology_domain_events", {
  id: text("id").primaryKey(),
  type: text("type").$type<DomainEventType>().notNull(),
  subjectNodeId: text("subject_node_id").references(() => ontologyNodes.id).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
  evidenceId: text("evidence_id").references(() => evidenceRecords.id),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
}, (table) => [
  index("ontology_events_subject_idx").on(table.subjectNodeId, table.occurredAt),
  index("ontology_events_type_idx").on(table.type, table.occurredAt),
]);

/**
 * Operational metadata for raw external archives (Google Drive/local mirror).
 * Raw bytes are never stored in ordinary relational columns.
 */
export const rawArchiveArtifacts = pgTable("raw_archive_artifacts", {
  ontologyNodeId: text("ontology_node_id").references(() => ontologyNodes.id).primaryKey(),
  provider: text("provider").notNull(),
  providerItemId: text("provider_item_id").notNull(),
  parentProviderItemId: text("parent_provider_item_id"),
  sourceRegistryId: text("source_registry_id"),
  specialty: text("specialty").$type<SpecialtyId>(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: doublePrecision("size"),
  providerModifiedAt: timestamp("provider_modified_at", { withTimezone: true, mode: "string" }),
  checksum: text("checksum"),
  materializedLocator: text("materialized_locator"),
  syncState: text("sync_state").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (table) => [
  // One provider item should map to one raw-archive record. Deterministic node IDs remain the primary identity.
  uniqueIndex("raw_archive_provider_item_uniq").on(table.provider, table.providerItemId),
  index("raw_archive_specialty_idx").on(table.specialty, table.sourceRegistryId),
]);
