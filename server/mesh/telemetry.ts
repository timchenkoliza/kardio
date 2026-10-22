import { db } from "@/db/client";
import { analyticsEvents } from "@/db/schema";
import type { MeshEventName, MeshEventPayload } from "@/lib/mesh/telemetry";

/**
 * Mesh observability: shares the process ring with portal/agent telemetry
 * and persists to `analytics_events` when a database is configured.
 */
interface MeshTelemetryEvent { event: string; sessionId: string | null; createdAt: string; payload: Record<string, unknown> }

const globals = globalThis as unknown as { kardioAgentEvents?: MeshTelemetryEvent[] };
const ring = globals.kardioAgentEvents ?? [];
globals.kardioAgentEvents = ring;
const RING_LIMIT = 20_000;

export async function recordMeshEvent(sessionId: string | null, event: MeshEventName, payload: MeshEventPayload): Promise<void> {
  const clean = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  ring.push({ event, sessionId, createdAt: new Date().toISOString(), payload: clean });
  if (ring.length > RING_LIMIT) ring.splice(0, ring.length - RING_LIMIT);
  if (!process.env.DATABASE_URL?.trim()) return;
  try {
    await db.insert(analyticsEvents).values({ sessionId, event, payload: clean });
  } catch {
    // Observability never breaks a physician's request.
  }
}

export function meshMemoryEvents(filter: { sessionId?: string; event?: MeshEventName } = {}): MeshTelemetryEvent[] {
  return ring.filter(entry => (!filter.sessionId || entry.sessionId === filter.sessionId) && (!filter.event || entry.event === filter.event));
}
