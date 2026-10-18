import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { distributionPostCandidates, ontologyNodes } from "./ontology-schema";

/**
 * Bounded staging for source-grounded event references.
 * These rows are not canonical ontology entities. Promotion happens only after
 * explicit resolution/review.
 */
export const eventReferenceCandidates = pgTable("event_reference_candidates", {
  id: text("id").primaryKey(),
  normalizedUrl: text("normalized_url").notNull(),
  host: text("host").notNull(),
  resolutionBasis: text("resolution_basis").$type<"explicit_scardio_event_url">().notNull(),
  reviewState: text("review_state").$type<"observed" | "needs_review" | "approved_for_promotion" | "rejected" | "promoted">().default("observed").notNull(),
  promotedNodeId: text("promoted_node_id").references(() => ontologyNodes.id),
  firstObservedAt: timestamp("first_observed_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("event_reference_normalized_url_uniq").on(table.normalizedUrl),
  index("event_reference_review_idx").on(table.reviewState),
  index("event_reference_promoted_idx").on(table.promotedNodeId),
]);

export const eventReferenceMentions = pgTable("event_reference_mentions", {
  id: text("id").primaryKey(),
  eventCandidateId: text("event_candidate_id").references(() => eventReferenceCandidates.id).notNull(),
  distributionCandidateId: text("distribution_candidate_id").references(() => distributionPostCandidates.id).notNull(),
  sourceRegistryId: text("source_registry_id").notNull(),
  linkOrdinal: integer("link_ordinal").notNull(),
  observedHref: text("observed_href").notNull(),
  sourcePresence: text("source_presence").$type<"present" | "missing">().default("present").notNull(),
  firstObservedAt: timestamp("first_observed_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("event_reference_mention_identity_uniq").on(table.distributionCandidateId, table.linkOrdinal, table.eventCandidateId),
  index("event_reference_mention_event_idx").on(table.eventCandidateId),
  index("event_reference_mention_source_idx").on(table.sourceRegistryId, table.sourcePresence),
]);

/**
 * Transport-normalized equivalence classes for event-reference URLs.
 *
 * This is deliberately not an event identity table. It collapses only transport
 * variants proven equivalent by Gate 10 (http/https and missing trailing slash)
 * while preserving query parameters and all original event_reference_candidates.
 */
export const eventReferenceTransportGroups = pgTable("event_reference_transport_groups", {
  id: text("id").primaryKey(),
  canonicalReferenceUrl: text("canonical_reference_url").notNull(),
  normalizationBasis: text("normalization_basis").$type<"scardio_transport_v1">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("event_reference_transport_url_uniq").on(table.canonicalReferenceUrl),
]);

export const eventReferenceTransportMembers = pgTable("event_reference_transport_members", {
  eventCandidateId: text("event_candidate_id").primaryKey().references(() => eventReferenceCandidates.id),
  transportGroupId: text("transport_group_id").references(() => eventReferenceTransportGroups.id).notNull(),
  mappedAt: timestamp("mapped_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
}, (table) => [
  index("event_reference_transport_member_group_idx").on(table.transportGroupId),
]);
