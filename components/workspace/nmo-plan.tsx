"use client";

import { useId, useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { formatDateRu } from "@/lib/agents/format";
import type { NmoEntry, NmoPlan } from "@/lib/agents/types";

const KIND_LABEL: Record<NmoEntry["kind"], string> = { event: "Мероприятие", course: "Обучающий модуль или курс", other: "Другое" };

function parseCredits(value: string): number | null | "invalid" {
  const text = value.trim().replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 500 ? number : "invalid";
}

/**
 * «Личный план НМО» (E2): the physician's own record. Totals count only the
 * credits the physician entered; an event added from Kardio has none until
 * they are taken from the organiser's page or the НМО portal.
 */
export function NmoPlanEditor({ plan }: { plan: NmoPlan }) {
  const { command } = useWorkspace();
  const [entries, setEntries] = useState(plan.entries);
  const [target, setTarget] = useState(plan.target === null ? "" : String(plan.target));
  const [draft, setDraft] = useState({ title: "", date: "", credits: "", kind: "event" as NmoEntry["kind"] });
  const ids = { title: useId(), date: useId(), credits: useId(), kind: useId(), target: useId() };
  const counted = entries.filter(entry => entry.credits !== null);
  const total = Math.round(counted.reduce((sum, entry) => sum + (entry.credits ?? 0), 0) * 10) / 10;
  const missing = entries.length - counted.length;
  const goal = Number(target);

  async function saveTarget() {
    const value = target.trim() ? Math.round(Number(target)) : null;
    if (value !== null && (!Number.isFinite(value) || value < 1 || value > 1000)) return;
    await command({ action: "nmoSetTarget", target: value }, { refresh: false });
  }

  async function add() {
    const credits = parseCredits(draft.credits);
    if (draft.title.trim().length < 3 || !/^\d{4}-\d{2}-\d{2}$/u.test(draft.date) || credits === "invalid") return;
    const response = await command({ action: "nmoAdd", title: draft.title.trim(), date: draft.date, credits, kind: draft.kind, from: "manual", url: null }, { refresh: false });
    if (!response) return;
    setEntries(current => [{ id: `local-${draft.title}-${draft.date}`, title: draft.title.trim(), date: draft.date, credits, kind: draft.kind, from: "manual" as const, url: null, addedAt: new Date().toISOString() }, ...current].sort((a, b) => b.date.localeCompare(a.date)));
    setDraft({ title: "", date: "", credits: "", kind: draft.kind });
  }

  async function setCredits(entry: NmoEntry, value: string) {
    const credits = parseCredits(value);
    if (credits === "invalid" || credits === entry.credits || entry.id.startsWith("local-")) return;
    const response = await command({ action: "nmoSetCredits", id: entry.id, credits }, { refresh: false });
    if (response) setEntries(current => current.map(item => (item.id === entry.id ? { ...item, credits } : item)));
  }

  async function remove(entry: NmoEntry) {
    if (!entry.id.startsWith("local-")) {
      const response = await command({ action: "nmoRemove", id: entry.id }, { refresh: false });
      if (!response) return;
    }
    setEntries(current => current.filter(item => item.id !== entry.id));
  }

  return <div className="pt-nmo">
    <p className="pt-nmo-total" aria-live="polite">
      <strong>{total.toLocaleString("ru-RU")}</strong> ЗЕТ внесено{target.trim() && Number.isFinite(goal) && goal > 0 ? ` из вашей цели ${goal}` : ""}
      {missing > 0 && <span className="ws-muted"> · без указанных баллов: {missing}</span>}
    </p>
    <p className="ws-muted">Это ваш личный учёт: продукт не знает баллов, которые вы не внесли, и не подтверждает их. Требования к циклу и подтверждённые баллы — на портале НМО. <a className="ws-text-link" href="https://edu.rosminzdrav.ru/" target="_blank" rel="noreferrer">edu.rosminzdrav.ru<ExternalLink size={13} aria-hidden="true" /></a></p>
    <div className="pt-nmo-target">
      <label htmlFor={ids.target}>Моя цель, ЗЕТ</label>
      <input id={ids.target} inputMode="numeric" value={target} onChange={event => setTarget(event.target.value)} onBlur={() => void saveTarget()} placeholder="не задана" />
    </div>
    {entries.length > 0 && <ul className="pt-nmo-list">{entries.map(entry => <li key={entry.id}>
      <div>
        <strong>{entry.url ? <a className="ws-text-link" href={entry.url} target="_blank" rel="noreferrer">{entry.title}</a> : entry.title}</strong>
        <span className="ws-muted">{formatDateRu(entry.date) ?? entry.date} · {KIND_LABEL[entry.kind]}{entry.from === "event" ? " · из афиши Kardio" : ""}</span>
      </div>
      <label className="pt-nmo-credits"><span>ЗЕТ</span><input inputMode="decimal" defaultValue={entry.credits === null ? "" : String(entry.credits)} placeholder="не указано" aria-label={`Баллы НМО: ${entry.title}`} onBlur={event => void setCredits(entry, event.currentTarget.value)} /></label>
      <button type="button" className="ws-icon-button" aria-label={`Убрать из плана: ${entry.title}`} onClick={() => void remove(entry)}><Trash2 size={16} aria-hidden="true" /></button>
    </li>)}</ul>}
    <fieldset className="pt-nmo-add">
      <legend>Добавить запись</legend>
      <label htmlFor={ids.title}>Название</label>
      <input id={ids.title} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Например: школа по ХСН" />
      <div className="pt-nmo-row">
        <div><label htmlFor={ids.date}>Дата</label><input id={ids.date} type="date" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></div>
        <div><label htmlFor={ids.credits}>ЗЕТ</label><input id={ids.credits} inputMode="decimal" value={draft.credits} onChange={event => setDraft({ ...draft, credits: event.target.value })} placeholder="если известны" /></div>
        <div><label htmlFor={ids.kind}>Тип</label><select id={ids.kind} value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as NmoEntry["kind"] })}>{(Object.keys(KIND_LABEL) as NmoEntry["kind"][]).map(kind => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}</select></div>
      </div>
      <button type="button" className="ws-button is-small" disabled={draft.title.trim().length < 3 || !draft.date} onClick={() => void add()}><Plus size={14} aria-hidden="true" />Добавить</button>
    </fieldset>
  </div>;
}
