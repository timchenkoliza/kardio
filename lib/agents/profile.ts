import type { SpecialtyId } from "@/lib/domain/types";
import { AGENT_DEFINITIONS, AGENT_ORDER } from "./definitions";
import type { AgentId, AgentPreference, AgentResult, AgentResultView, AgentSubscription, UserProfile } from "./types";
import { FREQUENCY_OPTIONS } from "./vocabulary";

export function defaultSubscription(agentId: AgentId, now: string): AgentSubscription {
  return { agentId, enabled: true, createdAt: now, updatedAt: now, lastRunAt: null, lastRunId: null, lastSeenAt: null };
}

export function defaultProfile(specialty: SpecialtyId, now = new Date().toISOString()): UserProfile {
  const subscriptions = {} as Record<AgentId, AgentSubscription>;
  const preferences = {} as Record<AgentId, AgentPreference>;
  for (const id of AGENT_ORDER) {
    subscriptions[id] = defaultSubscription(id, now);
    preferences[id] = structuredClone(AGENT_DEFINITIONS[id].defaultPreference);
  }
  return {
    version: 1,
    specialty,
    interests: { topics: [], trustedSources: specialty === "cardiology" ? ["rko", "esc", "pubmed"] : ["pubmed"], excludedSources: [] },
    subscriptions,
    preferences,
    partnerContent: true,
    learningProgress: {},
    configuredAt: null,
    lastVisitAt: null,
    previousVisitAt: null,
    firstSeenAt: null,
    firstValueAt: null,
    updatedAt: now,
  };
}

/** Repair a persisted profile against the current agent catalog (forward compatible). */
export function normalizeProfile(value: Partial<UserProfile> | null | undefined, specialty: SpecialtyId, now = new Date().toISOString()): UserProfile {
  const base = defaultProfile(specialty, now);
  if (!value || typeof value !== "object") return base;
  const subscriptions = { ...base.subscriptions };
  const preferences = { ...base.preferences };
  for (const id of AGENT_ORDER) {
    const sub = value.subscriptions?.[id];
    if (sub && typeof sub === "object") subscriptions[id] = { ...base.subscriptions[id], ...sub, agentId: id };
    const pref = value.preferences?.[id];
    if (pref && typeof pref === "object") preferences[id] = { ...base.preferences[id], ...pref };
  }
  const interests = value.interests && typeof value.interests === "object" ? {
    topics: Array.isArray(value.interests.topics) ? value.interests.topics.filter(item => typeof item === "string").slice(0, 24) : [],
    trustedSources: Array.isArray(value.interests.trustedSources) ? value.interests.trustedSources.filter(item => typeof item === "string").slice(0, 16) : base.interests.trustedSources,
    excludedSources: Array.isArray(value.interests.excludedSources) ? value.interests.excludedSources.filter(item => typeof item === "string").slice(0, 16) : [],
  } : base.interests;
  return {
    ...base,
    specialty,
    interests,
    subscriptions,
    preferences,
    partnerContent: value.partnerContent !== false,
    learningProgress: value.learningProgress && typeof value.learningProgress === "object" ? value.learningProgress : {},
    configuredAt: typeof value.configuredAt === "string" ? value.configuredAt : null,
    lastVisitAt: typeof value.lastVisitAt === "string" ? value.lastVisitAt : null,
    previousVisitAt: typeof value.previousVisitAt === "string" ? value.previousVisitAt : null,
    firstSeenAt: typeof value.firstSeenAt === "string" ? value.firstSeenAt : null,
    firstValueAt: typeof value.firstValueAt === "string" ? value.firstValueAt : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
  };
}

export interface EffectivePreference extends AgentPreference {
  topics: string[];
  trustedSources: string[];
  excludedSources: string[];
}

export function effectivePreference(profile: UserProfile, agentId: AgentId): EffectivePreference {
  const own = profile.preferences[agentId] ?? AGENT_DEFINITIONS[agentId].defaultPreference;
  return {
    ...own,
    topics: own.topics && own.topics.length ? own.topics : profile.interests.topics,
    trustedSources: profile.interests.trustedSources,
    excludedSources: profile.interests.excludedSources,
  };
}

/** Short, stable digest so a run records which configuration produced it. */
export function preferenceDigest(preference: EffectivePreference): string {
  return [
    `t:${[...preference.topics].sort().join(",")}`,
    `s:${[...preference.trustedSources].sort().join(",")}`,
    `x:${[...preference.excludedSources].sort().join(",")}`,
    `c:${[...preference.contentTypes].sort().join(",")}`,
    `f:${[...preference.formats].sort().join(",")}`,
    `h:${preference.horizonDays}`,
    `g:${[...preference.goals].sort().join(",")}`,
  ].join("|");
}

export function isConfigured(profile: UserProfile): boolean {
  return profile.interests.topics.length > 0;
}

/**
 * Agents that build «Для вас» without any configuration: they fall back to the
 * specialty scope (progressive profiling — value before setup).
 */
export const ZERO_SETUP_AGENTS: readonly AgentId[] = ["whats_new", "guidelines", "events"];
const LEARNING_REFRESH_HOURS = 72;

/** Scheduled agents catch up on visit when their frequency window has elapsed. */
export function isRunDue(profile: UserProfile, agentId: AgentId, now: Date): boolean {
  const definition = AGENT_DEFINITIONS[agentId];
  const subscription = profile.subscriptions[agentId];
  if (!subscription?.enabled) return false;
  // The learning next step is re-derived from real signals every few days.
  if (agentId === "learning") return !subscription.lastRunAt || (now.getTime() - new Date(subscription.lastRunAt).getTime()) / 3_600_000 >= LEARNING_REFRESH_HOURS;
  if (definition.triggerMode !== "scheduled") return false;
  if (!isConfigured(profile) && !ZERO_SETUP_AGENTS.includes(agentId)) return false;
  if (!subscription.lastRunAt) return true;
  const frequency = FREQUENCY_OPTIONS.find(option => option.id === profile.preferences[agentId].frequency) ?? FREQUENCY_OPTIONS[1];
  const elapsedHours = (now.getTime() - new Date(subscription.lastRunAt).getTime()) / 3_600_000;
  return elapsedHours >= frequency.hours;
}

/**
 * "Since last visit" is computed, never hard-coded: a result is new when this
 * user received it after the last time they looked at that agent.
 */
export function isNewSinceLastSeen(result: Pick<AgentResult, "createdAt">, lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return true;
  return new Date(result.createdAt).getTime() > new Date(lastSeenAt).getTime();
}

export function withNewFlags(results: readonly AgentResult[], profile: UserProfile): AgentResultView[] {
  return results.map(result => ({ ...result, newSinceLastSeen: isNewSinceLastSeen(result, profile.subscriptions[result.agentId]?.lastSeenAt ?? null) }));
}
