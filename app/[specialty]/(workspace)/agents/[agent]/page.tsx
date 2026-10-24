import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock3 } from "lucide-react";
import { AgentConfigPanel } from "@/components/workspace/agent-config-panel";
import { AgentIcon } from "@/components/workspace/agent-icon";
import { AgentEnableButton, AgentRunButton } from "@/components/workspace/agent-run-button";
import { BulkActions } from "@/components/workspace/bulk-actions";
import { SeenMarker } from "@/components/workspace/lifecycle";
import { PendingActions } from "@/components/workspace/pending-actions";
import { ResearchComposer } from "@/components/workspace/research-composer";
import { ResearchJobStatus } from "@/components/workspace/research-job-status";
import { ResearchAnswerView, ResearchMore } from "@/components/workspace/research-answer";
import { researchModeLabel, researchOptionsForAnswerMode } from "@/lib/agents/research-options";
import { askHref } from "@/lib/portal/jobs";
import { ResultCard, ResultList } from "@/components/workspace/result-card";
import { RunTrace } from "@/components/workspace/run-trace";
import { agentIdFromSlug } from "@/lib/agents/definitions";
import { countLabel, DRUG_CHANGE_LABEL, formatRelativeRu } from "@/lib/agents/format";
import { isConfigured } from "@/lib/agents/profile";
import { SOURCE_OPTIONS } from "@/lib/agents/vocabulary";
import { DRUG_CHANGE_TYPES, type AgentResultView } from "@/lib/agents/types";
import { runOutcome } from "@/lib/portal/run-outcome";
import { isSpecialty } from "@/lib/specialty";
import { nbsp } from "@/lib/ui/typography";
import { filterPhysicianResearchResults, researchViewFromSearchParams } from "@/lib/ui/physician-research-view";
import { pageSession } from "@/server/agents/page-session";
import { getResearchJob } from "@/server/agents/research-jobs";
import { workspaceStore } from "@/server/agents/store";
import { getAgentDetail, MONITORING_AGENTS } from "@/server/agents/workspace";

export const dynamic = "force-dynamic";

