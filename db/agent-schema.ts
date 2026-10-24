import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
import type { ActionRequest, AgentResult, AgentRun, Material, UserProfile } from "@/lib/agents/types";
import type { SharedSnapshot } from "@/lib/sharing/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { anonymousSessions } from "./schema";

/**
 * Agent workspace state. User state only — never professional-knowledge nodes.
 * Relational columns carry identity, ownership and query keys; the jsonb
 * payload carries the typed document validated in `lib/agents/types.ts`.
 */

export const agentProfiles = pgTable("agent_profiles", {
  sessionId: text("session_id").notNull(),
  specialty: text("specialty").$type<SpecialtyId>().notNull(),
  profile: jsonb("profile").$type<UserProfile>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.sessionId, table.specialty] }),
  foreignKey({ columns: [table.sessionId], foreignColumns: [anonymousSessions.id] }).onDelete("cascade"),
]);

export const agentRuns = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  specialty: text("specialty").$type<SpecialtyId>().notNull(),
  agentId: text("agent_id").notNull(),
  status: text("status").notNull(),
  trigger: text("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  payload: jsonb("payload").$type<AgentRun>().notNull(),
}, (table) => [
  index("agent_runs_session_agent_idx").on(table.sessionId, table.specialty, table.agentId, table.startedAt),
  foreignKey({ columns: [table.sessionId], foreignColumns: [anonymousSessions.id] }).onDelete("cascade"),
]);

export const agentResults = pgTable("agent_results", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  specialty: text("specialty").$type<SpecialtyId>().notNull(),
  agentId: text("agent_id").notNull(),
  resultKey: text("result_key").notNull(),
  runId: text("run_id").notNull(),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").$type<AgentResult>().notNull(),
}, (table) => [
  uniqueIndex("agent_results_session_key_uniq").on(table.sessionId, table.specialty, table.resultKey),
  index("agent_results_session_agent_idx").on(table.sessionId, table.specialty, table.agentId, table.createdAt),
  foreignKey({ columns: [table.sessionId], foreignColumns: [anonymousSessions.id] }).onDelete("cascade"),
]);

export const userMaterials = pgTable("user_materials", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  specialty: text("specialty").$type<SpecialtyId>().notNull(),
  kind: text("kind").notNull(),
  ownership: text("ownership").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").$type<Material>().notNull(),
}, (table) => [
  index("user_materials_session_idx").on(table.sessionId, table.specialty, table.createdAt),
  foreignKey({ columns: [table.sessionId], foreignColumns: [anonymousSessions.id] }).onDelete("cascade"),
]);

export const materialCollections = pgTable("material_collections", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  specialty: text("specialty").$type<SpecialtyId>().notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("material_collections_session_idx").on(table.sessionId, table.specialty),
  foreignKey({ columns: [table.sessionId], foreignColumns: [anonymousSessions.id] }).onDelete("cascade"),
]);

export const actionRequests = pgTable("action_requests", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  specialty: text("specialty").$type<SpecialtyId>().notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").$type<ActionRequest>().notNull(),
}, (table) => [
  index("action_requests_session_idx").on(table.sessionId, table.specialty, table.createdAt),
  foreignKey({ columns: [table.sessionId], foreignColumns: [anonymousSessions.id] }).onDelete("cascade"),
]);

/**
 * Background schedule of one physician workspace (session × specialty): when the
 * next background check is due. Derived from the profile on every save; the
 * cron runner claims due rows with a lease, so parallel invocations never run
 * the same workspace twice.
 */
export const agentSchedules = pgTable("agent_schedules", {
  sessionId: text("session_id").notNull(),
  specialty: text("specialty").$type<SpecialtyId>().notNull(),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  paused: boolean("paused").default(false).notNull(),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.sessionId, table.specialty] }),
  index("agent_schedules_due_idx").on(table.paused, table.nextCheckAt),
  foreignKey({ columns: [table.sessionId], foreignColumns: [anonymousSessions.id] }).onDelete("cascade"),
]);

/**
 * Idempotency ledger: one row per agent per schedule slot (a day, a week).
 * A slot that completed is never run again; a slot that ended partial or
 * failed is retried a bounded number of times.
 */
export const agentScheduleSlots = pgTable("agent_schedule_slots", {
  sessionId: text("session_id").notNull(),
  specialty: text("specialty").$type<SpecialtyId>().notNull(),
  agentId: text("agent_id").notNull(),
  slot: text("slot").notNull(),
  status: text("status").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  runId: text("run_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
}, (table) => [
  primaryKey({ columns: [table.sessionId, table.specialty, table.agentId, table.slot] }),
  index("agent_schedule_slots_session_idx").on(table.sessionId, table.specialty, table.startedAt),
  foreignKey({ columns: [table.sessionId], foreignColumns: [anonymousSessions.id] }).onDelete("cascade"),
]);

/**
 * A shared result: an immutable snapshot (title, short text, sources) behind an
 * unguessable token. The owner can revoke it; it expires. The recipient never
 * reaches the owner's library or session.
 */
export const shareLinks = pgTable("share_links", {
  token: text("token").primaryKey(),
  sessionId: text("session_id").notNull(),
  specialty: text("specialty").$type<SpecialtyId>().notNull(),
  kind: text("kind").notNull(),
  sourceId: text("source_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  openCount: integer("open_count").default(0).notNull(),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  payload: jsonb("payload").$type<SharedSnapshot>().notNull(),
}, (table) => [
  index("share_links_session_idx").on(table.sessionId, table.specialty, table.createdAt),
  foreignKey({ columns: [table.sessionId], foreignColumns: [anonymousSessions.id] }).onDelete("cascade"),
]);
