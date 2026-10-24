"use client";

import { useId, useState } from "react";
import { Copy, Link2, Loader2, Share2, X } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { countLabel, formatDateRu } from "@/lib/agents/format";
import type { ShareLinkView, SharedSnapshot } from "@/lib/sharing/types";

type Stage =
  | { step: "closed" }
  | { step: "preview"; snapshot: SharedSnapshot }
  | { step: "blocked"; reason: string }
  | { step: "created"; link: ShareLinkView };

/**
 * «Поделиться»: the physician first sees exactly what the recipient will see
 * (or why this result cannot leave the workspace), then creates a link
 * explicitly. A link is a frozen copy for 30 days and can be revoked.
 */
export function ShareResultButton({ resultId }: { resultId: string }) {
  const { command, notify } = useWorkspace();
  const [stage, setStage] = useState<Stage>({ step: "closed" });
  const [busy, setBusy] = useState(false);
  const panelId = useId();
  const open = stage.step !== "closed";

  async function preview() {
    setBusy(true);
    const response = await command({ action: "previewShare", resultId }, { refresh: false });
    setBusy(false);
    const share = response?.share;
    if (!share) return;
    setStage(share.snapshot ? { step: "preview", snapshot: share.snapshot } : { step: "blocked", reason: share.blocker ?? "Этим результатом нельзя поделиться." });
  }

  async function create() {
    setBusy(true);
    const response = await command({ action: "createShare", resultId }, { refresh: false });
    setBusy(false);
    if (response?.share?.link) setStage({ step: "created", link: response.share.link });
  }

  async function revoke(link: ShareLinkView) {
    setBusy(true);
    const response = await command({ action: "revokeShare", token: link.token }, { refresh: false });
    setBusy(false);
    if (response) setStage({ step: "closed" });
  }

  const absolute = (link: ShareLinkView) => (typeof window === "undefined" ? link.url : new URL(link.url, window.location.origin).toString());

  return <div className="pt-share" data-share-stage={stage.step}>
    <button type="button" className="ws-button is-small is-quiet" aria-expanded={open} aria-controls={panelId} disabled={busy && !open} onClick={() => (open ? setStage({ step: "closed" }) : void preview())}>
      {busy && !open ? <Loader2 size={14} className="ws-spin" aria-hidden="true" /> : <Share2 size={14} aria-hidden="true" />}Поделиться
    </button>
    {open && <div className="pt-share-panel" id={panelId} role="region" aria-label="Поделиться материалом">
      <button type="button" className="ws-icon-button pt-share-close" aria-label="Закрыть" onClick={() => setStage({ step: "closed" })}><X size={16} aria-hidden="true" /></button>
      {stage.step === "blocked" && <p>{stage.reason}</p>}
      {stage.step === "preview" && <>
        <p className="pt-share-lead">Получатель увидит копию на сегодня: заголовок, краткий текст и {stage.snapshot.sources.length === 1 ? "источник" : `источники (${stage.snapshot.sources.length})`}. Ваши материалы, профиль и история вопросов в ссылку не попадают.</p>
        <div className="pt-share-preview">
          <strong>{stage.snapshot.title}</strong>
          <p>{stage.snapshot.summary}</p>
        </div>
        <p className="ws-muted">Ссылка действует 30 дней, её можно отозвать в любой момент — здесь или в профиле.</p>
        <div className="pt-share-actions">
          <button type="button" className="ws-button is-primary is-small" disabled={busy} aria-busy={busy} onClick={() => void create()}>{busy ? <Loader2 size={14} className="ws-spin" aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}Создать ссылку</button>
          <button type="button" className="ws-button is-small is-quiet" onClick={() => setStage({ step: "closed" })}>Отмена</button>
        </div>
      </>}
      {stage.step === "created" && <>
        <label className="pt-share-link">
          <span>Ссылка</span>
          <input readOnly value={absolute(stage.link)} onFocus={event => event.currentTarget.select()} />
        </label>
        <div className="pt-share-actions">
          <button type="button" className="ws-button is-primary is-small" onClick={async () => {
            try { await navigator.clipboard.writeText(absolute(stage.link)); notify("Ссылка скопирована."); } catch { notify("Не удалось скопировать: выделите ссылку и скопируйте вручную.", "error"); }
          }}><Copy size={14} aria-hidden="true" />Скопировать</button>
          {typeof navigator !== "undefined" && "share" in navigator && <button type="button" className="ws-button is-small" onClick={() => void navigator.share({ title: stage.link.title, url: absolute(stage.link) }).catch(() => undefined)}><Share2 size={14} aria-hidden="true" />Отправить</button>}
          <button type="button" className="ws-button is-small is-quiet" disabled={busy} onClick={() => void revoke(stage.link)}>Отозвать</button>
        </div>
      </>}
    </div>}
  </div>;
}

/** «Мои ссылки» in settings: what was shared, how often it was opened, revoke. */
export function ShareLinksList({ links, now }: { links: ShareLinkView[]; now: string }) {
  const { command } = useWorkspace();
  const [items, setItems] = useState(links);
  if (!items.length) return <p className="ws-muted">Вы ещё не делились материалами. Кнопка «Поделиться» есть у ответов и находок с публичными источниками.</p>;
  return <ul className="pt-share-list">{items.map(link => {
    const active = !link.revokedAt && Date.parse(link.expiresAt) > Date.parse(now);
    return <li key={link.token} data-share-active={active}>
      <div><strong>{link.title}</strong><span className="ws-muted">{active ? `Действует до ${formatDateRu(link.expiresAt) ?? link.expiresAt} · открыта ${countLabel(link.openCount, ["раз", "раза", "раз"])}` : link.revokedAt ? "Отозвана" : "Срок истёк"}</span></div>
      {active && <button type="button" className="ws-button is-small is-quiet" onClick={async () => {
        const response = await command({ action: "revokeShare", token: link.token }, { refresh: false });
        if (response) setItems(current => current.map(item => (item.token === link.token ? { ...item, revokedAt: new Date().toISOString() } : item)));
      }}>Отозвать</button>}
    </li>;
  })}</ul>;
}