/** The profile's names of journals set to «Не использовать» («The Lancet»), for the composer's note. */
function excludedJournalLabels(excluded: readonly string[]): string[] {
  return SOURCE_OPTIONS.filter(option => excluded.includes(option.id) && option.pubmedJournal).map(option => option.label);
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function DrugSinceLastVisit({ results, lastSeenAt, unchecked = [], firstCheck = false }: { results: AgentResultView[]; lastSeenAt: string | null; unchecked?: readonly string[]; firstCheck?: boolean }) {
  // The first check counts everything it found (opening the page before it ran is not a «previous view»);
  // afterwards only what is new since the last view, with the total said too.
  const first = firstCheck || !lastSeenAt;
  const fresh = first ? results : results.filter(result => result.newSinceLastSeen);
  return <section className="ws-since" aria-labelledby="ws-since-title">
    <h2 id="ws-since-title">{first ? "Первая проверка: изменения за выбранный период" : `С прошлого просмотра · ${formatRelativeRu(lastSeenAt!)}`}</h2>
    {!first && results.length > 0 && <p className="ws-muted" data-total={results.length}>{nbsp(`${fresh.length ? "Новое ниже" : "Новых изменений нет"} · всего в последней проверке: ${results.length}`)}</p>}
    <ul>{DRUG_CHANGE_TYPES.map(type => {
      // A category the check did not search (no topics) is «не проверялось», never a zero that reads as «изменений нет».
      if (unchecked.includes(type)) return <li key={type} data-unchecked="true"><strong>—</strong><span>{DRUG_CHANGE_LABEL[type].title} · не проверялось</span></li>;
      const count = fresh.filter(result => result.category === type).length;
      return <li key={type} className={count ? "has-items" : undefined}><strong>{count}</strong><span>{DRUG_CHANGE_LABEL[type].title}</span></li>;
    })}</ul>
    {unchecked.length > 0 && <p className="ws-muted">{nbsp("Исследования ищутся только по выбранным темам. Выберите темы — проверка запустится по ним.")}</p>}
  </section>;
}

export default async function AgentPage({ params, searchParams }: { params: Promise<{ specialty: string; agent: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { specialty, agent } = await params;
  if (!isSpecialty(specialty)) notFound();
  const agentId = agentIdFromSlug(agent);
  if (!agentId || agentId === "materials") notFound();
  const query = await searchParams;
  const requestedResearchView = researchViewFromSearchParams(query);
  const sessionId = await pageSession(specialty);
  const onDemand = agentId === "research";
  const requestedJobId = onDemand ? first(query.job) : undefined;
  const researchJob = onDemand && sessionId && requestedJobId ? await getResearchJob(sessionId, specialty, requestedJobId) : null;
  // One address per review: a finished review opens on the result page, where it can be refined and saved
  // («История» opens it there too). The scenario page is the question and its settings.
  const shownRunId = onDemand ? first(query.run) ?? researchJob?.runId ?? null : null;
  if (onDemand && shownRunId && /^run-[a-f0-9-]{36}$/u.test(shownRunId)) redirect(askHref(specialty, { run: shownRunId }));
  const detail = await getAgentDetail(sessionId, specialty, agentId, { runId: first(query.run) ?? researchJob?.runId ?? null });
  const { definition, card, results, partner, runs, profile } = detail;
  // The research scenario opens on an empty question unless a run is asked for: a shortcut never lands on an old answer.
  const requestedRun = Boolean(first(query.run) ?? researchJob?.runId);
  const selectedRun = onDemand && !requestedRun ? null : detail.selectedRun;
  // «Повторить с другими источниками»: the question comes from the stored run (`?from=`), never as text in the URL.
  const fromRunId = onDemand ? first(query.from) : undefined;
  const fromRun = fromRunId && sessionId && /^run-[a-f0-9-]{36}$/u.test(fromRunId) ? await workspaceStore().getRun(sessionId, fromRunId) : null;
  // A shown or repeated review keeps the «Что получить» it was asked in, unless the link names another.
  const runMode = (selectedRun ?? fromRun)?.input.answerMode;
  // Without a mode in the link, the review opens in the run's mode, else in the profile's default («Разбор исследований по умолчанию»).
  const defaultMode = runMode ?? profile.answerMode ?? null;
  const researchView = researchJob?.options ?? (onDemand && !first(query.mode) && defaultMode ? { ...requestedResearchView, mode: researchOptionsForAnswerMode(defaultMode).mode } : requestedResearchView);
  const modeFromProfile = onDemand && !first(query.mode) && !runMode && Boolean(profile.answerMode);
  const now = new Date().toISOString();
  const lastSeenAt = profile.subscriptions[agentId].lastSeenAt;
  const fresh = results.filter(result => result.newSinceLastSeen);
  const earlier = results.filter(result => !result.newSinceLastSeen);
  const researchResults = onDemand ? filterPhysicianResearchResults(results, researchView) : results;
  const tracksNew = MONITORING_AGENTS.includes(agentId);
  const pendingForAgent = detail.actions.filter(action => action.status === "pending_confirmation");
  const showResearchJob = Boolean(onDemand && researchJob && !researchJob.runId);
  const fromText = fromRun?.input.text ?? "";
  const initialQuestion = fromText || first(query.q) || "";
  const monitoringOutcome = !onDemand && selectedRun ? runOutcome(selectedRun, { monitoring: tracksNew }) : null;
  const firstCheck = !onDemand && runs.filter(run => run.trigger !== "composer").length <= 1;

  return <div className="ws-page ws-agent-page" data-agent={agentId}>
    {sessionId && <SeenMarker agentId={agentId} />}
    {/* «Повторить с другими источниками» came from a result: the way back is that result. */}
    {fromRun
      ? <Link className="ws-back" href={askHref(specialty, { run: fromRun.id })} data-back="result"><ArrowLeft size={15} aria-hidden="true" />К результату</Link>
      : <Link className="ws-back" href={`/${specialty}`}><ArrowLeft size={15} aria-hidden="true" />Главное</Link>}
    <header className="ws-agent-head">
      <span className="ws-agent-icon is-large"><AgentIcon icon={definition.icon} size={26} /></span>
      <div className="ws-agent-head-copy">
        <h1>{definition.name}</h1>
        {onDemand && selectedRun
          // With a result, the header names the question being answered; the description is on the empty scenario page.
          ? <>{selectedRun.input.text && <p className="pt-question">Запрос: «{selectedRun.input.text}»</p>}<p className="ws-agent-meta"><Clock3 size={13} aria-hidden="true" />{formatRelativeRu(selectedRun.completedAt ?? selectedRun.startedAt)}</p><p className="ws-muted"><span className="pt-mode-chip" data-answer-mode={selectedRun.input.answerMode ?? undefined}>{`Что получить: ${researchModeLabel(researchView.mode)}`}</span></p></>
          : showResearchJob && researchJob
            // A background review in progress: the header names its question, never «Ещё не запускалась».
            ? <p className="pt-question" data-job-question="true">Запрос: «{researchJob.question}»</p>
          : <>
            <p className="ws-agent-job">{definition.job}</p>
            {/* On the scenario page the question comes first; the long description is one click away. */}
            {onDemand ? <details className="ws-agent-about"><summary>Как это работает</summary><p className="ws-muted">{definition.description}</p></details> : <p className="ws-muted">{definition.description}</p>}
            {!onDemand && <p className="ws-agent-meta"><Clock3 size={13} aria-hidden="true" />{card.lastRunAt ? `Последний запуск ${formatRelativeRu(card.lastRunAt)}` : "Ещё не запускалась"} · {firstCheck && selectedRun && results.length ? `Первая проверка: ${countLabel(results.length, ["находка", "находки", "находок"])}` : card.headline}</p>}
          </>}
        {/* A switched-off check says so in its header, next to the one action that switches it on. */}
        {!onDemand && card.state === "disabled" && <p className="ws-agent-state" data-disabled="true"><span className="ws-state ws-state-disabled">Выключена</span>{nbsp(" Её находки не попадают в «Для вас».")}</p>}
      </div>
      {!onDemand && card.state !== "disabled" && <AgentRunButton agentId={agentId} />}
      {!onDemand && card.state === "disabled" && <AgentEnableButton agentId={agentId} />}
    </header>

    {/* Before a run the settings and the question come first; with a result, the answer comes first and a new review follows it. */}
    {onDemand && !selectedRun && !showResearchJob ? <section className="ws-agent-composer" aria-label="Новый разбор"><ResearchComposer specialty={specialty} initialText={initialQuestion} initialOptions={researchView} modeFromProfile={modeFromProfile} focusFilters={Boolean(fromRun)} pubmedExcluded={profile.interests.excludedSources.includes("pubmed")} excludedJournals={excludedJournalLabels(profile.interests.excludedSources)} /></section> : null}

    {/* The research scenario is configured in its composer (what to get, sources, type); topic settings do not change a typed question. */}
    {!onDemand && <AgentConfigPanel specialty={specialty} definition={definition} preference={profile.preferences[agentId]} inheritedTopics={profile.interests.topics} enabled={card.enabled} defaultOpen={!isConfigured(profile)} />}
    <PendingActions actions={pendingForAgent} />

    {/* Counts by change type mean «checked, nothing new» only when the check ran; otherwise the state is said in words. */}
    {!onDemand && selectedRun && monitoringOutcome && monitoringOutcome.kind !== "found" && monitoringOutcome.kind !== "not_found" && <div className="pt-outcome" role="status" data-outcome={monitoringOutcome.kind}>
      <span className="ws-run-status" data-tone={monitoringOutcome.tone}>{monitoringOutcome.label}</span>
      {monitoringOutcome.note && <p>{monitoringOutcome.note}</p>}
    </div>}
    {agentId === "drugs" && selectedRun && (monitoringOutcome?.kind === "found" || monitoringOutcome?.kind === "not_found") && <DrugSinceLastVisit results={results} lastSeenAt={lastSeenAt} firstCheck={firstCheck} unchecked={selectedRun.toolsUsed.some(tool => tool.tool === "searchPubmed" && /нет тем для поиска/iu.test(tool.note ?? "")) && !results.some(result => result.category === "IMPORTANT_NEW_STUDY") ? ["IMPORTANT_NEW_STUDY"] : []} />}

    <div className={`ws-agent-layout${onDemand ? " is-single" : ""}`}>
      <div className="ws-agent-results">
        {agentId === "events" && results.length > 0 && <BulkActions resultIds={results.map(result => result.id)} calendar />}
        {showResearchJob && researchJob ? <ResearchJobStatus job={researchJob} specialty={specialty} /> : !selectedRun ? (onDemand ? null : <p className="ws-empty">{card.state === "needs_setup" ? <>Выберите темы в профиле — проверка запустится по ним. <Link className="ws-text-link" href={`/${specialty}/settings#topics`}>Выбрать темы</Link></> : "Проверка ещё не запускалась. Нажмите «Запустить сейчас»."}</p>) : <>
          {onDemand && <ResearchAnswerView run={selectedRun} results={researchResults} mode={researchView.mode} />}
          {onDemand && <ResearchMore run={selectedRun} results={researchResults} specialty={specialty} mode={researchView.mode} />}

          {!tracksNew && agentId !== "research" && results.length > 0 && <section className="ws-section" aria-labelledby="ws-all-title">
            <h2 id="ws-all-title" className="ws-section-title">{agentId === "learning" ? `Маршрут · ${results.length}` : `Найдено · ${results.length}`}</h2>
            <ResultList results={results} specialty={specialty} emptyText="" />
          </section>}


          {/* The first check is one list «Найдено»: nothing was found «ранее». */}
          {tracksNew && firstCheck && results.length > 0 && <section className="ws-section" aria-labelledby="ws-fresh-title">
            <h2 id="ws-fresh-title" className="ws-section-title">{`Найдено · ${results.length}`}</h2>
            <ResultList results={results} specialty={specialty} emptyText="" />
          </section>}
          {tracksNew && !firstCheck && fresh.length > 0 && <section className="ws-section" aria-labelledby="ws-fresh-title">
            <h2 id="ws-fresh-title" className="ws-section-title">{lastSeenAt ? `Новое с прошлого просмотра · ${fresh.length}` : `Найдено · ${fresh.length}`}</h2>
            <ResultList results={fresh} specialty={specialty} emptyText="" />
          </section>}
          {tracksNew && !firstCheck && earlier.length > 0 && <section className="ws-section" aria-labelledby="ws-earlier-title">
            <h2 id="ws-earlier-title" className="ws-section-title">Ранее найдено · {earlier.length}</h2>
            <ResultList results={earlier} specialty={specialty} emptyText="" />
          </section>}
          {!onDemand && !results.length && monitoringOutcome?.kind === "not_found" && <p className="ws-empty">{tracksNew ? "Проверка выполнена: по выбранным темам за выбранный период изменений не найдено." : "Проверка выполнена: по текущим настройкам ничего не найдено. Попробуйте расширить темы или период."}</p>}
          {!onDemand && !results.length && selectedRun.status === "blocked" && <p className="ws-empty">Запрос остановлен проверкой безопасности — подробности справа.</p>}
          {partner.length > 0 && <section className="ws-section ws-partner-slot" aria-labelledby="ws-partner-title">
            <h2 id="ws-partner-title" className="ws-section-title">Партнёрский материал</h2>
            {partner.map(result => <ResultCard key={result.id} result={result} specialty={specialty} />)}
          </section>}
        </>}
      </div>
      <aside className="ws-agent-aside">
        {selectedRun && (onDemand ? <details className="ws-trace-disclosure"><summary>Как искали и что было доступно</summary><RunTrace run={selectedRun} connectors={detail.connectors} now={now} /></details> : <RunTrace run={selectedRun} connectors={detail.connectors} now={now} monitoring={tracksNew} />)}
        {/* Past reviews live in «История» with every other question: one list, one address per result. */}
        {onDemand && runs.length > 1 && <p className="ws-muted ws-history-link"><Link className="ws-text-link" href={`/${specialty}/history`}>Предыдущие вопросы — в «Истории»</Link></p>}
      </aside>
    </div>
    {onDemand && selectedRun ? <section className="ws-section ws-agent-composer" aria-labelledby="ws-research-new-title">
      <h2 id="ws-research-new-title" className="ws-section-title">Новый разбор</h2>
      <ResearchComposer specialty={specialty} initialText={initialQuestion} initialOptions={researchView} pubmedExcluded={profile.interests.excludedSources.includes("pubmed")} excludedJournals={excludedJournalLabels(profile.interests.excludedSources)} />
    </section> : null}
  </div>;
}
