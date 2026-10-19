"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, BookmarkCheck, CalendarPlus, Check, ChevronDown, ExternalLink, EyeOff, Handshake, ShieldCheck, Ticket } from "lucide-react";
import { DRUG_CHANGE_LABEL, VERIFICATION_LABEL, formatDateRu, weakestVerification } from "@/lib/agents/format";
import type { AgentResultView, DrugChangeType, Evidence } from "@/lib/agents/types";
import { ModeBadge } from "./mode-badge";
import { useWorkspace } from "./workspace-provider";

const KIND_LABEL: Record<AgentResultView["kind"], string> = {
  update: "Обновление",
  guideline_change: "Рекомендации",
  drug_change: "Препараты",
  event: "Событие",
  research_finding: "Находка",
  learning_module: "Модуль",
  material_hit: "Ваш материал",
  partner: "Партнёрский материал",
};

function categoryLabel(result: AgentResultView): string | null {
  if (result.kind === "drug_change" && result.category && result.category in DRUG_CHANGE_LABEL) {
    const status = result.attributes.status === "announced" ? " · анонс" : "";
    return `${DRUG_CHANGE_LABEL[result.category as DrugChangeType].title}${result.attributes.region ? ` · ${result.attributes.region}` : ""}${status}`;
  }
  if (result.kind === "guideline_change") {
    if (result.category === "needs_check") return "Проверить актуальность";
    if (result.category === "first_guideline") return `${result.attributes.society ?? ""} · первые рекомендации по теме`;
    if (result.category === "consensus_document") return `${result.attributes.society ?? ""} · согласительный документ`;
    return `${result.attributes.society ?? ""} · новая версия`;
  }
  if (result.kind === "learning_module") return ({ guideline: "Рекомендации", update: "Что нового", lecture: "Видеолекция", self_check: "Самопроверка", event: "Событие с НМО" } as Record<string, string>)[result.category ?? ""] ?? "Модуль";
  if (result.kind === "update" && result.category === "publication") return "Новая публикация";
  return null;
}

