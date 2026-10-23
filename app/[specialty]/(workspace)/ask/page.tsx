import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatRelativeRu } from "@/lib/agents/format";
import { withNewFlags } from "@/lib/agents/profile";
import type { ActionRequest, AgentResult, AgentRun, ConnectorDescriptor } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { researchModeLabel, researchOptionsForAnswerMode } from "@/lib/agents/research-options";
import { askHref, isPortalJob, JOBS, jobForRun, researchScenarioHref, type PortalJob } from "@/lib/portal/jobs";
import { runOutcome } from "@/lib/portal/run-outcome";
import { getSpecialty, isSpecialty } from "@/lib/specialty";
import { JobIcon } from "@/components/portal/job-icon";
import { ExperienceView } from "@/components/experience/experience-view";
import { JobResult } from "@/components/portal/job-results";
import { PortalInput } from "@/components/portal/portal-input";
import { FollowupJobButton } from "@/components/portal/result-actions";
import { RetryRun, RunProgress } from "@/components/portal/run-progress";
import { PendingActions } from "@/components/workspace/pending-actions";
import { RunTrace } from "@/components/workspace/run-trace";
import { connectorRegistry } from "@/server/agents/connectors";
import { pageSession } from "@/server/agents/page-session";
import { listResearchJobs } from "@/server/agents/research-jobs";
import { workspaceStore } from "@/server/agents/store";
import { AGENT_CONNECTORS, loadProfile } from "@/server/agents/workspace";
import { recordResultRendered } from "@/server/portal/manager";
import { isFinished, lookupRun, runPhase, type RunAvailability } from "@/server/portal/run-state";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const JOB_EXAMPLES: Partial<Record<PortalJob, Partial<Record<SpecialtyId, string[]>>>> = {
  drug: { therapy: ["Аторвастатин", "Омепразол: взаимодействия"], pediatrics: ["Амоксициллин у детей", "Ибупрофен: дозирование"], obgyn: ["Прогестерон", "Летрозол"], cardiology: ["Апиксабан", "Дапаглифлозин"], neurology: ["Леветирацетам", "Эренумаб"], endocrinology: ["Семаглутид", "Левотироксин"], oncology: ["Летрозол"] },
  guidelines: { therapy: ["ХОБЛ", "Внебольничная пневмония"], pediatrics: ["Бронхиолит", "Острый средний отит"], obgyn: ["Гестационный сахарный диабет", "Преэклампсия"], cardiology: ["Сердечная недостаточность", "Фибрилляция предсердий"], neurology: ["Мигрень", "Рассеянный склероз"], endocrinology: ["Гипотиреоз", "Остеопороз"] },
  research: { therapy: ["Короткие курсы антибиотиков при пневмонии"], pediatrics: ["Пробиотики при остром гастроэнтерите у детей"], obgyn: ["Аспирин для профилактики преэклампсии"], cardiology: ["ПОАК у пожилых с фибрилляцией предсердий"], neurology: ["Антитела к CGRP при хронической мигрени"], endocrinology: ["ГПП-1 при ожирении у подростков"] },
  events: { cardiology: ["Конгрессы в ноябре", "Онлайн-мероприятия"] },
};

/** Jobs that can start without a question: they use the specialty and real stored signals. */
const QUICK_START: Partial<Record<PortalJob, { label: string; text: string }>> = {
  learning: { label: "Подобрать по моим вопросам", text: "Следующий шаг в обучении" },
  updates: { label: "Показать новое по специальности", text: "Что нового по специальности" },
  events: { label: "Ближайшие события по специальности", text: "Ближайшие события" },
};

const recorded = new Set<string>();

/** Only what storage proves: another session is named only when the run exists there. */
const UNAVAILABLE_COPY: Record<Exclude<RunAvailability, "available">, string> = {
  run_not_found: "Результат по этой ссылке не найден: ссылка неполная или результат больше не хранится. Задайте вопрос ещё раз.",
  session_mismatch: "Этот результат сохранён в другой сессии браузера, поэтому здесь его не показать. Задайте вопрос ещё раз — ответ сохранится в этой сессии.",
};

