"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, ChevronDown, Loader2, Paperclip, ShieldAlert, X } from "lucide-react";
import { AGENT_DEFINITIONS, AGENT_ORDER, agentHref } from "@/lib/agents/definitions";
import { routeIntent } from "@/lib/agents/intent";
import { RISK_COPY } from "@/lib/agents/risk-rules";
import type { AgentId } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { AgentIcon } from "./agent-icon";
import { HelpTip } from "./help-tip";
import { useWorkspace } from "./workspace-provider";

const EXAMPLES: Record<SpecialtyId, string[]> = {
  cardiology: [
    "Что изменилось по ХСН в рекомендациях за последние месяцы",
    "Найди события по кардиологии в Москве и онлайн на 60 дней и поставь в календарь",
    "Какие данные о ПОАК при фибрилляции предсердий и промежуточном риске инсульта",
    "Собери маршрут обучения по лёгочной гипертензии с баллами НМО",
  ],
  oncology: [
    "Какие новые публикации по иммунотерапии рака лёгкого",
    "Собери обзор по поддерживающей терапии",
  ],
};

const PLACEHOLDERS: Record<string, string> = {
  auto: "Например: найди события по ХСН в Москве и онлайн и добавь в календарь",
  research: "Например: какие данные о ПОАК при ФП и промежуточном риске инсульта",
  materials: "Например: что в моих материалах про SCORE2",
};

const ACCEPT = ".txt,.md,.csv,.html,.htm,.docx,.pdf,text/plain,text/markdown,text/csv,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function AgentComposer({ specialty, defaultAgent = "auto", compact = false, initialText = "" }: { specialty: SpecialtyId; defaultAgent?: AgentId | "auto"; compact?: boolean; initialText?: string }) {
  const router = useRouter();
  const { command, upload, notify, setPendingAction } = useWorkspace();
  const [text, setText] = useState(initialText.slice(0, 2000));
  const [agent, setAgent] = useState<AgentId | "auto">(defaultAgent);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const routed = useMemo(() => text.trim().length >= 3 ? routeIntent(text, specialty, { preferred: agent === "auto" ? null : agent, hasAttachment: Boolean(file) }) : null, [agent, file, specialty, text]);
  const target: AgentId | null = routed?.agentId ?? (agent === "auto" ? (file ? "materials" : null) : agent);
  const blocked = Boolean(routed?.risk.imageInterpretation || routed?.risk.emergency);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = text.trim();
    if (value.length < 2 || busy || blocked) return;
    setBusy(true);
    let materialId: string | undefined;
    if (file) {
      const form = new FormData();
      form.set("file", file);
      const uploaded = await upload(form);
      if (!uploaded) { setBusy(false); return; }
      materialId = uploaded.material.id;
      setFile(null);
    }
    const result = await command({ action: "runTask", text: value, agentId: file ? "materials" : agent, ...(materialId ? { materialId } : {}) }, { refresh: false });
    setBusy(false);
    if (!result?.agentId || !result.runId) return;
    setText("");
    const pending = result.actions?.find(action => action.status === "pending_confirmation");
    if (pending) setPendingAction(pending);
    if (result.actions && result.actions.length > 1) notify(`Подготовлено действий: ${result.actions.length}. Каждое выполнится только после вашего подтверждения.`);
    router.push(`${agentHref(specialty, result.agentId)}?run=${encodeURIComponent(result.runId)}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
  }

  return <form className={compact ? "ws-composer is-compact" : "ws-composer"} onSubmit={event => void submit(event)} aria-label="Поручить задачу агенту">
    <div className="ws-composer-box">
      <label className="sr-only" htmlFor="ws-composer-input">Что хотите делегировать?</label>
      <textarea id="ws-composer-input" value={text} onChange={event => setText(event.target.value)} onKeyDown={onKeyDown} rows={compact ? 2 : 3} maxLength={1200} placeholder={PLACEHOLDERS[defaultAgent] ?? PLACEHOLDERS.auto} />
      {file && <div className="ws-attachment"><Paperclip size={14} aria-hidden="true" /><span>{file.name}</span><button type="button" aria-label="Убрать файл" onClick={() => setFile(null)}><X size={14} /></button></div>}
      <div className="ws-composer-bar">
        <div className="ws-composer-tools">
          <button type="button" className="ws-composer-tool" onClick={() => fileInput.current?.click()} aria-label="Прикрепить файл"><Paperclip size={17} aria-hidden="true" /><span>Файл</span></button>
          <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={event => { const next = event.target.files?.[0] ?? null; event.target.value = ""; setFile(next); }} />
          <label className="ws-composer-agent">
            <span className="sr-only">Агент</span>
            <select value={agent} onChange={event => setAgent(event.target.value as AgentId | "auto")}>
              <option value="auto">Выбрать агента</option>
              {AGENT_ORDER.map(id => <option key={id} value={id}>{AGENT_DEFINITIONS[id].name}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <HelpTip label="Выбрать агента">Если агента не выбрать, задачу возьмёт подходящий по смыслу запроса. Его название появится под полем до запуска.</HelpTip>
        </div>
        <button type="submit" className="ws-composer-run" disabled={busy || blocked || text.trim().length < 2} aria-label={busy ? "Агент работает" : "Запустить"} title={busy ? "Агент работает" : "Запустить"}>
          {busy ? <Loader2 size={18} className="ws-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
    <div className="ws-composer-preview" aria-live="polite">
      {target && !blocked && <span className="ws-route"><AgentIcon icon={AGENT_DEFINITIONS[target].icon} size={14} />Возьмётся агент «{AGENT_DEFINITIONS[target].name}»{routed && routed.topics.length ? " · учтём темы из запроса" : ""}{routed?.wantsCalendar ? " · календарь — после подтверждения" : ""}</span>}
      {routed?.risk.imageInterpretation && <span className="ws-risk is-blocking"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.imageInterpretation}</span>}
      {routed?.risk.emergency && <span className="ws-risk is-blocking"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.emergency}</span>}
      {routed?.risk.prescribing && <span className="ws-risk"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.prescribing}</span>}
      {routed?.risk.patientSpecific && <span className="ws-risk"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.patientSpecific}</span>}
    </div>
    {!compact && !text && <div className="ws-examples" aria-label="Примеры задач">{EXAMPLES[specialty].map(example => <button type="button" key={example} onClick={() => setText(example)}>{example}</button>)}</div>}
  </form>;
}
