import { AGENT_DEFINITIONS, AGENT_ORDER } from "./definitions";
import { isConfigured, isRunDue, ZERO_SETUP_AGENTS } from "./profile";
import type { AgentId, UserProfile } from "./types";
import { FREQUENCY_OPTIONS } from "./vocabulary";

/**
 * Background schedule rules (pure; the PostgreSQL scheduler in
 * server/agents/scheduler.ts applies them). The profile is the source of
 * truth: which agents are on, how often they run and when they last ran.
 */

export const SCHEDULE_RULES = {
  /** A claimed workspace is not claimed again for this long (a crashed invocation releases by expiry). */
  leaseMs: 5 * 60_000,
  /** Workspaces not opened for this long are not checked in the background (re-armed on the next visit). */
  inactiveDays: 60,
  /** Attempts per agent per slot (the first run + bounded retries after partial or failed runs). */
  maxAttempts: 3,
  /** Retry delay after a partial or failed run. */
  retryAfterMs: 2 * 3600_000,
  /** Learning is re-derived from real signals every few days. */
  learningHours: 72,
} as const;

/** Agents that run in the background. On-demand agents (answer, research, materials) never do. */
export function backgroundAgents(profile: UserProfile): AgentId[] {
  return AGENT_ORDER.filter(agentId => {
    if (!profile.subscriptions[agentId]?.enabled) return false;
    if (agentId === "learning") return true;
    if (AGENT_DEFINITIONS[agentId].triggerMode !== "scheduled") return false;
    return isConfigured(profile) || ZERO_SETUP_AGENTS.includes(agentId) || (agentId === "drugs" && profile.watchlist.length > 0);
  });
}

export function isInactive(profile: UserProfile, now: Date): boolean {
  const anchor = profile.lastVisitAt ?? profile.firstSeenAt ?? profile.configuredAt;
  if (!anchor) return true;
  return now.getTime() - new Date(anchor).getTime() > SCHEDULE_RULES.inactiveDays * 86_400_000;
}

function periodHours(profile: UserProfile, agentId: AgentId): number {
  if (agentId === "learning") return SCHEDULE_RULES.learningHours;
  const frequency = FREQUENCY_OPTIONS.find(option => option.id === profile.preferences[agentId].frequency) ?? FREQUENCY_OPTIONS[1];
  return frequency.hours;
}

/** Agents due now: the same rule as the catch-up on visit, plus a watchlist that makes the drug agent due without topics. */
export function dueAgents(profile: UserProfile, now: Date): AgentId[] {
  if (profile.backgroundPaused || isInactive(profile, now)) return [];
  return backgroundAgents(profile).filter(agentId => {
    if (isRunDue(profile, agentId, now)) return true;
    // A watchlist alone is a reason to check drugs, even before topics are chosen.
    if (agentId !== "drugs" || !profile.watchlist.length) return false;
    const last = profile.subscriptions.drugs.lastRunAt;
    return !last || now.getTime() - new Date(last).getTime() >= periodHours(profile, "drugs") * 3_600_000;
  });
}

/** When the next background check of this workspace is due; null when nothing is scheduled. */
export function nextCheckAt(profile: UserProfile, now: Date): Date | null {
  if (profile.backgroundPaused || isInactive(profile, now)) return null;
  const times = backgroundAgents(profile).map(agentId => {
    const last = profile.subscriptions[agentId].lastRunAt;
    if (!last) return now.getTime();
    return new Date(last).getTime() + periodHours(profile, agentId) * 3_600_000;
  });
  if (!times.length) return null;
  return new Date(Math.max(now.getTime(), Math.min(...times)));
}

/**
 * Idempotency slot of a background run: one per day for daily agents, one per
 * ISO week for weekly ones, one per 72 h window for learning. A slot that
 * completed is never run twice, however many cron invocations overlap.
 */
export function slotFor(profile: UserProfile, agentId: AgentId, now: Date): string {
  const hours = periodHours(profile, agentId);
  const day = now.toISOString().slice(0, 10);
  if (hours <= 24) return `${agentId}:d:${day}`;
  if (agentId === "learning") return `${agentId}:w72:${Math.floor(now.getTime() / (SCHEDULE_RULES.learningHours * 3_600_000))}`;
  return `${agentId}:w:${isoWeek(now)}`;
}

export function isoWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
