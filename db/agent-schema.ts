import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
import type { ActionRequest, AgentResult, AgentRun, Material, UserProfile } from "@/lib/agents/types";
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
