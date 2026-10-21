"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import type { PortalJob } from "@/lib/portal/jobs";
import { useWorkspace } from "@/components/workspace/workspace-provider";

export function SaveResultButton({ resultId, saved: initiallySaved }: { resultId: string; saved: boolean }) {
  const { command } = useWorkspace();
  const [saved, setSaved] = useState(initiallySaved);
  return <button type="button" className="ws-button is-small is-quiet" disabled={saved} onClick={async () => { const response = await command({ action: "saveResult", resultId }, { refresh: false }); if (response) setSaved(true); }}>
    {saved ? <BookmarkCheck size={14} aria-hidden="true" /> : <Bookmark size={14} aria-hidden="true" />}{saved ? "В материалах" : "Сохранить"}
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
    const response = await command({ action: "ask", text, job, followup: true }, { refresh: false });
    setBusy(false);
    if (response?.redirect) router.push(response.redirect);
  }}>{busy ? <Loader2 size={14} className="ws-spin" aria-hidden="true" /> : null}{label}{busy ? null : <ArrowRight size={14} aria-hidden="true" />}</button>;
}
