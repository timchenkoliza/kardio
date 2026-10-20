import { desc, inArray } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { analyticsEvents } from "@/db/schema";
import { computeAgentMetrics } from "@/lib/agents/metrics";
import { AGENT_EVENT_NAMES } from "@/server/agents/telemetry";

/** Team-only aggregate of agent product metrics from analytics_events. */
try {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required for aggregate agent metrics.");
  const rows = await db.select().from(analyticsEvents).where(inArray(analyticsEvents.event, [...AGENT_EVENT_NAMES])).orderBy(desc(analyticsEvents.createdAt)).limit(200_000);
  const metrics = computeAgentMetrics(rows.map(row => ({ event: row.event, sessionId: row.sessionId, createdAt: row.createdAt.toISOString(), payload: row.payload as Record<string, unknown> })));
  console.log(JSON.stringify({ events: rows.length, metrics }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Agent metrics failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
