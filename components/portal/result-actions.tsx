"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Bell, BellRing, Bookmark, BookmarkCheck, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import type { PortalJob } from "@/lib/portal/jobs";
import { useWorkspace } from "@/components/workspace/workspace-provider";

/** Saved state is a way to the saved copy («В материалах» opens «Мои материалы»), not a dead disabled button. */
export function SavedLink() {
  const { specialty } = useWorkspace();
  return <Link className="ws-button is-small is-quiet" href={`/${specialty}/materials`} data-saved="true"><BookmarkCheck size={14} aria-hidden="true" />В материалах</Link>;
}

export function SaveResultButton({ resultId, saved: initiallySaved }: { resultId: string; saved: boolean }) {
  const { command } = useWorkspace();
  const [saved, setSaved] = useState(initiallySaved);
  if (saved) return <SavedLink />;
  return <button type="button" className="ws-button is-small is-quiet" onClick={async () => { const response = await command({ action: "saveResult", resultId }, { refresh: false }); if (response) setSaved(true); }}>
    <Bookmark size={14} aria-hidden="true" />Сохранить
  </button>;
}

/**
 * Next best action on a result: the same question, a different job. The text
 * is sent in the request body, never in a URL.
 */
export function FollowupJobButton({ text, job, label, primary = false }: { text: string; job: PortalJob; label: string; primary?: boolean }) {
  const router = useRouter();
  const { command } = useWorkspace();
  const [busy, setBusy] = useState(false);
  return <button type="button" className={primary ? "ws-button is-primary is-small" : "ws-button is-small"} disabled={busy} aria-busy={busy} onClick={async () => {
    setBusy(true);
    // A next action is one click: it never stops for a clarification.
    const response = await command({ action: "ask", text, job, followup: true, clarification: { id: "next_action", optionId: null } }, { refresh: false });
    setBusy(false);
    if (response?.redirect) router.push(response.redirect);
  }}>{busy ? <Loader2 size={14} className="ws-spin" aria-hidden="true" /> : null}{label}{busy ? null : <ArrowRight size={14} aria-hidden="true" />}</button>;
}

/** Undo a refinement of the open result in place («Показать всё»): the same run, patched back. */
export function ResetViewButton({ runId }: { runId: string }) {
  const router = useRouter();
  const { command } = useWorkspace();
  const [busy, setBusy] = useState(false);
  return <button type="button" className="ws-button is-small is-quiet" disabled={busy} aria-busy={busy} onClick={async () => {
    setBusy(true);
    const response = await command({ action: "ask", text: "Покажи всё", contextRunId: runId, followup: true }, { refresh: false, quiet: true });
    setBusy(false);
    if (response?.refined?.applied) router.refresh();
  }}>{busy ? <Loader2 size={14} className="ws-spin" aria-hidden="true" /> : null}Показать всё</button>;
}

/**
 * «Следить» on a drug: adds it to «Мои препараты» (or removes it). The agent
 * then reports confirmed regulatory changes for it, and once a month says
 * explicitly that nothing changed.
 */
export function WatchDrugButton({ inn, label, watched: initiallyWatched, from }: { inn: string; label: string; watched: boolean; from: "drug_result" | "comparison" | "settings" }) {
  const { command } = useWorkspace();
  const [watched, setWatched] = useState(initiallyWatched);
  const [busy, setBusy] = useState(false);
  return <button type="button" className="ws-button is-small is-quiet" aria-pressed={watched} disabled={busy} data-watch={inn} onClick={async () => {
    setBusy(true);
    const response = await command(watched ? { action: "unwatchDrug", inn } : { action: "watchDrug", inn, from }, { refresh: false });
    setBusy(false);
    if (response) setWatched(!watched);
  }}>{watched ? <BellRing size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}{watched ? `Слежу: ${label}` : `Следить: ${label}`}</button>;
}

/**
 * «Интересно / Не то» on a «Для вас» card (D1): the verdict is remembered as the material's signals
 * (journal, kind of study, topic) and reorders the next selections; «Не то» also hides this card.
 */
export function FeedVerdictButtons({ resultId }: { resultId: string }) {
  const { command } = useWorkspace();
  const [verdict, setVerdict] = useState<"interesting" | "not_relevant" | null>(null);
  const send = async (next: "interesting" | "not_relevant") => {
    const response = await command({ action: "feedResult", resultId, verdict: next }, { refresh: next === "not_relevant" });
    if (response) setVerdict(next);
  };
  return <span className="pt-verdict" role="group" aria-label="Насколько это вам подходит">
    <button type="button" className="ws-button is-small is-quiet" aria-pressed={verdict === "interesting"} disabled={verdict !== null} onClick={() => void send("interesting")}><ThumbsUp size={14} aria-hidden="true" />Интересно</button>
    <button type="button" className="ws-button is-small is-quiet" aria-pressed={verdict === "not_relevant"} disabled={verdict !== null} onClick={() => void send("not_relevant")}><ThumbsDown size={14} aria-hidden="true" />Не то</button>
  </span>;
}
