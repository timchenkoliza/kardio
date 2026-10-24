import { db } from "@/db/client";
import { analyticsEvents } from "@/db/schema";
import type { AgentTelemetryEvent } from "@/lib/agents/metrics";

/**
 * Agent observability. Events never contain raw queries, uploaded text or
 * free-form input — only ids, statuses, counts and durations.
 */
export const AGENT_EVENT_NAMES = [
  "agent_opened",
  "agent_configured",
  "agent_run_started",
  "agent_run_completed",
  "agent_result_opened",
  "evidence_opened",
  "material_saved",
  "file_uploaded",
  "action_started",
  "action_completed",
  // Sharing: counts only — never the text of what was shared or who opened it.
  "share_created",
  "share_opened",
  "share_revoked",
] as const;
export type AgentEventName = (typeof AGENT_EVENT_NAMES)[number];

export type AgentEventPayload = {
  specialty: string;
  agentId?: string;
  resultId?: string;
  runId?: string;
  actionKind?: string;
  status?: string;
  durationMs?: number;
  count?: number;
  trigger?: string;
};

const globals = globalThis as unknown as { kardioAgentEvents?: AgentTelemetryEvent[] };
const ring = globals.kardioAgentEvents ?? [];
globals.kardioAgentEvents = ring;
const RING_LIMIT = 20_000;

function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export async function recordAgentEvent(sessionId: string | null, event: AgentEventName, payload: AgentEventPayload): Promise<void> {
  const entry: AgentTelemetryEvent = { event, sessionId, createdAt: new Date().toISOString(), payload };
  ring.push(entry);
  if (ring.length > RING_LIMIT) ring.splice(0, ring.length - RING_LIMIT);
  if (!databaseConfigured()) return;
  try {
    await db.insert(analyticsEvents).values({ sessionId, event, payload });
  } catch {
    // Telemetry must never break a user action.
  }
}

export function memoryEvents(sessionId?: string): AgentTelemetryEvent[] {
  return sessionId ? ring.filter(entry => entry.sessionId === sessionId) : [...ring];
}
