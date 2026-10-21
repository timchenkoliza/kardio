"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, MessageSquareText, Plus, Send, X } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import {
  expertTwinsCouncilForSpecialty,
  expertTwinsPanels,
  inferExpertTwinsDomainTags,
  type ExpertTwinsDecision,
  type ExpertTwinsResult,
  type ExpertTwinsSynthesis,
} from "@/lib/integrations/expert-twins";
import { buildConsiliumSynthesis, consiliumPersonas, deterministicConsiliumReply, type ConsiliumReply } from "@/lib/ui/consilium";
import { drugDemoData } from "@/lib/ui/drug-intelligence";

const STORAGE_KEY = "kardio.consilium.v1";

type RuntimeMode = "deterministic_fallback" | "expert_twins";
type Participant = { id: string; displayName: string; role: string; lens: string };
type Message = {
  id: string;
  author: "user" | string;
  body: string;
  role?: string;
  attributionNotice?: string;
  evidenceCount?: number;
};

type StoredState = {
  selectedIds: string[];
  messages: Message[];
  targetPersonaId: string | null;
  runtime?: RuntimeMode;
  remoteSynthesis?: ExpertTwinsSynthesis | null;
};

type RuntimeStatus = {
  configured: boolean;
  council: "cardiology" | "oncology";
  experts: Participant[];
  fallback: string | null;
};

type ConsiliumApiResponse = {
  source: "expert_twins";
  result: ExpertTwinsResult;
};

const DEFAULT_SELECTED = ["outpatient", "arrhythmia", "pharm"];

function readStored(): StoredState {
  if (typeof window === "undefined") return { selectedIds: DEFAULT_SELECTED, messages: [], targetPersonaId: null, runtime: "deterministic_fallback", remoteSynthesis: null };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as StoredState | null;
    return parsed ?? { selectedIds: DEFAULT_SELECTED, messages: [], targetPersonaId: null, runtime: "deterministic_fallback", remoteSynthesis: null };
  } catch {
    return { selectedIds: DEFAULT_SELECTED, messages: [], targetPersonaId: null, runtime: "deterministic_fallback", remoteSynthesis: null };
  }
}

function expertDecisionBody(expert: ExpertTwinsDecision): string {
  if (expert.status === "ABSTAIN") {
    return expert.abstention_reason ? `Воздерживается: ${expert.abstention_reason}` : "Воздерживается: в корпусе недостаточно релевантного evidence для ответа.";
  }
  return [expert.decision, ...expert.rationale.slice(0, 2)].filter((value): value is string => Boolean(value)).join(" ");
}

function normalizeRemoteSynthesis(synthesis: ExpertTwinsSynthesis | null): { agree: string[]; disagree: string[]; clarify: string[] } | null {
  if (!synthesis) return null;
  return {
    agree: [synthesis.consensus_summary, ...synthesis.agreements].filter(Boolean),
    disagree: synthesis.disagreements.map(item => item.explanation || `${item.topic}: позиции различаются.`),
    clarify: synthesis.unresolved_questions,
  };
}

