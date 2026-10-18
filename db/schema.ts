import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import type { Asset, ContentKind, ContentObject, Currentness, Source, SpecialtyId, UserState } from "@/lib/domain/types";

export const datasets = pgTable("datasets", {
  id: text("id").primaryKey(), specialty: text("specialty").$type<SpecialtyId>().notNull(),
  checksum: text("checksum").notNull(), raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
  manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
  enrichment: jsonb("enrichment").$type<Record<string, unknown>>().notNull(),
  evaluationManifest: jsonb("evaluation_manifest").$type<Record<string, unknown>>().notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sources = pgTable("sources", {
  id: text("id").notNull(), specialty: text("specialty").$type<SpecialtyId>().notNull(),
  name: text("name").notNull(), type: text("type").notNull(), publisher: text("publisher"), url: text("url"),
  trustStatus: text("trust_status").notNull(), commercialStatus: text("commercial_status").notNull(),
  metadataCompleteness: integer("metadata_completeness").notNull(), notes: text("notes"), lastCheckedAt: text("last_checked_at"),
  raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
}, (table) => [primaryKey({ columns: [table.specialty, table.id] }), index("sources_specialty_idx").on(table.specialty)]);

export const contentObjects = pgTable("content_objects", {
  id: text("id").notNull(), specialty: text("specialty").$type<SpecialtyId>().notNull(),
  datasetId: text("dataset_id").references(() => datasets.id).notNull(),
  kind: text("kind").$type<ContentKind>().notNull(), type: text("type").notNull(), title: text("title").notNull(), summary: text("summary").notNull(),
  sourceId: text("source_id").notNull(), canonicalUrl: text("canonical_url"), publicationDate: text("publication_date"), publicationYear: integer("publication_year"),
  updatedAt: text("updated_at"), lastCheckedAt: text("last_checked_at"), language: text("language").notNull(),
  topics: jsonb("topics").$type<string[]>().notNull(), tags: jsonb("tags").$type<string[]>().notNull(),
  currentness: text("currentness").$type<Currentness>().notNull(), requiresReview: boolean("requires_review").notNull(),
  freshness: text("freshness").notNull(), version: text("version"), parentId: text("parent_id"), supersedesId: text("supersedes_id"), supersededById: text("superseded_by_id"),
  trustLayer: text("trust_layer").notNull(), editorialStatus: text("editorial_status").notNull(), rightsStatus: text("rights_status").notNull(),
  priority: integer("priority").notNull(), author: text("author"), provenance: jsonb("provenance").$type<ContentObject["provenance"]>().notNull(),
  raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
}, (table) => [primaryKey({ columns: [table.specialty, table.id] }),
  foreignKey({ columns: [table.specialty, table.sourceId], foreignColumns: [sources.specialty, sources.id] }),
  index("content_specialty_kind_idx").on(table.specialty, table.kind), index("content_source_idx").on(table.specialty, table.sourceId)]);

export const assets = pgTable("assets", {
  id: text("id").notNull(), specialty: text("specialty").$type<SpecialtyId>().notNull(), contentId: text("content_id").notNull(),
  url: text("url"), sourceUrl: text("source_url"), credit: text("credit"), caption: text("caption"),
  status: text("status").notNull(), rights: text("rights").notNull(), semanticMatch: text("semantic_match").notNull(),
  width: integer("width"), height: integer("height"), raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
}, (table) => [primaryKey({ columns: [table.specialty, table.id] }),
  foreignKey({ columns: [table.specialty, table.contentId], foreignColumns: [contentObjects.specialty, contentObjects.id] }),
  index("assets_content_idx").on(table.specialty, table.contentId)]);

export const contentRelationships = pgTable("content_relationships", {
  specialty: text("specialty").$type<SpecialtyId>().notNull(), fromId: text("from_id").notNull(), toId: text("to_id").notNull(), type: text("type").notNull(),
}, (table) => [primaryKey({ columns: [table.specialty, table.fromId, table.toId, table.type] }),
  foreignKey({ columns: [table.specialty, table.fromId], foreignColumns: [contentObjects.specialty, contentObjects.id] }),
  foreignKey({ columns: [table.specialty, table.toId], foreignColumns: [contentObjects.specialty, contentObjects.id] })]);

export const evaluationItems = pgTable("evaluation_items", {
  datasetId: text("dataset_id").references(() => datasets.id).notNull(), specialty: text("specialty").$type<SpecialtyId>().notNull(),
  contentId: text("content_id").notNull(), position: integer("position").notNull(),
}, (table) => [primaryKey({ columns: [table.datasetId, table.contentId] }),
  foreignKey({ columns: [table.specialty, table.contentId], foreignColumns: [contentObjects.specialty, contentObjects.id] })]);

/** Research observations are not canonical sources or clinical endorsements. */
export const sourceObservations = pgTable("source_observations", {
  id: text("id").notNull(), specialty: text("specialty").$type<SpecialtyId>().notNull(), raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
}, (table) => [primaryKey({ columns: [table.specialty, table.id] })]);

export const anonymousSessions = pgTable("anonymous_sessions", {
  id: text("id").primaryKey(), state: jsonb("state").$type<UserState>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").defaultRandom().primaryKey(), sessionId: text("session_id"), event: text("event").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("analytics_event_created_idx").on(table.event, table.createdAt)]);

export type StoredSource = Source & { raw: Record<string, unknown> };
export type StoredAsset = Asset & { specialty: SpecialtyId; contentId: string; raw: Record<string, unknown> };
