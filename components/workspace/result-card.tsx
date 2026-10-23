"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, CalendarPlus, Check, ChevronDown, ExternalLink, EyeOff, Handshake, ShieldCheck, Ticket } from "lucide-react";
import { SavedLink } from "@/components/portal/result-actions";
import { DRUG_CHANGE_LABEL, formatDateRu, verificationLabelFor, weakestVerification } from "@/lib/agents/format";
import { STANDING_LABEL, type SourceStanding } from "@/lib/agents/source-policy";
import type { AgentResultView, DrugChangeType, Evidence } from "@/lib/agents/types";
import { feedIllustrations, type AgentResultMedia } from "@/lib/ui/agent-result-media";
import { FeedArt } from "./feed-art";
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
  reference_answer: "Вывод источника",
  drug_label: "Инструкция",
  partner: "Партнёрский материал",
};

function categoryLabel(result: AgentResultView): string | null {
  if (result.kind === "drug_change" && result.category && result.category in DRUG_CHANGE_LABEL) {
    const status = result.attributes.status === "announced" ? " · анонс" : "";
    return `${DRUG_CHANGE_LABEL[result.category as DrugChangeType].title}${result.attributes.region ? ` · ${result.attributes.region}` : ""}${status}`;
  }
  if (result.kind === "guideline_change") {
    if (result.category === "guideline_publication") return `Опубликованные рекомендации${typeof result.attributes.journal === "string" ? ` · ${result.attributes.journal}` : ""}`;
    if (result.category === "needs_check") return "Проверить актуальность";
    if (result.category === "first_guideline") return `${result.attributes.society ?? ""} · первые рекомендации по теме`;
    if (result.category === "consensus_document") return `${result.attributes.society ?? ""} · согласительный документ`;
    return `${result.attributes.society ?? ""} · новая версия`;
  }
  if (result.kind === "learning_module") return ({ guideline: "Рекомендации", update: "Что нового", lecture: "Видеолекция", self_check: "Самопроверка", event: "Событие с НМО", review: "Обзор для чтения" } as Record<string, string>)[result.category ?? ""] ?? "Учебный шаг";
  if (result.kind === "update" && result.category === "publication") return "Новая публикация";
  return null;
}

type ArtKind = "guideline" | "article" | "video" | "clinical" | "event";

function artKind(result: AgentResultView): ArtKind | undefined {
  if (result.kind === "event") return "event";
  if (result.kind === "guideline_change") return "guideline";
  if (result.kind === "drug_change") return "clinical";
  const category = result.category ?? "";
  if (category === "guideline") return "guideline";
  if (category === "video" || category === "lecture") return "video";
  if (category === "clinical") return "clinical";
  if (category === "event") return "event";
  if (category === "article" || category === "publication" || category === "update") return "article";
  return undefined;
}

/** Physician source validation, shown quietly next to provenance (never as a badge competing with the finding). */
function SourceStandingNote({ standing, note }: { standing?: SourceStanding; note?: string | null }) {
  if (!standing || standing === "rejected") return null;
  return <span className="ws-standing" data-standing={standing} title={note ?? undefined}>{STANDING_LABEL[standing]}</span>;
}

function EvidenceItem({ item, onOpen }: { item: Evidence; onOpen: () => void }) {
  const verification = verificationLabelFor(item.verificationStatus, [item]);
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
      {item.provenance.standing && <> · <SourceStandingNote standing={item.provenance.standing} note={item.provenance.standingNote} /></>}
    </p>
    {item.verificationNote && <p className="ws-evidence-note">{item.verificationNote}</p>}
  </li>;
}

