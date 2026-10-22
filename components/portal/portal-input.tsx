"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, Mic, ShieldAlert, X } from "lucide-react";
import { RISK_COPY } from "@/lib/agents/risk-rules";
import type { SpecialtyId } from "@/lib/domain/types";
import type { ClarificationManifest, ClarificationOption, PlanPreview } from "@/lib/mesh/skills/types";
import { DEFAULT_ANSWER_MODE, type AnswerMode } from "@/lib/portal/answer-mode";
import { JOBS, type PortalJob } from "@/lib/portal/jobs";
import { routePortalIntent } from "@/lib/portal/router";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { AnswerModeControl } from "./answer-mode-control";
import { JobIcon } from "./job-icon";
import { Suggestions } from "./suggestions";

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

export type ComposerState = "idle" | "focused" | "typing" | "submitting" | "disabled" | "error";

type SpeechRecognitionLike = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

/**
 * The portal's one primary entry: a single input on its own surface, the
 * answer mode under it, then prompt suggestions. Deterministic routing is
 * previewed in plain language before submit; the physician never chooses an
 * agent. The mode travels with the request into run metadata.
 */
export function PortalInput({ specialty, job = null, examples = [], suggestions = [], label = "Что хотите узнать или сделать?", placeholder, followup = false, autoFocus = false, initialText = "", inputId = "pt-input", contextRunId, answerMode = DEFAULT_ANSWER_MODE, showModes = false, forcedState = null }: {
  specialty: SpecialtyId;
  inputId?: string;
  job?: PortalJob | null;
  /** Job-page examples: shown in the same suggestion row. */
  examples?: readonly string[];
  /** Home suggestions: whole queries, never modes. */
  suggestions?: readonly string[];
  label?: string;
  placeholder?: string;
  followup?: boolean;
  autoFocus?: boolean;
  initialText?: string;
  /** The open result this follow-up refines first (result as context). */
  contextRunId?: string;
  /** Default depth for this request (the profile's default). */
  answerMode?: AnswerMode;
  /** Show the three-mode control under the input (home and job pages, not follow-ups). */
  showModes?: boolean;
  /** Visual-audit only: render one state without interaction. */
  forcedState?: ComposerState | null;
}) {
  const router = useRouter();
  const { command, notify, setPendingAction } = useWorkspace();
  const [text, setText] = useState(initialText.slice(0, 1200));
  const [lockedJob, setLockedJob] = useState<PortalJob | null>(job);
  const [mode, setMode] = useState<AnswerMode>(answerMode);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  // Dictation uses the browser's own speech recognition; the button exists only where it does (false on the server).
  const dictation = useSyncExternalStore(() => () => undefined, () => { const speech = window as SpeechWindow; return Boolean(speech.SpeechRecognition ?? speech.webkitSpeechRecognition); }, () => false);
  // Busy only until the result page is on screen; the run itself continues there with durable status.
  const [navigating, startNavigation] = useTransition();
  const busy = submitting || navigating;
  // One clarification at most: an answered (or bypassed by own words) question is never asked again for this text.
  const [clarification, setClarification] = useState<ClarificationManifest | null>(null);
  const [plan, setPlan] = useState<PlanPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  const route = useMemo(() => text.trim().length >= 3 ? routePortalIntent(text, specialty, { job: lockedJob }) : null, [lockedJob, specialty, text]);
  const blocked = Boolean(route?.risk.imageInterpretation || route?.risk.emergency);
  const target = route?.job ?? lockedJob;
  const state: ComposerState = forcedState ?? (blocked ? "disabled" : busy ? "submitting" : failed ? "error" : focused && text.trim() ? "typing" : focused ? "focused" : "idle");

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
      ...(showModes ? { answerMode: mode } : {}),
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

  function pick(value: string) {
    setText(value);
    setFailed(false);
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(value.length, value.length); });
  }

  function toggleDictation() {
    if (listening) { recognition.current?.stop(); return; }
    const speech = window as SpeechWindow;
    const Recognition = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!Recognition) return;
    const instance = new Recognition();
    instance.lang = "ru-RU";
    instance.interimResults = false;
    instance.maxAlternatives = 1;
    instance.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0]?.transcript ?? "").join(" ").trim();
      if (transcript) setText(current => `${current ? `${current} ` : ""}${transcript}`.slice(0, 1200));
    };
    instance.onend = () => setListening(false);
    instance.onerror = () => setListening(false);
    recognition.current = instance;
    setListening(true);
    instance.start();
  }

  const disabledSubmit = state === "submitting" || state === "disabled" || text.trim().length < 2;
  const rowSuggestions = [...suggestions, ...examples];

  return <form className="pt-composer pt-input" data-state={state} onSubmit={event => void submit(event)} aria-label={label} aria-busy={busy}>
    <div className="pt-composer-surface">
      <label className="pt-composer-label" htmlFor={inputId}>{label}</label>
      <textarea ref={textarea} id={inputId} value={text} onChange={event => { setText(event.target.value); setFailed(false); }} onKeyDown={onKeyDown} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} rows={2} maxLength={1200} autoFocus={autoFocus} placeholder={placeholder ?? (lockedJob ? JOBS[lockedJob].placeholder : "Препарат, рекомендация, диагноз, событие, тема")} />
      <div className="pt-composer-bar">
        <div className="pt-composer-tools">
          {lockedJob && <span className="pt-job-chip"><JobIcon icon={JOBS[lockedJob].icon} size={14} />{JOBS[lockedJob].label}<button type="button" aria-label="Снять выбор задачи" onClick={() => setLockedJob(null)}><X size={14} /></button></span>}
        </div>
        <div className="pt-composer-actions">
          {dictation && <button type="button" className={listening ? "pt-composer-mic is-listening" : "pt-composer-mic"} aria-pressed={listening} aria-label={listening ? "Остановить диктовку" : "Надиктовать вопрос"} title={listening ? "Остановить диктовку" : "Надиктовать вопрос"} onClick={toggleDictation}><Mic size={18} aria-hidden="true" /></button>}
          <button type="submit" className="ws-composer-run" disabled={disabledSubmit} aria-label={busy ? "Ищем" : "Найти"} title={busy ? "Ищем" : "Найти"}>
            {state === "submitting" ? <Loader2 size={18} className="ws-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
          </button>
        </div>
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
    {showModes && <AnswerModeControl value={mode} onChange={setMode} disabled={state === "submitting"} />}
    <Suggestions items={rowSuggestions} onPick={pick} />
  </form>;
}
