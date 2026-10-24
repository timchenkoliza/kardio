"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
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

/** «Сохранить ответ»: the question, «Коротко» and the sources, kept as one material that leads back here. */
export function SaveAnswerButton({ runId }: { runId: string }) {
  const { command } = useWorkspace();
  const [saved, setSaved] = useState(false);
  if (saved) return <SavedLink />;
  return <button type="button" className="ws-button is-small is-quiet" data-save-answer="true" onClick={async () => { const response = await command({ action: "saveAnswer", runId }, { refresh: false }); if (response) setSaved(true); }}>
    <Bookmark size={14} aria-hidden="true" />Сохранить ответ
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
