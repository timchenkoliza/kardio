"use client";

import { useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { SavedLink } from "./result-actions";

/**
 * «Сохранить» for a catalog document: the same «Мои материалы» as every other
 * save (a link material with the document title), never a separate list.
 */
export function SaveLinkButton({ url, title, saved: initiallySaved }: { url: string; title: string; saved: boolean }) {
  const { command } = useWorkspace();
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  if (saved) return <SavedLink />;
  return <button type="button" className="ws-button is-small is-quiet" disabled={busy} aria-busy={busy} onClick={async () => {
    setBusy(true);
    const response = await command({ action: "addLink", url, title: title.slice(0, 200) }, { refresh: false });
    setBusy(false);
    if (response) setSaved(true);
  }}>
    {busy ? <Loader2 size={14} className="ws-spin" aria-hidden="true" /> : <Bookmark size={14} aria-hidden="true" />}Сохранить
  </button>;
}
