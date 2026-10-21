"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, ShieldAlert, X } from "lucide-react";
import { RISK_COPY } from "@/lib/agents/risk-rules";
import type { SpecialtyId } from "@/lib/domain/types";
import { JOBS, type PortalJob } from "@/lib/portal/jobs";
import { routePortalIntent } from "@/lib/portal/router";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { JobIcon } from "./job-icon";

const WAITING: Record<PortalJob, string> = {
  answer: "Ищем обзоры и рекомендации, читаем их выводы…",
  drug: "Открываем инструкцию и проверяем сигналы безопасности…",
  guidelines: "Ищем рекомендации и сравниваем версии…",
  research: "Ищем исследования и проверяем источники…",
  events: "Ищем события и сверяем даты…",
  learning: "Подбираем следующий шаг…",
  updates: "Смотрим, что нового…",
  materials: "Ищем в ваших материалах…",
};

/**
 * The portal's one primary entry. Deterministic routing is previewed in plain
 * language before submit; the physician never chooses an agent.
 */
export function PortalInput({ specialty, job = null, examples = [], label = "Что хотите узнать или сделать?", placeholder, followup = false, autoFocus = false, initialText = "", inputId = "pt-input" }: {
  specialty: SpecialtyId;
  inputId?: string;
  job?: PortalJob | null;
  examples?: readonly string[];
  label?: string;
  placeholder?: string;
  followup?: boolean;
  autoFocus?: boolean;
  initialText?: string;
}) {
  const router = useRouter();
  const { command, notify, setPendingAction } = useWorkspace();
  const [text, setText] = useState(initialText.slice(0, 1200));
  const [lockedJob, setLockedJob] = useState<PortalJob | null>(job);
  const [busy, setBusy] = useState(false);

  const route = useMemo(() => text.trim().length >= 3 ? routePortalIntent(text, specialty, { job: lockedJob }) : null, [lockedJob, specialty, text]);
  const blocked = Boolean(route?.risk.imageInterpretation || route?.risk.emergency);
  const target = route?.job ?? lockedJob;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = text.trim();
    if (value.length < 2 || busy || blocked) return;
    setBusy(true);
    const result = await command({ action: "ask", text: value, ...(lockedJob ? { job: lockedJob } : {}), ...(followup ? { followup: true } : {}) }, { refresh: false });
    if (!result?.runId) { setBusy(false); return; }
    const pending = result.actions?.find(action => action.status === "pending_confirmation");
    if (pending) setPendingAction(pending);
    if (result.actions && result.actions.length > 1) notify(`Подготовлено действий: ${result.actions.length}. Каждое выполнится только после вашего подтверждения.`);
    router.push(result.redirect ?? `/${specialty}/ask?run=${encodeURIComponent(result.runId)}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); }
  }

  return <form className="ws-composer pt-input" onSubmit={event => void submit(event)} aria-label={label} aria-busy={busy}>
    <div className="ws-composer-box">
      <label className="pt-input-label" htmlFor={inputId}>{label}</label>
      <textarea id={inputId} value={text} onChange={event => setText(event.target.value)} onKeyDown={onKeyDown} rows={2} maxLength={1200} autoFocus={autoFocus} placeholder={placeholder ?? (lockedJob ? JOBS[lockedJob].placeholder : "Препарат, рекомендация, диагноз, событие, тема")} />
      <div className="ws-composer-bar">
        <div className="ws-composer-tools">
          {lockedJob && <span className="pt-job-chip"><JobIcon icon={JOBS[lockedJob].icon} size={14} />{JOBS[lockedJob].label}<button type="button" aria-label="Снять выбор задачи" onClick={() => setLockedJob(null)}><X size={14} /></button></span>}
        </div>
        <button type="submit" className="ws-composer-run" disabled={busy || blocked || text.trim().length < 2} aria-label={busy ? "Ищем" : "Найти"} title={busy ? "Ищем" : "Найти"}>
          {busy ? <Loader2 size={18} className="ws-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
    <div className="ws-composer-preview" aria-live="polite">
      {busy && target && <span className="ws-route" role="status"><Loader2 size={14} className="ws-spin" aria-hidden="true" />{WAITING[target]}</span>}
      {!busy && route && !blocked && <span className="ws-route"><JobIcon icon={JOBS[route.job].icon} size={14} />Покажем {JOBS[route.job].preview}{route.drugs.length && (route.job === "drug" || route.job === "answer") ? ` · ${route.drugs.map(drug => drug.ru).join(", ")}` : ""}{route.wantsCalendar ? " · календарь — после подтверждения" : ""}</span>}
      {route?.risk.imageInterpretation && <span className="ws-risk is-blocking"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.imageInterpretation}</span>}
      {route?.risk.emergency && <span className="ws-risk is-blocking"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.emergency}</span>}
      {route?.risk.prescribing && <span className="ws-risk"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.prescribing}</span>}
      {route?.risk.patientSpecific && <span className="ws-risk"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.patientSpecific}</span>}
    </div>
    {!text && examples.length > 0 && <div className="ws-examples" aria-label="Примеры запросов">{examples.map(example => <button type="button" key={example} onClick={() => setText(example)}>{example}</button>)}</div>}
  </form>;
}