export default async function AskPage({ params, searchParams }: { params: Promise<{ specialty: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  const query = await searchParams;
  const adapter = getSpecialty(specialty);
  const sessionId = await pageSession(specialty);
  const runId = first(query.run);
  const requestedJob = first(query.job);

  let run: AgentRun | null = null;
  let results: AgentResult[] = [];
  let actions: ActionRequest[] = [];
  const lookup = runId ? await lookupRun(sessionId, specialty, runId) : null;
  if (sessionId && lookup?.run) {
    const store = workspaceStore();
    run = lookup.run;
    if (run.resultIds.length) {
      const ids = new Set(run.resultIds);
      results = (await store.listResults(sessionId, specialty, run.agentId)).filter(result => ids.has(result.id) && !result.dismissed);
      actions = (await store.listActions(sessionId, specialty)).filter(action => action.status === "pending_confirmation" && action.resultIds.some(id => ids.has(id)));
    }
  }

  if (!run && requestedJob === "research" && !lookup) redirect(researchScenarioHref(specialty, first(query.q)));

  if (!run) {
    const job: PortalJob | null = isPortalJob(requestedJob) ? requestedJob : null;
    const definition = job ? JOBS[job] : null;
    const quick = job ? QUICK_START[job] : undefined;
    const defaults = await loadProfile(sessionId, specialty);
    return <div className="ws-page pt-ask">
      <Link className="ws-back" href={`/${specialty}`}><ArrowLeft size={15} aria-hidden="true" />Главное</Link>
      <header className="pt-ask-head">
        {definition && <span className="pt-shortcut-icon"><JobIcon icon={definition.icon} size={20} /></span>}
        <div>
          <h1>{definition?.label ?? "Новый вопрос"}</h1>
          <p className="pt-lead">{definition?.promise ?? "Спросите своими словами: препарат, рекомендация, диагноз, событие или тема."}</p>
        </div>
      </header>
      {lookup && lookup.availability !== "available" && <p className="ws-empty" role="status" data-run-unavailable={lookup.availability}>{UNAVAILABLE_COPY[lookup.availability]}</p>}
      <PortalInput specialty={specialty} job={job} autoFocus examples={job ? JOB_EXAMPLES[job]?.[specialty] ?? [] : []} label={definition ? "Ваш запрос" : "Что хотите узнать или сделать?"} answerMode={defaults.answerMode} />
      {quick && <div className="pt-card-actions"><FollowupJobButton text={quick.text} job={job as PortalJob} label={quick.label} primary /></div>}
    </div>;
  }

  const job = jobForRun(run);
  const phase = runPhase(run);
  const finished = isFinished(run);
  const profile = await loadProfile(sessionId, specialty);
  // A review started from the scenario page is shown in the mode it was asked in.
  const researchMode = job === "research" && sessionId ? (await listResearchJobs(sessionId, specialty, 40)).find(item => item.runId === run.id)?.options.mode ?? null : null;
  const views = withNewFlags(results, profile).map(result => ({ ...result, newSinceLastSeen: false }));
  const organic = views.filter(result => !result.partner);
  const partner = views.filter(result => result.partner);
  const key = `${sessionId}:${run.id}`;
  // Utility and activation are measured on the finished result, once.
  if (sessionId && finished && !recorded.has(key)) {
    recorded.add(key);
    if (recorded.size > 5000) recorded.clear();
    await recordResultRendered(sessionId, specialty, run, organic);
  }
  const registry = connectorRegistry();
  const connectors = AGENT_CONNECTORS[run.agentId].map(id => registry.find(connector => connector.id === id)).filter((value): value is ConnectorDescriptor => Boolean(value));
  const now = new Date().toISOString();
  const showExperience = Boolean(run.experience) && run.status !== "blocked" && run.status !== "failed";
  const retryJob = run.input.explicitJob ? job : null;
  const outcome = finished ? runOutcome(run) : null;

  // Every child keeps its position across lifecycle states (conditional slots, never reordering),
  // so refreshing the interior never remounts the shell or the follow-up input.
  return <div className="ws-page pt-ask" data-job={job} data-run-state={finished ? "done" : phase} data-answer-mode={run.input.answerMode ?? undefined}>
    {/* Back to where the search was started: the material it came from, else the home page. */}
    {run.input.origin
      ? <Link className="ws-back" href={run.input.origin.href} data-origin="material"><ArrowLeft size={15} aria-hidden="true" />{`К материалу «${run.input.origin.label.length > 60 ? `${run.input.origin.label.slice(0, 57)}…` : run.input.origin.label}»`}</Link>
      : <Link className="ws-back" href={`/${specialty}`}><ArrowLeft size={15} aria-hidden="true" />Главное</Link>}
    <header className="pt-ask-head">
      <span className="pt-shortcut-icon"><JobIcon icon={JOBS[job].icon} size={20} /></span>
      <div>
        <h1>{JOBS[job].label}</h1>
        {run.input.continuation
          ? <>
            <p className="pt-question">Уточнение: «{run.input.continuation.followup}»</p>
            <p className="ws-muted pt-continues" data-continues={run.input.continuation.runId}>
              Продолжение вопроса <Link className="ws-text-link" href={askHref(specialty, { run: run.input.continuation.rootRunId ?? run.input.continuation.runId })}>«{run.input.continuation.question}»</Link>
              {run.input.continuation.steps?.length ? <> после уточнений {run.input.continuation.steps.map(step => `«${step}»`).join(", ")} (<Link className="ws-text-link" href={askHref(specialty, { run: run.input.continuation.runId })}>предыдущий шаг</Link>)</> : null}
              {run.input.continuation.replaced ? ` — искали с его условиями, кроме популяции: ${run.input.continuation.replaced}.` : " — искали с его условиями."} Что вошло в поиск — в «Искали по» ниже.
            </p>
          </>
          : run.input.text && <p className="pt-question">Запрос: «{run.input.text}»</p>}
        {/* The depth was not chosen before the question, so it is not shown as a choice; the research scenario names what it gets. */}
        <p className="ws-muted">{adapter.name} · {formatRelativeRu(run.completedAt ?? run.startedAt)}{run.input.answerMode && job === "research" && <> · <span className="pt-mode-chip" data-answer-mode={run.input.answerMode}>{`Что получить: ${researchModeLabel(researchOptionsForAnswerMode(run.input.answerMode).mode)}`}</span></>}</p>
      </div>
    </header>

    {/* Nothing found, nothing searched or a silent source: said first, in words, never as «Готово». */}
    {outcome && outcome.kind !== "found" && outcome.kind !== "blocked" && phase !== "expired" && <div className="pt-outcome" role="status" data-outcome={outcome.kind}>
      <span className="ws-run-status" data-tone={outcome.tone}>{outcome.label}</span>
      {outcome.note && <p>{outcome.note}</p>}
      {(outcome.kind === "partial" || outcome.kind === "source_error") && outcome.retryable && run.input.text && (run.input.continuation
        // A repeated follow-up is typed again under its previous step, so it stays a continuation (never the joined text).
        ? <RetryRun text={run.input.continuation.followup} job={retryJob} contextRunId={run.input.continuation.runId} />
        : <RetryRun text={run.input.text} job={retryJob} />)}
    </div>}

    {!finished
      ? <RunProgress runId={run.id} specialty={specialty} version={run.progress?.manifestVersion ?? 0} phase={phase} pending={run.progress?.pending ?? []} startedAt={run.startedAt} />
      : null}

    <div className="pt-result">
      {phase === "expired" && <div role="alert">
        <p className="ws-empty">{run.experience ? "Проверка источников прервалась: показано то, что успели проверить и подтвердить." : "Поиск прервался и не завершился. Запустите его ещё раз."}</p>
        {run.input.text && <RetryRun text={run.input.text} job={retryJob} />}
      </div>}
      {showExperience
        ? <ExperienceView run={run} experience={run.experience!} results={views} />
        : finished && phase !== "expired" ? <JobResult job={job} run={run} results={organic} partner={partner} specialty={specialty} adapter={adapter} researchMode={researchMode} /> : null}
      {phase === "failed" && run.input.text && <RetryRun text={run.input.text} job={retryJob} />}
    </div>

    {finished && actions.length ? <PendingActions actions={actions} /> : null}

    {finished && phase !== "expired" && run.plan.length
      ? <details className="ws-trace-disclosure">
        <summary>Как искали и что было доступно</summary>
        <RunTrace run={run} connectors={connectors} now={now} showSynthesis={false} showConnectors={!run.experience} />
      </details>
      : null}

    <section className="ws-section" aria-labelledby="pt-followup-title">
      <h2 id="pt-followup-title" className="pt-subtitle">Уточнить или спросить другое</h2>
      <PortalInput specialty={specialty} followup inputId="pt-followup-input" label="Уточнение или новый вопрос" placeholder="Уточните условие (например: а у пожилых?) или задайте новый вопрос" contextRunId={finished && run.status !== "blocked" ? run.id : undefined} />
    </section>
  </div>;
}
