/**
 * Retention-ready metric contract for the portal.
 *
 * The product verdict is retention and repeated useful use, so events carry
 * only ids, categories, counts and timestamps — never raw query text, uploaded
 * content or free-form input. The unit of retention is the anonymous session
 * cookie (180 days) per device; accounts would replace it.
 *
 * No success thresholds are defined here: none were supplied, and inventing
 * them would make the dashboard look decisive without evidence.
 */

export const PORTAL_EVENT_NAMES = [
  // Acquisition / activation
  "portal_opened",
  "primary_intent_submitted",
  "intent_routed",
  "useful_result_rendered",
  "first_value_delivered",
  // Meaningful utility
  "source_opened",
  "result_saved",
  "followup_started",
  "drug_result_opened",
  "guideline_result_opened",
  "research_result_completed",
  "event_opened",
  "event_registration_clicked",
  "learning_recommendation_opened",
  // Personalisation
  "specialty_signal_used",
  "topic_signal_added",
  "recommendation_reason_shown",
  // Return
  "return_session",
  "repeat_job",
  "update_opened_since_previous_session",
] as const;
export type PortalEventName = (typeof PORTAL_EVENT_NAMES)[number];

/** Events a browser may report (clicks the server cannot see). Everything else is recorded server-side. */
export const CLIENT_PORTAL_EVENTS = [
  "source_opened",
  "followup_started",
  "event_opened",
  "event_registration_clicked",
  "learning_recommendation_opened",
  "update_opened_since_previous_session",
] as const satisfies readonly PortalEventName[];
export type ClientPortalEvent = (typeof CLIENT_PORTAL_EVENTS)[number];

/** Utility events that count as a meaningful action on a result. */
export const USEFUL_ACTION_EVENTS: readonly PortalEventName[] = ["source_opened", "result_saved", "followup_started", "event_registration_clicked", "learning_recommendation_opened", "update_opened_since_previous_session"];

export interface PortalEventPayload {
  specialty: string;
  job?: string;
  /** Fine-grained job type (lib/mesh/jobs.ts) behind the result family. */
  jobType?: string;
  capability?: string;
  resultId?: string;
  runId?: string;
  resultKind?: string;
  /** Router confidence bucket, not a medical statement. */
  confidence?: number;
  explicitJob?: boolean;
  count?: number;
  /** Size bucket of the request text (no text is stored). */
  lengthBucket?: "short" | "medium" | "long";
  /** Milliseconds from first portal open to first useful result. */
  ttfvMs?: number;
  /** Whole days since the session's first portal open. */
  daysSinceFirst?: number;
  signal?: string;
  state?: string;
}

export interface PortalTelemetryEvent {
  event: string;
  sessionId: string | null;
  createdAt: string;
  payload: PortalEventPayload & Record<string, unknown>;
}

export function lengthBucket(text: string): PortalEventPayload["lengthBucket"] {
  const words = text.trim().split(/\s+/u).filter(Boolean).length;
  return words <= 3 ? "short" : words <= 12 ? "medium" : "long";
}

const DAY = 86_400_000;
function dayIndex(iso: string): number { return Math.floor(new Date(iso).getTime() / DAY); }

function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator ? Math.round((numerator / denominator) * 1000) / 1000 : null;
}

export interface RetentionCell { cohortSize: number; d1: number | null; d7: number | null; d14: number | null }

export interface PortalRetentionReport {
  sessions: number;
  activated: number;
  activationRate: number | null;
  /** Dn: share of a cohort active on day n or later (unbounded), among sessions old enough to be measured. */
  retention: RetentionCell;
  retentionBySpecialty: Record<string, RetentionCell>;
  retentionByFirstJob: Record<string, RetentionCell>;
  /** Sessions that performed a useful action on at least two different days. */
  repeatUsefulSessions: number;
  repeatUsefulRate: number | null;
  timeToFirstValueMs: { p50: number | null; p90: number | null; n: number };
  definitions: Record<string, string>;
}

interface SessionFacts {
  firstDay: number;
  firstAt: string;
  specialty: string;
  activeDays: Set<number>;
  usefulDays: Set<number>;
  firstJob: string | null;
  activated: boolean;
}

/**
 * Computes the retention contract from raw events. `now` bounds which cohorts
 * are measurable: a session first seen 3 days ago has no D7 yet and is left
 * out of the D7 denominator instead of being counted as churned.
 */
export function computePortalRetention(events: readonly PortalTelemetryEvent[], now = new Date()): PortalRetentionReport {
  const sessions = new Map<string, SessionFacts>();
  const ordered = [...events].filter(entry => entry.sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ttfv: number[] = [];
  for (const entry of ordered) {
    const id = entry.sessionId as string;
    const day = dayIndex(entry.createdAt);
    let facts = sessions.get(id);
    if (!facts) {
      facts = { firstDay: day, firstAt: entry.createdAt, specialty: entry.payload.specialty ?? "unknown", activeDays: new Set(), usefulDays: new Set(), firstJob: null, activated: false };
      sessions.set(id, facts);
    }
    facts.activeDays.add(day);
    if ((USEFUL_ACTION_EVENTS as readonly string[]).includes(entry.event) || entry.event === "useful_result_rendered") facts.usefulDays.add(day);
    if (entry.event === "first_value_delivered") {
      facts.activated = true;
      if (!facts.firstJob && entry.payload.job) facts.firstJob = entry.payload.job;
      if (typeof entry.payload.ttfvMs === "number") ttfv.push(entry.payload.ttfvMs);
    }
  }
  const today = dayIndex(now.toISOString());
  const cell = (list: SessionFacts[]): RetentionCell => {
    const measure = (n: number) => {
      const eligible = list.filter(facts => today - facts.firstDay >= n);
      return ratio(eligible.filter(facts => [...facts.activeDays].some(day => day - facts.firstDay >= n)).length, eligible.length);
    };
    return { cohortSize: list.length, d1: measure(1), d7: measure(7), d14: measure(14) };
  };
  const all = [...sessions.values()];
  const group = (key: (facts: SessionFacts) => string) => {
    const groups = new Map<string, SessionFacts[]>();
    for (const facts of all) groups.set(key(facts), [...(groups.get(key(facts)) ?? []), facts]);
    return Object.fromEntries([...groups.entries()].map(([name, list]) => [name, cell(list)]));
  };
  const activated = all.filter(facts => facts.activated).length;
  const repeat = all.filter(facts => facts.usefulDays.size >= 2).length;
  return {
    sessions: all.length,
    activated,
    activationRate: ratio(activated, all.length),
    retention: cell(all),
    retentionBySpecialty: group(facts => facts.specialty),
    retentionByFirstJob: group(facts => facts.firstJob ?? "no_value_yet"),
    repeatUsefulSessions: repeat,
    repeatUsefulRate: ratio(repeat, all.length),
    timeToFirstValueMs: { p50: percentile(ttfv, 50), p90: percentile(ttfv, 90), n: ttfv.length },
    definitions: {
      cohort: "Anonymous session (device cookie) by the UTC day of its first event",
      activation: "first_value_delivered: first result page with at least one source-supported finding",
      d1_d7_d14: "Share of eligible sessions with any event on day N or later after the first day; sessions younger than N days are excluded",
      repeat_useful_task: "Session with a useful action (source opened, saved, follow-up, registration click, learning opened, update opened, useful result) on two or more distinct days",
      ttfv: "Milliseconds from the session's first portal_opened to first_value_delivered",
    },
  };
}
