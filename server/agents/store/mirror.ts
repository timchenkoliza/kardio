import { AGENT_ORDER } from "@/lib/agents/definitions";
import { normalizeProfile } from "@/lib/agents/profile";
import type { AgentId, AgentPreference, UserProfile } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";

/**
 * Browser mirror for the no-database deployment. Serverless instances do not
 * share memory, so the compact profile (interests, agent settings, last-seen
 * marks) is mirrored into an HttpOnly cookie and restored on a cold instance.
 * Findings are re-derived by the next run; first-seen times are protected by
 * the rehydration rule in the supervisor.
 */
export const PROFILE_MIRROR_COOKIE = (specialty: SpecialtyId) => `kardio_agents_${specialty}`;
const MAX_COOKIE_CHARS = 3600;

interface CompactProfile {
  v: 1;
  i: UserProfile["interests"];
  s: Record<string, [0 | 1, string | null, string | null]>;
  p: Partial<Record<AgentId, AgentPreference>>;
  pc: 0 | 1;
  lp: string[];
  ca: string | null;
  lv: string | null;
  pv: string | null;
  fs?: string | null;
  fv?: string | null;
}

export function encodeProfileMirror(profile: UserProfile): string {
  const compact: CompactProfile = {
    v: 1,
    i: profile.interests,
    s: Object.fromEntries(AGENT_ORDER.map(id => [id, [profile.subscriptions[id].enabled ? 1 : 0, profile.subscriptions[id].lastRunAt, profile.subscriptions[id].lastSeenAt]])),
    p: profile.preferences,
    pc: profile.partnerContent ? 1 : 0,
    lp: Object.keys(profile.learningProgress).slice(0, 40),
    ca: profile.configuredAt,
    lv: profile.lastVisitAt,
    pv: profile.previousVisitAt,
    fs: profile.firstSeenAt,
    fv: profile.firstValueAt,
  };
  let encoded = Buffer.from(JSON.stringify(compact), "utf8").toString("base64url");
  if (encoded.length > MAX_COOKIE_CHARS) {
    compact.lp = [];
    encoded = Buffer.from(JSON.stringify(compact), "utf8").toString("base64url");
  }
  return encoded.length > MAX_COOKIE_CHARS ? "" : encoded;
}

export function decodeProfileMirror(value: string | undefined | null, specialty: SpecialtyId): UserProfile | null {
  if (!value || value.length > MAX_COOKIE_CHARS * 2 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const compact = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CompactProfile>;
    if (compact.v !== 1 || typeof compact !== "object") return null;
    const now = new Date().toISOString();
    const subscriptions: Partial<UserProfile["subscriptions"]> = {};
    for (const id of AGENT_ORDER) {
      const entry = compact.s?.[id];
      if (!Array.isArray(entry)) continue;
      subscriptions[id] = { agentId: id, enabled: entry[0] === 1, createdAt: now, updatedAt: now, lastRunAt: typeof entry[1] === "string" ? entry[1] : null, lastRunId: null, lastSeenAt: typeof entry[2] === "string" ? entry[2] : null };
    }
    return normalizeProfile({
      interests: compact.i,
      subscriptions: subscriptions as UserProfile["subscriptions"],
      preferences: compact.p as UserProfile["preferences"],
      partnerContent: compact.pc !== 0,
      learningProgress: Object.fromEntries((Array.isArray(compact.lp) ? compact.lp : []).filter(key => typeof key === "string").map(key => [key, "done" as const])),
      configuredAt: compact.ca ?? null,
      lastVisitAt: compact.lv ?? null,
      previousVisitAt: compact.pv ?? null,
      firstSeenAt: compact.fs ?? null,
      firstValueAt: compact.fv ?? null,
      updatedAt: now,
    }, specialty, now);
  } catch {
    return null;
  }
}

const rehydratedSessions = new Set<string>();

export function markRehydrated(sessionId: string, specialty: SpecialtyId) {
  rehydratedSessions.add(`${sessionId}:${specialty}`);
}

export function isRehydrated(sessionId: string, specialty: SpecialtyId): boolean {
  return rehydratedSessions.has(`${sessionId}:${specialty}`);
}

export function markRehydrationConsumed(sessionId: string, specialty: SpecialtyId) {
  rehydratedSessions.delete(`${sessionId}:${specialty}`);
}
