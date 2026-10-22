"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, ShieldAlert, X } from "lucide-react";
import { RISK_COPY } from "@/lib/agents/risk-rules";
import type { SpecialtyId } from "@/lib/domain/types";
import type { ClarificationManifest, ClarificationOption, PlanPreview } from "@/lib/mesh/skills/types";
import { JOBS, type PortalJob } from "@/lib/portal/jobs";
import { routePortalIntent } from "@/lib/portal/router";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { JobIcon } from "./job-icon";

/** Run creation answers in well under a second; this bound only catches a server that cannot start the work. */
const ASK_TIMEOUT_MS = 20_000;

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
export function PortalInput({ specialty, job = null, examples = [], label = "Что хотите узнать или сделать?", placeholder, followup = false, autoFocus = false, initialText = "", inputId = "pt-input", contextRunId }: {
  specialty: SpecialtyId;
  inputId?: string;
  job?: PortalJob | null;
  examples?: readonly string[];
  label?: string;
  placeholder?: string;
  followup?: boolean;
  autoFocus?: boolean;
  initialText?: string;
  /** The open result this follow-up refines first (result as context). */
  contextRunId?: string;
}) {
  const router = useRouter();
  const { command, notify, setPendingAction } = useWorkspace();
  const [text, setText] = useState(initialText.slice(0, 1200));
  const [lockedJob, setLockedJob] = useState<PortalJob | null>(job);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  // Busy only until the result page is on screen; the run itself continues there with durable status.
  const [navigating, startNavigation] = useTransition();
  const busy = submitting || navigating;
  // One clarification at most: an answered (or bypassed by own words) question is never asked again for this text.
  const [clarification, setClarification] = useState<ClarificationManifest | null>(null);
  const [plan, setPlan] = useState<PlanPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const route = useMemo(() => text.trim().length >= 3 ? routePortalIntent(text, specialty, { job: lockedJob }) : null, [lockedJob, specialty, text]);
  const blocked = Boolean(route?.risk.imageInterpretation || route?.risk.emergency);
  const target = route?.job ?? lockedJob;

  async function submit(event?: FormEvent, override: { text?: string; optionId?: string | null; planConfirmed?: string } = {}) {
    event?.preventDefault();
    const value = (override.text ?? text).trim();
    if (value.length < 2 || busy || blocked) return;
    setSubmitting(true);
    setFailed(false);
    setMessage(null);
    const answered = clarification ? { id: clarification.id, optionId: override.optionId ?? null } : null;
    // Creating the run is quick (it is only stored); the sources are checked on the result page.
    // Quiet: a failure to start is shown inline with «Повторить», not duplicated in a toast.
    const result = await command({
      action: "ask", text: value,
      ...(lockedJob ? { job: lockedJob } : {}),
      ...(followup ? { followup: true } : {}),
      ...(contextRunId ? { contextRunId } : {}),
      ...(answered ? { clarification: answered } : {}),
      ...(override.planConfirmed ? { planConfirmed: override.planConfirmed } : {}),
    }, { refresh: false, quiet: true, timeoutMs: ASK_TIMEOUT_MS });
    setSubmitting(false);
    if (result?.clarification) { setClarification(result.clarification); setPlan(null); return; }
    if (result?.plan) { setPlan(result.plan); setClarification(null); return; }
    setClarification(null);
    setPlan(null);
    if (result?.refined) {
      // The open result is patched in place: same page, same modules, only what the refinement affects changes.
      if (result.refined.message) setMessage(result.refined.message);
      if (result.refined.applied) { setText(""); startNavigation(() => router.refresh()); }
      return;
    }
    if (!result?.runId) { setFailed(true); return; }
    const pending = result.actions?.find(action => action.status === "pending_confirmation");
    if (pending) setPendingAction(pending);
    if (result.actions && result.actions.length > 1) notify(`Подготовлено действий: ${result.actions.length}. Каждое выполнится только после вашего подтверждения.`);
    if (followup) setText("");
    startNavigation(() => router.push(result.redirect ?? `/${specialty}/ask?run=${encodeURIComponent(result.runId!)}`));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); }
  }

  function choose(option: ClarificationOption) {
    const completed = option.effect.completeText ?? text;
    if (option.effect.edit) {
      // The physician finishes the sentence; the question stays answered when it is submitted.
      setText(completed);
      requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(completed.length, completed.length); });
      return;
    }
    setText(completed);
    void submit(undefined, { text: completed, optionId: option.id });
  }

  return <form className="ws-composer pt-input" onSubmit={event => void submit(event)} aria-label={label} aria-busy={busy}>
    <div className="ws-composer-box">
      <label className="pt-input-label" htmlFor={inputId}>{label}</label>
      <textarea ref={textarea} id={inputId} value={text} onChange={event => setText(event.target.value)} onKeyDown={onKeyDown} rows={2} maxLength={1200} autoFocus={autoFocus} placeholder={placeholder ?? (lockedJob ? JOBS[lockedJob].placeholder : "Препарат, рекомендация, диагноз, событие, тема")} />
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
      {failed && !busy && <span className="ws-risk is-blocking" role="alert">Не удалось запустить поиск<button type="button" className="ws-button pt-retry" onClick={() => void submit()}>Повторить</button></span>}
      {message && !busy && <span className="ws-route" role="status">{message}</span>}
      {!busy && route && !blocked && <span className="ws-route"><JobIcon icon={JOBS[route.job].icon} size={14} />Покажем {JOBS[route.job].preview}{route.drugs.length && (route.job === "drug" || route.job === "answer") ? ` · ${route.drugs.map(drug => drug.ru).join(", ")}` : ""}{route.wantsCalendar ? " · календарь — после подтверждения" : ""}</span>}
      {route?.risk.imageInterpretation && <span className="ws-risk is-blocking"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.imageInterpretation}</span>}
      {route?.risk.emergency && <span className="ws-risk is-blocking"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.emergency}</span>}
      {route?.risk.prescribing && <span className="ws-risk"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.prescribing}</span>}
      {route?.risk.patientSpecific && <span className="ws-risk"><ShieldAlert size={14} aria-hidden="true" />{RISK_COPY.patientSpecific}</span>}
    </div>
    {clarification && !busy && <div className="pt-clarify" role="group" aria-labelledby={`${inputId}-clarify`} data-clarification={clarification.reason}>
      <p id={`${inputId}-clarify`} className="pt-clarify-question">{clarification.question}</p>
      {clarification.options.length > 0 && <div className="ws-examples">{clarification.options.map(option => <button type="button" key={option.id} data-option={option.id} onClick={() => choose(option)}>{option.label}</button>)}</div>}
      <p className="ws-muted">{clarification.options.length ? "Или уточните своими словами и нажмите «Найти»." : "Напишите это в запросе и нажмите «Найти»."}</p>
    </div>}
    {plan && !busy && <div className="pt-plan" role="group" aria-labelledby={`${inputId}-plan`} data-plan={plan.reason}>
      <p id={`${inputId}-plan`} className="pt-clarify-question">{plan.title}:</p>
      <ol className="pt-plan-steps">{plan.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <div className="pt-card-actions"><button type="button" className="ws-button" onClick={() => void submit(undefined, { planConfirmed: plan.id })}>Продолжить</button></div>
    </div>}
    {!text && examples.length > 0 && <div className="ws-examples" aria-label="Примеры запросов">{examples.map(example => <button type="button" key={example} onClick={() => setText(example)}>{example}</button>)}</div>}
  </form>;
}