export function ConsiliumWorkspace({ specialty, drugId, indication }: { specialty: SpecialtyId; drugId?: string; indication?: string }) {
  const drug = drugDemoData.find(item => item.id === drugId);
  const contextLabel = drug ? `${drug.tradeName} · ${indication || drug.indications[0]}` : undefined;
  const contextualPrompt = drug ? `На какие аспекты вы бы обратили внимание при оценке препарата ${drug.tradeName} для показания «${indication || drug.indications[0]}»?` : "";
  const [initial] = useState<StoredState>(readStored);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(initial.runtime ?? "deterministic_fallback");
  const [runtimeChecked, setRuntimeChecked] = useState(false);
  const [selectedIds, setSelectedIds] = useState(initial.selectedIds.length ? initial.selectedIds : DEFAULT_SELECTED);
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [targetPersonaId, setTargetPersonaId] = useState<string | null>(initial.targetPersonaId);
  const [draft, setDraft] = useState(contextualPrompt);
  const [remoteSynthesis, setRemoteSynthesis] = useState<ExpertTwinsSynthesis | null>(initial.remoteSynthesis ?? null);
  const [sending, setSending] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  // The legacy archive (and with it the consilium) is served for cardiology and oncology only.
  const council = expertTwinsCouncilForSpecialty(specialty) ?? "cardiology";
  const expertParticipants = expertTwinsPanels[council];
  const participants: Participant[] = runtimeMode === "expert_twins" ? expertParticipants : consiliumPersonas;
  const participantIds = new Set(participants.map(persona => persona.id));
  const validSelectedIds = selectedIds.filter(id => participantIds.has(id));
  const effectiveSelectedIds = validSelectedIds.length >= 2
    ? validSelectedIds
    : runtimeMode === "expert_twins"
      ? participants.map(persona => persona.id)
      : DEFAULT_SELECTED;
  const effectiveTargetPersonaId = targetPersonaId && participantIds.has(targetPersonaId) ? targetPersonaId : null;
  const selected = participants.filter(persona => effectiveSelectedIds.includes(persona.id));
  const visibleMessages = messages.filter(message => message.author === "user" || participantIds.has(message.author));

  const latestReplies = visibleMessages
    .filter(message => message.author !== "user")
    .slice(-Math.max(selected.length, 1))
    .map(message => ({ personaId: message.author, body: message.body } satisfies ConsiliumReply));

  const localSynthesis = latestReplies.length ? buildConsiliumSynthesis(latestReplies) : null;
  const synthesis = runtimeMode === "expert_twins" ? normalizeRemoteSynthesis(remoteSynthesis) : localSynthesis;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/consilium?specialty=${specialty}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error(`Consilium runtime ${response.status}`);
        return response.json() as Promise<RuntimeStatus>;
      })
      .then(status => {
        if (cancelled) return;
        setRuntimeMode(status.configured ? "expert_twins" : "deterministic_fallback");
        setRuntimeChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRuntimeMode("deterministic_fallback");
        setRuntimeChecked(true);
      });
    return () => { cancelled = true; };
  }, [specialty]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedIds, messages, targetPersonaId, runtime: runtimeMode, remoteSynthesis } satisfies StoredState));
  }, [selectedIds, messages, targetPersonaId, runtimeMode, remoteSynthesis]);

  function togglePersona(id: string) {
    setSelectedIds(() => {
      const current = effectiveSelectedIds;
      if (current.includes(id)) return current.length <= 2 ? current : current.filter(item => item !== id);
      const max = runtimeMode === "expert_twins" ? 3 : 5;
      return current.length >= max ? current : [...current, id];
    });
  }

  async function send() {
    const prompt = draft.trim();
    if (!prompt || sending) return;
    const turnId = `${messages.length + 1}`;
    const userMessage: Message = { id: `user-${turnId}`, author: "user", body: prompt };
    setMessages(current => [...current, userMessage]);
    setDraft("");
    setServiceError(null);

    if (runtimeMode === "deterministic_fallback") {
      const responders = effectiveTargetPersonaId
        ? consiliumPersonas.filter(persona => persona.id === effectiveTargetPersonaId)
        : consiliumPersonas.filter(persona => effectiveSelectedIds.includes(persona.id));
      const replies = responders.map((persona, index): Message => ({
        id: `reply-${turnId}-${index}`,
        author: persona.id,
        role: persona.role,
        body: deterministicConsiliumReply(persona, prompt, contextLabel),
      }));
      setMessages(current => [...current, ...replies]);
      return;
    }

    setSending(true);
    try {
      const domainTags = inferExpertTwinsDomainTags(council, `${prompt} ${contextLabel ?? ""}`);
      const response = await fetch("/api/consilium", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          specialty,
          question: prompt,
          domain_tags: domainTags,
          state: contextLabel ? { other: { context_label: contextLabel } } : undefined,
          max_evidence_per_expert: 5,
        }),
      });

      if (!response.ok) throw new Error(`Expert Twins ${response.status}`);
      const payload = await response.json() as ConsiliumApiResponse;
      const allowedIds = new Set(effectiveTargetPersonaId ? [effectiveTargetPersonaId] : effectiveSelectedIds);
      const expertReplies = payload.result.experts
        .filter(expert => allowedIds.has(expert.expert_id))
        .map((expert, index): Message => ({
          id: `reply-${turnId}-${index}`,
          author: expert.expert_id,
          role: expert.status === "ABSTAIN" ? "ABSTAIN" : `${expert.mode} · ${Math.round(expert.confidence * 100)}%`,
          body: expertDecisionBody(expert),
          attributionNotice: expert.attribution_notice,
          evidenceCount: expert.evidence.length,
        }));

      setMessages(current => [...current, ...expertReplies]);
      setRemoteSynthesis(effectiveTargetPersonaId ? null : payload.result.synthesis);
    } catch {
      setServiceError("Expert Twins недоступен. Именные модельные ответы не подменяются локальным mock — повторите запрос после восстановления сервиса.");
    } finally {
      setSending(false);
    }
  }

  if (specialty !== "cardiology" && runtimeMode !== "expert_twins") {
    return <section className="decision-workspace"><span className="eyebrow">Онкология · консилиум</span><h1>Консилиум</h1><p className="decision-lede">Онкологические AI-персоны пока не заведены: продукт не переиспользует кардиологические архетипы под другой специальностью.</p>{runtimeChecked && <p className="muted">Expert Twins sidecar не настроен для этого runtime.</p>}</section>;
  }

  return <section className="decision-workspace consilium-workspace" aria-labelledby="consilium-title">
    <header className="decision-header">
      <div>
        <span className="eyebrow">{runtimeMode === "expert_twins" ? "Профессиональное обсуждение · evidence-grounded модели экспертов" : "Профессиональное обсуждение · синтетические эксперты"}</span>
        <h1 id="consilium-title">Консилиум</h1>
        <p className="decision-lede">{runtimeMode === "expert_twins" ? "Три независимые модели отвечают по собственным проверенным DecisionTrace, после чего система отдельно показывает согласия и расхождения. OBSERVED и PREDICTED не смешиваются. Это не текущая позиция реального врача и не медицинское решение за пользователя. Не передавайте персональные данные пациента." : "Несколько профессиональных линз на один вопрос: отдельно мнения, отдельно точки согласия и расхождения. Это не медицинское решение за врача. Не передавайте персональные данные пациента."}</p>
      </div>
      <span className="synthetic-note">{runtimeMode === "expert_twins" ? "Expert Twins · OBSERVED/PREDICTED · публичный evidence corpus" : "Синтетический консилиум · ответы AI-персон"}</span>
    </header>

    {contextLabel && <div className="consilium-context"><span>Обсуждаем</span><strong>{contextLabel}</strong><a href={`/${specialty}?view=drugs`} className="quiet-button">Вернуться к препаратам <ArrowRight size={14} /></a></div>}

    <div className="consilium-layout">
      <aside className="consilium-personas" aria-label="Состав консилиума">
        <div className="decision-section-head"><div><span className="eyebrow">{runtimeMode === "expert_twins" ? "2–3 модели из панели" : "2–5 участников"}</span><h2>Состав</h2></div><span>{effectiveSelectedIds.length}</span></div>
        <div className="persona-list">
          {participants.map(persona => {
            const active = effectiveSelectedIds.includes(persona.id);
            return <button key={persona.id} className={`persona-row ${active ? "active" : ""}`} onClick={() => togglePersona(persona.id)} aria-pressed={active}>
              <span className="persona-avatar" aria-hidden="true">{persona.displayName.slice(0, 1)}</span>
              <span><strong>{persona.displayName}</strong><small>{persona.role}</small><em>{persona.lens}</em></span>
              {active ? <Check size={16} /> : <Plus size={16} />}
            </button>;
          })}
        </div>
      </aside>

      <section className="consilium-chat" aria-label="Разговор">
        <div className="decision-section-head"><div><span className="eyebrow">Рабочая сессия</span><h2>Разговор</h2></div>{visibleMessages.length > 0 && <button className="quiet-button" onClick={() => { setMessages([]); setRemoteSynthesis(null); setServiceError(null); }}><X size={14} /> Очистить</button>}</div>
        <div className="chat-stream">
          {visibleMessages.length === 0 && <div className="chat-empty"><MessageSquareText size={26} /><strong>Задайте профессиональный вопрос</strong><span>{runtimeMode === "expert_twins" ? "Ответы будут отделять наблюдаемое evidence от модельного прогноза." : "Можно спросить всех или адресовать следующий вопрос одному участнику."}</span></div>}
          {visibleMessages.map(message => {
            if (message.author === "user") return <div className="chat-message user" key={message.id}><span>Вы</span><p>{message.body}</p></div>;
            const persona = participants.find(item => item.id === message.author);
            return <div className="chat-message persona" key={message.id}>
              <div><strong>{persona?.displayName ?? "AI-персона"}</strong><small>{message.role}</small></div>
              <p>{message.body}</p>
              {message.attributionNotice && <small className="muted">{message.attributionNotice}</small>}
              {typeof message.evidenceCount === "number" && <small className="muted">Evidence: {message.evidenceCount}</small>}
              <button className="message-target" onClick={() => setTargetPersonaId(message.author)}>Спросить отдельно</button>
            </div>;
          })}
          {serviceError && <p role="status" className="muted">{serviceError}</p>}
        </div>
        <div className="chat-composer">
          <div className="composer-targets"><button className={effectiveTargetPersonaId === null ? "active" : ""} onClick={() => setTargetPersonaId(null)}>Спросить всех</button>{selected.map(persona => <button key={persona.id} className={effectiveTargetPersonaId === persona.id ? "active" : ""} onClick={() => setTargetPersonaId(persona.id)}>{persona.displayName}</button>)}</div>
          <div className="composer-row"><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder={effectiveTargetPersonaId ? `Спросить ${participants.find(item => item.id === effectiveTargetPersonaId)?.displayName ?? "эксперта"}` : "Спросить всех"} maxLength={1200} /><button className="primary-button" onClick={send} disabled={!draft.trim() || sending}><Send size={16} /> {sending ? "Запрашиваем…" : "Отправить"}</button></div>
        </div>
      </section>

      <aside className="consilium-synthesis" aria-label="Сводка консилиума">
        <div className="decision-section-head"><div><span className="eyebrow">После полного раунда</span><h2>Сводка</h2></div></div>
        {synthesis ? <>
          <section><h3>Сходятся</h3>{synthesis.agree.map(item => <p key={item}>{item}</p>)}</section>
          <section><h3>Расходятся</h3>{synthesis.disagree.map(item => <p key={item}>{item}</p>)}</section>
          <section><h3>Нужно уточнить</h3>{synthesis.clarify.map(item => <p key={item}>{item}</p>)}</section>
          <section><h3>Источники</h3><p>{runtimeMode === "expert_twins" ? "Evidence привязано к DecisionTrace и source provenance; неподтверждённые traces не должны участвовать в policy." : "Используйте первоисточники из каталога и конкретные рекомендации. Демо-движок не придумывает новые ссылки."}</p></section>
        </> : <p className="muted">Сводка появится после первого полного раунда и сохранит расхождения между моделями.</p>}
      </aside>
    </div>
  </section>;
}
