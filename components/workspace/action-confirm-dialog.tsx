"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, ExternalLink, Mail, ShieldCheck, X } from "lucide-react";
import type { ActionRequest } from "@/lib/agents/types";
import { useWorkspace } from "./workspace-provider";
import { ModeBadge } from "./mode-badge";

const ICONS = { calendar_write: CalendarPlus, registration: ExternalLink, email: Mail, external_link: ExternalLink, purchase: ShieldCheck, publishing: ShieldCheck } as const;

/**
 * Single confirmation gate for every action outside the product.
 * "Prepared" and "executed" are visually separate: nothing happens until the
 * physician presses the confirm button.
 */
export function ActionConfirmDialog() {
  const { pendingAction, setPendingAction, command, pending } = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const [done, setDone] = useState<ActionRequest | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (pendingAction && !element.open) {
      setDone(null);
      if (typeof element.showModal === "function") element.showModal(); else element.setAttribute("open", "");
    }
    if (!pendingAction && element.open) element.close();
  }, [pendingAction]);

  if (!pendingAction) return <dialog ref={dialog} className="ws-dialog" aria-hidden="true" />;
  const Icon = ICONS[pendingAction.kind];
  const view = done ?? pendingAction;

  async function confirm() {
    if (!pendingAction) return;
    const result = await command({ action: "confirmAction", actionId: pendingAction.id });
    const confirmed = result?.action ?? null;
    if (!confirmed) return;
    setDone(confirmed);
    if (confirmed.artifactUrl) {
      if (confirmed.kind === "calendar_write") window.location.assign(confirmed.artifactUrl);
      else if (confirmed.kind === "email") window.location.href = confirmed.artifactUrl;
      else window.open(confirmed.artifactUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function cancel() {
    if (pendingAction && pendingAction.status === "pending_confirmation" && !done) await command({ action: "cancelAction", actionId: pendingAction.id }, { quiet: true });
    setPendingAction(null);
  }

  return <dialog ref={dialog} className="ws-dialog" aria-labelledby="ws-action-title" onCancel={event => { event.preventDefault(); void cancel(); }}>
    <div className="ws-dialog-head">
      <span className="ws-dialog-icon" aria-hidden="true"><Icon size={20} /></span>
      <div>
        <span className="ws-dialog-kicker">{view.status === "pending_confirmation" ? "Нужно ваше подтверждение" : view.status === "completed" || view.status === "handed_off" ? "Готово" : "Недоступно"}</span>
        <h2 id="ws-action-title">{view.title}</h2>
      </div>
      <button type="button" className="ws-icon-button" aria-label="Закрыть" onClick={() => void cancel()}><X size={18} /></button>
    </div>
    <p className="ws-dialog-effect">{view.effect}</p>
    <div className="ws-dialog-integration">
      <ModeBadge mode={view.integration.mode} />
      <span>{view.integration.note}</span>
    </div>
    {view.description && <details className="ws-dialog-details"><summary>Что входит</summary><pre>{view.description}</pre></details>}
    {view.status === "completed" && view.kind === "calendar_write" && view.artifactUrl && <p className="ws-dialog-result">Файл календаря скачивается. Если загрузка не началась — <a href={view.artifactUrl}>скачать .ics</a>.</p>}
    {view.status === "handed_off" && view.artifactUrl && view.kind !== "email" && <p className="ws-dialog-result">Страница открыта в новой вкладке. Если этого не произошло — <a href={view.artifactUrl} target="_blank" rel="noreferrer">открыть</a>.</p>}
    {view.status === "handed_off" && view.kind === "email" && <p className="ws-dialog-result">Черновик открыт в вашей почтовой программе. Агент ничего не отправлял.</p>}
    <div className="ws-dialog-actions">
      {view.status === "pending_confirmation" && !done ? <>
        <button type="button" className="ws-button is-primary" disabled={pending} onClick={() => void confirm()}>Подтвердить</button>
        <button type="button" className="ws-button" onClick={() => void cancel()}>Отменить</button>
      </> : <button type="button" className="ws-button" onClick={() => setPendingAction(null)}>Закрыть</button>}
    </div>
  </dialog>;
}
