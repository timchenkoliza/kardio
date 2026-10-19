"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, MessageSquareText, Plus, Send, X } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { buildConsiliumSynthesis, consiliumPersonas, deterministicConsiliumReply, type ConsiliumReply } from "@/lib/ui/consilium";
import { drugDemoData } from "@/lib/ui/drug-intelligence";

const STORAGE_KEY = "kardio.consilium.v1";

type Message = { id: string; author: "user" | string; body: string; role?: string };

type StoredState = {
  selectedIds: string[];
  messages: Message[];
  targetPersonaId: string | null;
};

const DEFAULT_SELECTED = ["outpatient", "arrhythmia", "pharm"];

function readStored(): StoredState {
  if (typeof window === "undefined") return { selectedIds: DEFAULT_SELECTED, messages: [], targetPersonaId: null };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as StoredState | null;
    return parsed ?? { selectedIds: DEFAULT_SELECTED, messages: [], targetPersonaId: null };
  } catch {
    return { selectedIds: DEFAULT_SELECTED, messages: [], targetPersonaId: null };
  }
}

export function ConsiliumWorkspace({ specialty, drugId, indication }: { specialty: SpecialtyId; drugId?: string; indication?: string }) {
  const drug = drugDemoData.find(item => item.id === drugId);
  const contextLabel = drug ? `${drug.tradeName} · ${indication || drug.indications[0]}` : undefined;
  const contextualPrompt = drug ? `На какие аспекты вы бы обратили внимание при оценке препарата ${drug.tradeName} для показания «${indication || drug.indications[0]}»?` : "";
  const [initial] = useState<StoredState>(readStored);
  const [selectedIds, setSelectedIds] = useState(initial.selectedIds.length ? initial.selectedIds : DEFAULT_SELECTED);
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [targetPersonaId, setTargetPersonaId] = useState<string | null>(initial.targetPersonaId);
  const [draft, setDraft] = useState(contextualPrompt);

  const selected = consiliumPersonas.filter(persona => selectedIds.includes(persona.id));
  const latestReplies = messages.filter(message => message.author !== "user").slice(-selected.length).map(message => ({ personaId: message.author, body: message.body } satisfies ConsiliumReply));
  const synthesis = latestReplies.length ? buildConsiliumSynthesis(latestReplies) : null;

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedIds, messages, targetPersonaId } satisfies StoredState));
  }, [selectedIds, messages, targetPersonaId]);

  function togglePersona(id: string) {
    setSelectedIds(current => {
      if (current.includes(id)) return current.length <= 2 ? current : current.filter(item => item !== id);
      return current.length >= 5 ? current : [...current, id];
    });
  }

  function send() {
    const prompt = draft.trim();
    if (!prompt) return;
    const base = messages.length;
    const userMessage: Message = { id: `user-${base}`, author: "user", body: prompt };
    const responders = targetPersonaId ? consiliumPersonas.filter(persona => persona.id === targetPersonaId) : selected;
    const replies = responders.map((persona, index): Message => ({ id: `reply-${base}-${index}`, author: persona.id, role: persona.role, body: deterministicConsiliumReply(persona, prompt, contextLabel) }));
    setMessages(current => [...current, userMessage, ...replies]);
    setDraft("");
  }

  if (specialty !== "cardiology") {
    return <section className="decision-workspace"><span className="eyebrow">Онкология · консилиум</span><h1>Консилиум</h1><p className="decision-lede">Онкологические AI-персоны пока не заведены: продукт не переиспользует кардиологические архетипы под другой специальностью.</p></section>;
  }

  return <section className="decision-workspace consilium-workspace" aria-labelledby="consilium-title">
    <header className="decision-header">
      <div><span className="eyebrow">Профессиональное обсуждение · синтетические эксперты</span><h1 id="consilium-title">Консилиум</h1><p className="decision-lede">Несколько профессиональных линз на один вопрос: отдельно мнения, отдельно точки согласия и расхождения. Это не медицинское решение за врача. Не передавайте персональные данные пациента.</p></div>
      <span className="synthetic-note">Синтетический консилиум · ответы AI-персон</span>
    </header>

    {contextLabel && <div className="consilium-context"><span>Обсуждаем</span><strong>{contextLabel}</strong><a href={`/${specialty}?view=drugs`} className="quiet-button">Вернуться к препаратам <ArrowRight size={14} /></a></div>}

    <div className="consilium-layout">
      <aside className="consilium-personas" aria-label="Состав консилиума">
        <div className="decision-section-head"><div><span className="eyebrow">2–5 участников</span><h2>Состав</h2></div><span>{selectedIds.length}</span></div>
        {consiliumPersonas.map(persona => {
          const active = selectedIds.includes(persona.id);
          return <button key={persona.id} className={`persona-row ${active ? "active" : ""}`} onClick={() => togglePersona(persona.id)} aria-pressed={active}>
            <span className="persona-avatar" aria-hidden="true">{persona.displayName.slice(0, 1)}</span>
            <span><strong>{persona.displayName}</strong><small>{persona.role}</small><em>{persona.lens}</em></span>
            {active ? <Check size={16} /> : <Plus size={16} />}
          </button>;
        })}
      </aside>

      <section className="consilium-chat" aria-label="Разговор">
        <div className="decision-section-head"><div><span className="eyebrow">Рабочая сессия</span><h2>Разговор</h2></div>{messages.length > 0 && <button className="quiet-button" onClick={() => setMessages([])}><X size={14} /> Очистить</button>}</div>
        <div className="chat-stream">
          {messages.length === 0 && <div className="chat-empty"><MessageSquareText size={26} /><strong>Задайте профессиональный вопрос</strong><span>Можно спросить всех или адресовать следующий вопрос одному участнику.</span></div>}
          {messages.map(message => {
            if (message.author === "user") return <div className="chat-message user" key={message.id}><span>Вы</span><p>{message.body}</p></div>;
            const persona = consiliumPersonas.find(item => item.id === message.author);
            return <div className="chat-message persona" key={message.id}><div><strong>{persona?.displayName ?? "AI-персона"}</strong><small>{message.role}</small></div><p>{message.body}</p><button className="message-target" onClick={() => setTargetPersonaId(message.author)}>Спросить отдельно</button></div>;
          })}
        </div>
        <div className="chat-composer">
          <div className="composer-targets"><button className={targetPersonaId === null ? "active" : ""} onClick={() => setTargetPersonaId(null)}>Спросить всех</button>{selected.map(persona => <button key={persona.id} className={targetPersonaId === persona.id ? "active" : ""} onClick={() => setTargetPersonaId(persona.id)}>{persona.displayName}</button>)}</div>
          <div className="composer-row"><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder={targetPersonaId ? `Спросить ${consiliumPersonas.find(item => item.id === targetPersonaId)?.displayName ?? "эксперта"}` : "Спросить всех"} maxLength={1200} /><button className="primary-button" onClick={send} disabled={!draft.trim()}><Send size={16} /> Отправить</button></div>
        </div>
      </section>

      <aside className="consilium-synthesis" aria-label="Сводка консилиума">
        <div className="decision-section-head"><div><span className="eyebrow">После полного раунда</span><h2>Сводка</h2></div></div>
        {synthesis ? <>
          <section><h3>Сходятся</h3>{synthesis.agree.map(item => <p key={item}>{item}</p>)}</section>
          <section><h3>Расходятся</h3>{synthesis.disagree.map(item => <p key={item}>{item}</p>)}</section>
          <section><h3>Нужно уточнить</h3>{synthesis.clarify.map(item => <p key={item}>{item}</p>)}</section>
          <section><h3>Источники</h3><p>Используйте первоисточники из каталога и конкретные рекомендации. Демо-движок не придумывает новые ссылки.</p></section>
        </> : <p className="muted">Сводка появится после первого раунда и сохранит расхождения между профессиональными линзами.</p>}
      </aside>
    </div>
  </section>;
}
