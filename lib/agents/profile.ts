import type { SpecialtyId } from "@/lib/domain/types";
import { AGENT_DEFINITIONS, AGENT_ORDER } from "./definitions";
import { DEFAULT_ANSWER_MODE, isAnswerMode } from "@/lib/portal/answer-mode";
import { NMO_ENTRY_LIMIT, WATCHLIST_LIMIT, type AgentId, type NmoEntry, type NmoPlan, type AgentPreference, type AgentResult, type AgentResultView, type AgentSubscription, type ProfileIdentity, type UserProfile, type WatchedDrug } from "./types";
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
    answerMode: DEFAULT_ANSWER_MODE,
    identity: { name: null, workplace: null, experienceYears: null },
    subscriptions,
    preferences,
    partnerContent: true,
    learningProgress: {},
    configuredAt: null,
    lastVisitAt: null,
    previousVisitAt: null,
    firstSeenAt: null,
    firstValueAt: null,
    watchlist: [],
    nmoPlan: { target: null, entries: [] },
    backgroundPaused: false,
    updatedAt: now,
  };
}

/** Drugs of a stored watchlist that still exist as valid entries (deduplicated by INN, capped). */
export function normalizeWatchlist(value: unknown): WatchedDrug[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: WatchedDrug[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Partial<WatchedDrug>;
    if (typeof entry.inn !== "string" || !entry.inn.trim() || typeof entry.ru !== "string" || seen.has(entry.inn)) continue;
    seen.add(entry.inn);
    out.push({ inn: entry.inn.trim().slice(0, 80), ru: entry.ru.trim().slice(0, 80), addedAt: typeof entry.addedAt === "string" ? entry.addedAt : new Date(0).toISOString(), from: entry.from === "comparison" || entry.from === "settings" ? entry.from : "drug_result" });
    if (out.length >= WATCHLIST_LIMIT) break;
  }
  return out;
}

/** A stored НМО plan, repaired: valid dates and credits only, newest first, capped. */
export function normalizeNmoPlan(value: unknown): NmoPlan {
  const raw = value && typeof value === "object" ? value as Partial<NmoPlan> : {};
  const target = typeof raw.target === "number" && Number.isFinite(raw.target) && raw.target > 0 && raw.target <= 1000 ? Math.round(raw.target) : null;
  const entries = (Array.isArray(raw.entries) ? raw.entries : []).flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Partial<NmoEntry>;
    if (typeof entry.id !== "string" || typeof entry.title !== "string" || !entry.title.trim() || typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(entry.date)) return [];
    const credits = typeof entry.credits === "number" && Number.isFinite(entry.credits) && entry.credits >= 0 && entry.credits <= 500 ? Math.round(entry.credits * 10) / 10 : null;
    return [{ id: entry.id.slice(0, 64), title: entry.title.trim().slice(0, 200), date: entry.date, credits, kind: entry.kind === "event" || entry.kind === "course" ? entry.kind : "other", from: entry.from === "event" ? "event" : "manual", url: typeof entry.url === "string" && /^https?:\/\//iu.test(entry.url) ? entry.url.slice(0, 500) : null, addedAt: typeof entry.addedAt === "string" ? entry.addedAt : new Date(0).toISOString() } satisfies NmoEntry];
  });
  return { target, entries: entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, NMO_ENTRY_LIMIT) };
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
    answerMode: isAnswerMode(value.answerMode) ? value.answerMode : base.answerMode,
    topicsChangedAt: typeof value.topicsChangedAt === "string" ? value.topicsChangedAt : null,
    identity: normalizeIdentity(value.identity),
    subscriptions,
    preferences,
    partnerContent: value.partnerContent !== false,
    learningProgress: value.learningProgress && typeof value.learningProgress === "object" ? value.learningProgress : {},
    configuredAt: typeof value.configuredAt === "string" ? value.configuredAt : null,
    lastVisitAt: typeof value.lastVisitAt === "string" ? value.lastVisitAt : null,
    previousVisitAt: typeof value.previousVisitAt === "string" ? value.previousVisitAt : null,
    firstSeenAt: typeof value.firstSeenAt === "string" ? value.firstSeenAt : null,
    firstValueAt: typeof value.firstValueAt === "string" ? value.firstValueAt : null,
    watchlist: normalizeWatchlist(value.watchlist),
    nmoPlan: normalizeNmoPlan(value.nmoPlan),
    backgroundPaused: value.backgroundPaused === true,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
  };
}

const text = (value: unknown, max: number): string | null => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

export function normalizeIdentity(value: Partial<ProfileIdentity> | null | undefined): ProfileIdentity {
  const years = typeof value?.experienceYears === "number" && Number.isFinite(value.experienceYears) ? Math.min(70, Math.max(0, Math.round(value.experienceYears))) : null;
  return { name: text(value?.name, 80), workplace: text(value?.workplace, 120), experienceYears: years };
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
export const ZERO_SETUP_AGENTS: readonly AgentId[] = ["whats_new", "guidelines", "events", "learning"];
const LEARNING_REFRESH_HOURS = 72;

/** Scheduled agents catch up on visit when their frequency window has elapsed. */
export function isRunDue(profile: UserProfile, agentId: AgentId, now: Date): boolean {
  const definition = AGENT_DEFINITIONS[agentId];
  const subscription = profile.subscriptions[agentId];
  if (!subscription?.enabled) return false;
  // Topics changed since the last run (in the profile or from the home nudge): the check is due now.
  if (profile.topicsChangedAt && (!subscription.lastRunAt || subscription.lastRunAt < profile.topicsChangedAt) && (definition.triggerMode === "scheduled" || agentId === "learning")) return true;
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
