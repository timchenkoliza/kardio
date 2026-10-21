import { db } from "@/db/client";
import { analyticsEvents } from "@/db/schema";
import type { PortalEventName, PortalEventPayload, PortalTelemetryEvent } from "@/lib/portal/metrics";

/**
 * Portal viability telemetry. Shares the in-process ring with agent telemetry
 * and persists to `analytics_events` when a database is configured. Payloads
 * carry ids, categories and timings only — never query text.
 */
const globals = globalThis as unknown as { kardioAgentEvents?: PortalTelemetryEvent[] };
const ring = globals.kardioAgentEvents ?? [];
globals.kardioAgentEvents = ring;
const RING_LIMIT = 20_000;

export async function recordPortalEvent(sessionId: string | null, event: PortalEventName, payload: PortalEventPayload): Promise<void> {
  ring.push({ event, sessionId, createdAt: new Date().toISOString(), payload: { ...payload } });
  if (ring.length > RING_LIMIT) ring.splice(0, ring.length - RING_LIMIT);
  if (!process.env.DATABASE_URL?.trim()) return;
  try {
    await db.insert(analyticsEvents).values({ sessionId, event, payload: { ...payload } as Record<string, unknown> });
  } catch {
    // Telemetry never breaks a physician's action.
  }
}

export function portalMemoryEvents(sessionId?: string): PortalTelemetryEvent[] {
  return sessionId ? ring.filter(entry => entry.sessionId === sessionId) : [...ring];
}
