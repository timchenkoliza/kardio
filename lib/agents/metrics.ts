import type { AgentId } from "./types";

/**
 * Product metrics for the agent model. The product is not optimized for feed
 * scrolling or page views; these measure delegated work that got done.
 */
export interface AgentTelemetryEvent {
  event: string;
  sessionId: string | null;
  createdAt: string;
  payload: { agentId?: string; status?: string; count?: number; actionKind?: string; [key: string]: unknown };
}

export interface AgentProductMetrics {
  runsStarted: number;
  runsCompleted: number;
  taskCompletionRate: number | null;
  resultOpens: number;
  usefulActionRate: number | null;
  evidenceCtr: number | null;
  saveRate: number | null;
  repeatAgentUsage: number | null;
  sevenDayAgentRetention: number | null;
  externalActionsStarted: number;
  externalActionsSucceeded: number;
  successfulExternalActionRate: number | null;
  estimatedMinutesSaved: number;
}

/** Conservative per-run estimates of manual work replaced; documented, not measured. */
export const MINUTES_SAVED_PER_USEFUL_RUN: Record<AgentId, number> = {
  whats_new: 10,
  guidelines: 15,
  drugs: 10,
  research: 20,
  events: 8,
  learning: 10,
  materials: 5,
};

function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function day(value: string): number {
  return Math.floor(new Date(value).getTime() / 86_400_000);
}

export function computeAgentMetrics(events: readonly AgentTelemetryEvent[]): AgentProductMetrics {
  const count = (name: string) => events.filter(entry => entry.event === name).length;
  const started = count("agent_run_started");
  const completedEvents = events.filter(entry => entry.event === "agent_run_completed" && (entry.payload.status === "completed" || entry.payload.status === "partial"));
  const resultOpens = count("agent_result_opened");
  const evidenceOpens = count("evidence_opened");
  const saves = count("material_saved");
  const actionsStarted = count("action_started");
  const actionsSucceeded = events.filter(entry => entry.event === "action_completed" && (entry.payload.status === "completed" || entry.payload.status === "handed_off")).length;

  const runDays = new Map<string, Set<number>>();
  const sessionDays = new Map<string, Set<number>>();
  for (const entry of completedEvents) {
    if (!entry.sessionId) continue;
    const key = `${entry.sessionId}:${entry.payload.agentId ?? "unknown"}`;
    runDays.set(key, (runDays.get(key) ?? new Set()).add(day(entry.createdAt)));
    sessionDays.set(entry.sessionId, (sessionDays.get(entry.sessionId) ?? new Set()).add(day(entry.createdAt)));
  }
  const repeatPairs = [...runDays.values()].filter(days => days.size >= 2).length;
  let retained = 0;
  for (const days of sessionDays.values()) {
    const first = Math.min(...days);
    if ([...days].some(value => value > first && value <= first + 7)) retained += 1;
  }
  const minutes = completedEvents.reduce((sum, entry) => {
    const agentId = entry.payload.agentId as AgentId | undefined;
    if (!agentId || !(agentId in MINUTES_SAVED_PER_USEFUL_RUN) || !entry.payload.count) return sum;
    return sum + MINUTES_SAVED_PER_USEFUL_RUN[agentId];
  }, 0);

  return {
    runsStarted: started,
    runsCompleted: completedEvents.length,
    taskCompletionRate: ratio(completedEvents.length, started),
    resultOpens,
    usefulActionRate: ratio(saves + evidenceOpens + actionsSucceeded, resultOpens),
    evidenceCtr: ratio(evidenceOpens, resultOpens),
    saveRate: ratio(saves, resultOpens),
    repeatAgentUsage: ratio(repeatPairs, runDays.size),
    sevenDayAgentRetention: ratio(retained, sessionDays.size),
    externalActionsStarted: actionsStarted,
    externalActionsSucceeded: actionsSucceeded,
    successfulExternalActionRate: ratio(actionsSucceeded, actionsStarted),
    estimatedMinutesSaved: minutes,
  };
}
