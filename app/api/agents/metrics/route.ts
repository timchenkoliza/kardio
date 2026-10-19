import type { NextRequest } from "next/server";
import { computeAgentMetrics } from "@/lib/agents/metrics";
import { json } from "@/server/http";
import { memoryEvents } from "@/server/agents/telemetry";
import { SESSION_COOKIE } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Agent product metrics for the current anonymous session (this instance).
 * Aggregate team metrics are computed offline from analytics_events
 * (`npm run agents:metrics`), never exposed publicly.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return json({ scope: "session", metrics: computeAgentMetrics([]) });
  return json({ scope: "session", metrics: computeAgentMetrics(memoryEvents(sessionId)) });
}