function EvidenceItem({ item, onOpen }: { item: Evidence; onOpen: () => void }) {
  const verification = VERIFICATION_LABEL[item.verificationStatus];
  const published = item.publicationDate ? (formatDateRu(item.publicationDate) ?? item.publicationDate) : null;
  return <li className="ws-evidence-item">
    <span className={`ws-verify ws-verify-${verification.tone}`}>{verification.label}</span>
    <p className="ws-evidence-claim">{item.claim}</p>
    <p className="ws-evidence-source">
      {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" onClick={onOpen}>{item.provenance.source}<ExternalLink size={12} aria-hidden="true" /></a> : <span>{item.provenance.source}</span>}
      {item.provenance.publisher && item.provenance.publisher !== item.provenance.source && <span> · {item.provenance.publisher}</span>}
      {published && <span> · опубликовано {published}</span>}
      <span> · получено {formatDateRu(item.retrievedAt, { day: "numeric", month: "short", year: "numeric" }) ?? "—"}</span>
      {item.provenance.version && <span> · {item.provenance.version}</span>}
    </p>
    {item.verificationNote && <p className="ws-evidence-note">{item.verificationNote}</p>}
  </li>;
}

export function ResultCard({ result }: { result: AgentResultView; specialty: string }) {
  const { command, setPendingAction, pending } = useWorkspace();
  const [saved, setSaved] = useState(Boolean(result.savedMaterialId));
  const [done, setDone] = useState(result.attributes.done === true);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const verification = result.evidence.length ? weakestVerification(result.evidence.map(item => item.verificationStatus)) : null;
  const internal = result.actions.find(action => action.kind === "open_internal");
  const label = categoryLabel(result);
  const isEvent = result.kind === "event";
  const startDate = typeof result.attributes.startDate === "string" ? result.attributes.startDate : null;

  function opened(evidence = false) {
    void command({ action: "openResult", resultId: result.id, evidence }, { quiet: true, refresh: false });
  }

  async function prepare(kind: "calendar_write" | "registration", url?: string | null) {
    const response = await command({ action: "prepareAction", kind, resultIds: [result.id], ...(url ? { url } : {}) }, { refresh: false });
    if (response?.action) setPendingAction(response.action);
  }

  async function save() {
    const response = await command({ action: "saveResult", resultId: result.id }, { refresh: false });
    if (response) setSaved(true);
  }

  async function toggleDone() {
    const response = await command({ action: "learningProgress", resultId: result.id, done: !done }, { refresh: false });
    if (response) setDone(!done);
  }

  if (result.partner) {
    return <article className="ws-result is-partner" aria-label="Партнёрский материал">
      <div className="ws-result-meta"><span className="ws-partner-label"><Handshake size={14} aria-hidden="true" />{result.partner.label}</span><span>{result.partner.sponsor}</span>{result.partner.synthetic && <span className="ws-mode ws-mode-mock">Синтетический пример</span>}</div>
      <h3 className="ws-result-title">{result.title}</h3>
      <p className="ws-result-summary">{result.summary}</p>
      <p className="ws-partner-disclosure">{result.partner.disclosure}. Показан отдельно от доказательной выдачи, потому что совпадает с темой в ваших настройках.</p>
    </article>;
  }

  return <article className={`ws-result ws-result-${result.kind}${result.newSinceLastSeen ? " is-new" : ""}${done ? " is-done" : ""}`} aria-labelledby={`r-${result.id}`}>
    {isEvent && startDate && <div className="ws-date-block" aria-hidden="true"><strong>{Number(startDate.slice(8, 10))}</strong><span>{formatDateRu(startDate, { month: "short" })}</span></div>}
    <div className="ws-result-body">
      <div className="ws-result-meta">
        {result.newSinceLastSeen && <span className="ws-new">Новое</span>}
        <span className="ws-kind">{label ?? KIND_LABEL[result.kind]}</span>
        {verification && <span className={`ws-verify ws-verify-${VERIFICATION_LABEL[verification].tone}`}><ShieldCheck size={13} aria-hidden="true" />{VERIFICATION_LABEL[verification].label}</span>}
      </div>
      <h3 className="ws-result-title" id={`r-${result.id}`}>
        {internal?.href ? <Link href={internal.href} onClick={() => opened(false)}>{result.title}</Link> : result.title}
      </h3>
      <p className="ws-result-summary">{result.summary}</p>
      {result.kind === "drug_change" && typeof result.attributes.inn === "string" && <p className="ws-result-facts">{result.attributes.inn}{result.attributes.brand ? ` · ${result.attributes.brand}` : ""}{result.attributes.holder ? ` · ${result.attributes.holder}` : ""}{result.attributes.changeDateNote ? ` · ${result.attributes.changeDateNote}` : ""}</p>}
      {result.kind === "event" && <p className="ws-result-facts">{String(result.attributes.organizer ?? "")}{result.attributes.nmo === true ? " · в списке аккредитованных НМО" : ""}</p>}
      {result.kind === "guideline_change" && typeof result.attributes.deltas === "string" && result.attributes.deltas && <p className="ws-result-facts">{result.attributes.deltas}</p>}
      {result.reasonShown.length > 0 && <ul className="ws-reasons" aria-label="Почему это здесь">{result.reasonShown.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      <p className="ws-provenance">
        <span>{result.source.source}</span>
        <ModeBadge mode="LIVE" origin={result.source.dataOrigin} snapshotAt={result.source.dataOrigin === "runtime_api" ? null : result.source.retrievedAt} />
      </p>
      {result.evidence.length > 0 && <details className="ws-evidence" onToggle={event => { if ((event.currentTarget as HTMLDetailsElement).open) opened(false); }}>
        <summary>Утверждения и источники · {result.evidence.length}<ChevronDown size={14} aria-hidden="true" /></summary>
        <ul>{result.evidence.map(item => <EvidenceItem key={item.id} item={item} onOpen={() => opened(true)} />)}</ul>
      </details>}
      <div className="ws-result-actions">
        {result.actions.filter(action => action.kind === "open_source" && action.href).slice(0, 2).map(action => <a key={action.label} className="ws-button is-small" href={action.href ?? undefined} target="_blank" rel="noreferrer" onClick={() => opened(true)}>{action.label}<ExternalLink size={13} aria-hidden="true" /></a>)}
        {result.actions.some(action => action.kind === "calendar") && <button type="button" className="ws-button is-small" disabled={pending} onClick={() => void prepare("calendar_write")}><CalendarPlus size={14} aria-hidden="true" />В календарь</button>}
        {result.actions.filter(action => action.kind === "registration").map(action => <button type="button" key={action.label} className="ws-button is-small is-accent" disabled={pending} onClick={() => void prepare("registration", action.href)}><Ticket size={14} aria-hidden="true" />{action.label}</button>)}
        {result.kind === "learning_module" && <button type="button" className={done ? "ws-button is-small is-done" : "ws-button is-small"} aria-pressed={done} onClick={() => void toggleDone()}><Check size={14} aria-hidden="true" />{done ? "Пройдено" : "Отметить пройденным"}</button>}
        {result.actions.some(action => action.kind === "save") && <button type="button" className="ws-button is-small is-quiet" disabled={saved} onClick={() => void save()}>{saved ? <BookmarkCheck size={14} aria-hidden="true" /> : <Bookmark size={14} aria-hidden="true" />}{saved ? "В материалах" : "Сохранить"}</button>}
        <button type="button" className="ws-icon-button is-quiet" aria-label="Скрыть находку" title="Скрыть находку" onClick={() => { setHidden(true); void command({ action: "dismissResult", resultId: result.id }, { quiet: true, refresh: false }); }}><EyeOff size={15} /></button>
      </div>
    </div>
  </article>;
}

export function ResultList({ results, specialty, emptyText }: { results: AgentResultView[]; specialty: string; emptyText: string }) {
  if (!results.length) return <p className="ws-empty">{emptyText}</p>;
  return <div className="ws-result-list">{results.map(result => <ResultCard key={result.id} result={result} specialty={specialty} />)}</div>;
}
