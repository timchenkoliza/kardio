import type { AgentResult } from "@/lib/agents/types";

/**
 * D1 «интересно / не то» on «Для вас». A verdict is remembered as signals of
 * the material it was given on — the journal, the kind of study, the kind of
 * material and its topic — never as the material's text. Signals only
 * reorder what the checks found; they never hide a whole source or topic.
 */

export type FeedVerdict = "interesting" | "not_relevant";
export const FEEDBACK_SIGNAL_LIMIT = 60;
const MAX_WEIGHT = 5;

export interface FeedFeedback {
  /** signal → weight in [-5, 5]; positive = «интересно». */
  signals: Record<string, number>;
}

export function signalsOf(result: Pick<AgentResult, "kind" | "category" | "attributes">): string[] {
  const out = [`kind:${result.kind}${result.category ? `/${result.category}` : ""}`];
  if (typeof result.attributes.journal === "string" && result.attributes.journal.trim()) out.push(`journal:${result.attributes.journal.trim().toLowerCase()}`);
  if (typeof result.attributes.studyType === "string" && result.attributes.studyType.trim()) out.push(`study:${result.attributes.studyType.trim().toLowerCase()}`);
  if (typeof result.attributes.topic === "string" && result.attributes.topic.trim()) out.push(`topic:${result.attributes.topic.trim()}`);
  return out;
}

export function applyVerdict(feedback: FeedFeedback, signals: readonly string[], verdict: FeedVerdict): FeedFeedback {
  const next = { ...feedback.signals };
  const delta = verdict === "interesting" ? 1 : -1;
  for (const signal of signals) next[signal] = Math.max(-MAX_WEIGHT, Math.min(MAX_WEIGHT, (next[signal] ?? 0) + delta));
  // Bounded: the weakest signals go first when the list is full.
  const kept = Object.entries(next).filter(([, weight]) => weight !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, FEEDBACK_SIGNAL_LIMIT);
  return { signals: Object.fromEntries(kept) };
}

export function normalizeFeedback(value: unknown): FeedFeedback {
  const raw = value && typeof value === "object" && "signals" in value ? (value as { signals: unknown }).signals : null;
  if (!raw || typeof raw !== "object") return { signals: {} };
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[0].length <= 120 && /^(?:kind|journal|study|topic):/u.test(entry[0]))
    .map(([signal, weight]) => [signal, Math.max(-MAX_WEIGHT, Math.min(MAX_WEIGHT, Math.round(weight)))] as const)
    .filter(([, weight]) => weight !== 0)
    .slice(0, FEEDBACK_SIGNAL_LIMIT);
  return { signals: Object.fromEntries(entries) };
}

/** Preference of one material: the sum of its signals' weights, and the strongest positive signal to explain it. */
export function preferenceFor(feedback: FeedFeedback, result: Pick<AgentResult, "kind" | "category" | "attributes">): { score: number; because: string | null } {
  let score = 0;
  let best: [string, number] | null = null;
  for (const signal of signalsOf(result)) {
    const weight = feedback.signals[signal] ?? 0;
    score += weight;
    if (weight > 0 && (!best || weight > best[1])) best = [signal, weight];
  }
  return { score, because: best ? explain(best[0]) : null };
}

function explain(signal: string): string {
  const [kind, value] = [signal.slice(0, signal.indexOf(":")), signal.slice(signal.indexOf(":") + 1)];
  if (kind === "journal") return `вы отмечали «интересно» у публикаций этого журнала`;
  if (kind === "study") return `вы отмечали «интересно» у работ такого типа (${value})`;
  if (kind === "topic") return "вы отмечали «интересно» у материалов по этой теме";
  return "вы отмечали «интересно» у похожих материалов";
}
