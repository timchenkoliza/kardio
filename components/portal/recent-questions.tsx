import Link from "next/link";
import { formatRelativeRu } from "@/lib/agents/format";
import type { AgentRun } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { askHref, JOBS, jobForRun } from "@/lib/portal/jobs";
import { runOutcome } from "@/lib/portal/run-outcome";

const MAX_RECENT = 5;

/** The physician's own questions (never background checks or blocked input), newest first, one per wording and task. */
export function recentQuestions(runs: readonly AgentRun[], limit = MAX_RECENT): AgentRun[] {
  const seen = new Set<string>();
  const picked: AgentRun[] = [];
  for (const run of [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    if (run.trigger !== "composer" || !run.input.text || run.status === "blocked") continue;
    // The same words asked as an answer and as the events listing are two results («афиша → ответ»).
    const key = `${jobForRun(run)}:${run.input.continuation?.runId ?? ""}:${(run.input.continuation?.followup ?? run.input.text).trim().toLocaleLowerCase("ru-RU")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(run);
    if (picked.length === limit) break;
  }
  return picked;
}

/**
 * Where a past question opens: its result page, for every task (the research
 * review renders there too, with the way back to its material and the follow-up).
 */
export function recentHref(specialty: SpecialtyId, run: AgentRun, from: "history" | null = null): string {
  // Opened from «История», the result's way back is «История» (R1 B-9).
  return `${askHref(specialty, { run: run.id })}${from ? `&from=${from}` : ""}`;
}

/**
 * «Последние вопросы»: the way back to earlier work from the home page. Each
 * line is the question as typed, what kind of result it is, when, and what the
 * search established — the result itself opens with its context.
 */
export function RecentQuestions({ specialty, runs, limit = MAX_RECENT, title = "Последние вопросы", more = false, from = null }: { specialty: SpecialtyId; runs: readonly AgentRun[]; limit?: number; title?: string; more?: boolean; from?: "history" | null }) {
  const recent = recentQuestions(runs, limit);
  if (!recent.length) return null;
  return <section className="ws-history pt-recent" aria-labelledby="pt-recent-title">
    <div className="ws-section-head">
      <h2 id="pt-recent-title" className="ws-section-title">{title}</h2>
      {more && <Link className="ws-text-link" href={`/${specialty}/history`}>Вся история</Link>}
    </div>
    <ul>
      {recent.map(run => {
        const outcome = runOutcome(run);
        const root = run.input.continuation?.question ?? "";
        const question = run.input.continuation ? `${run.input.continuation.followup} — уточнение к «${root.length > 70 ? `${root.slice(0, 67)}…` : root}»` : run.input.text!;
        return <li key={run.id}>
          <Link href={recentHref(specialty, run, from)}>{question}</Link>
          <span>{JOBS[jobForRun(run)].label} · {formatRelativeRu(run.completedAt ?? run.startedAt)}{outcome.kind !== "found" ? ` · ${outcome.label.toLocaleLowerCase("ru-RU")}` : ""}</span>
        </li>;
      })}
    </ul>
  </section>;
}