export function ResultCard({ result, media = null }: { result: AgentResultView; specialty: string; media?: AgentResultMedia | null }) {
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
  const drugOfficialVerification = result.kind === "drug_change" && typeof result.attributes["drugAssessment.officialVerificationLabel"] === "string"
    ? result.attributes["drugAssessment.officialVerificationLabel"]
    : null;
  const drugSourceBasis = result.kind === "drug_change" && typeof result.attributes["drugAssessment.sourceBasisLabel"] === "string"
    ? result.attributes["drugAssessment.sourceBasisLabel"]
    : null;
  const drugPracticeImpact = result.kind === "drug_change" && typeof result.attributes["drugAssessment.practiceImpact"] === "string"
    ? result.attributes["drugAssessment.practiceImpact"]
    : null;

  function opened(evidence = false) {
    void command({ action: "openResult", resultId: result.id, evidence }, { quiet: true, refresh: false });
    if (evidence && result.kind === "event") void command({ action: "track", event: "event_opened", resultId: result.id, resultKind: result.kind }, { quiet: true, refresh: false });
  }

  async function prepare(kind: "calendar_write" | "registration", url?: string | null) {
    if (kind === "registration") void command({ action: "track", event: "event_registration_clicked", resultId: result.id, resultKind: result.kind }, { quiet: true, refresh: false });
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

  return <article className={`ws-result ws-result-${result.kind}${result.newSinceLastSeen ? " is-new" : ""}${done ? " is-done" : ""}${media ? " has-media" : ""}`} aria-labelledby={`r-${result.id}`}>
    {isEvent && startDate && <div className="ws-date-block" aria-hidden="true"><strong>{Number(startDate.slice(8, 10))}</strong><span>{formatDateRu(startDate, { month: "short" })}</span></div>}
    <div className="ws-result-body">
      {media && <div className="ws-result-media"><FeedArt art={media.art} alt={media.alt} animated={media.animated} /></div>}
      <div className="ws-result-content">
      <div className="ws-result-meta">
        {result.newSinceLastSeen && <span className="ws-new">Новое</span>}
        <span className="ws-kind" data-art={artKind(result)}>{label ?? KIND_LABEL[result.kind]}</span>
        {verification && <span className={`ws-verify ws-verify-${verificationLabelFor(verification, result.evidence).tone}`}><ShieldCheck size={13} aria-hidden="true" />{verificationLabelFor(verification, result.evidence).label}</span>}
      </div>
      <h3 className="ws-result-title" id={`r-${result.id}`}>
        {internal?.href ? <Link href={internal.href} onClick={() => opened(false)}>{result.title}</Link> : result.title}
      </h3>
      <p className="ws-result-summary">{result.summary}</p>
      {result.kind === "drug_change" && typeof result.attributes.inn === "string" && <p className="ws-result-facts">{result.attributes.inn}{result.attributes.brand ? ` · ${result.attributes.brand}` : ""}{result.attributes.holder ? ` · ${result.attributes.holder}` : ""}{result.attributes.changeDateNote ? ` · ${result.attributes.changeDateNote}` : ""}</p>}
      {result.kind === "drug_change" && (drugSourceBasis || drugOfficialVerification) && <p className="ws-result-facts">{drugSourceBasis}{drugOfficialVerification && !drugPracticeImpact ? `${drugSourceBasis ? " · " : ""}${drugOfficialVerification}` : ""}</p>}
      {result.kind === "drug_change" && drugPracticeImpact && <p className="ws-result-facts"><strong>Что это значит:</strong> {drugPracticeImpact}</p>}
      {result.kind === "event" && <p className="ws-result-facts">{String(result.attributes.organizer ?? "")}{result.attributes.nmo === true ? " · в списке аккредитованных НМО" : ""}</p>}
      {result.kind === "guideline_change" && typeof result.attributes.deltas === "string" && result.attributes.deltas && <p className="ws-result-facts">{result.attributes.deltas}</p>}
      {result.reasonShown.length > 0 && <ul className="ws-reasons" aria-label="Почему это здесь">{result.reasonShown.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      <p className="ws-provenance">
        <span>{result.source.source}</span>
        <ModeBadge mode="LIVE" origin={result.source.dataOrigin} snapshotAt={result.source.dataOrigin === "runtime_api" ? null : result.source.retrievedAt} />
        {result.source.standing !== "unreviewed" && <SourceStandingNote standing={result.source.standing} note={result.source.standingNote} />}
      </p>
      </div>
      {result.evidence.length > 0 && <details className="ws-evidence" onToggle={event => { if ((event.currentTarget as HTMLDetailsElement).open) opened(false); }}>
        <summary>Утверждения и источники · {result.evidence.length}<ChevronDown size={14} aria-hidden="true" /></summary>
        <ul>{result.evidence.map(item => <EvidenceItem key={item.id} item={item} onOpen={() => opened(true)} />)}</ul>
      </details>}
      <div className="ws-result-actions">
        {result.actions.filter(action => action.kind === "open_source" && action.href).slice(0, 2).map(action => <a key={action.label} className="ws-button is-small" href={action.href ?? undefined} target="_blank" rel="noreferrer" onClick={() => opened(true)}>{action.label}<ExternalLink size={13} aria-hidden="true" /></a>)}
        {result.actions.some(action => action.kind === "calendar") && <button type="button" className="ws-button is-small" disabled={pending} onClick={() => void prepare("calendar_write")}><CalendarPlus size={14} aria-hidden="true" />В календарь</button>}
        {result.actions.filter(action => action.kind === "registration").map(action => <button type="button" key={action.label} className="ws-button is-small is-accent" disabled={pending} onClick={() => void prepare("registration", action.href)}><Ticket size={14} aria-hidden="true" />{action.label}</button>)}
        {result.kind === "learning_module" && <button type="button" className={done ? "ws-button is-small is-done" : "ws-button is-small"} aria-pressed={done} onClick={() => void toggleDone()}><Check size={14} aria-hidden="true" />{done ? "Пройдено" : "Отметить пройденным"}</button>}
        {result.actions.some(action => action.kind === "save") && (saved ? <SavedLink /> : <button type="button" className="ws-button is-small is-quiet" onClick={() => void save()}><Bookmark size={14} aria-hidden="true" />Сохранить</button>)}
        <button type="button" className="ws-icon-button is-quiet" aria-label="Скрыть находку" title="Скрыть находку" onClick={() => { setHidden(true); void command({ action: "dismissResult", resultId: result.id }, { quiet: true, refresh: false }); }}><EyeOff size={15} /></button>
      </div>
    </div>
  </article>;
}

export function ResultList({ results, specialty, emptyText, illustrated = true }: { results: AgentResultView[]; specialty: string; emptyText: string; illustrated?: boolean }) {
  if (!results.length) return <p className="ws-empty">{emptyText}</p>;
  const media = illustrated ? feedIllustrations(results) : new Map<string, AgentResultMedia>();
  return <div className="ws-result-list">{results.map(result => <ResultCard key={result.id} result={result} specialty={specialty} media={media.get(result.id) ?? null} />)}</div>;
}
