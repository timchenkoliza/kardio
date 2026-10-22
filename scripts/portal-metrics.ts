import { desc, inArray } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { analyticsEvents } from "@/db/schema";
import { computePortalRetention, PORTAL_EVENT_NAMES } from "@/lib/portal/metrics";

/**
 * Team-only retention report for the portal viability test (activation,
 * D1/D7/D14 by specialty and by first successful job, repeat useful task,
 * time to first value). No thresholds: the report shows numbers, the team decides.
 */
try {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required for the retention report.");
  const rows = await db.select().from(analyticsEvents).where(inArray(analyticsEvents.event, [...PORTAL_EVENT_NAMES])).orderBy(desc(analyticsEvents.createdAt)).limit(500_000);
  const report = computePortalRetention(rows.map(row => ({ event: row.event, sessionId: row.sessionId, createdAt: row.createdAt.toISOString(), payload: row.payload as { specialty: string } })));
  const counts = Object.fromEntries(PORTAL_EVENT_NAMES.map(name => [name, rows.filter(row => row.event === name).length]));
  console.log(JSON.stringify({ events: rows.length, counts, report }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Portal metrics failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
