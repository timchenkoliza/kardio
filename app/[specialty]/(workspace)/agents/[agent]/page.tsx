import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3 } from "lucide-react";
import { AgentConfigPanel } from "@/components/workspace/agent-config-panel";
import { AgentIcon } from "@/components/workspace/agent-icon";
import { AgentRunButton } from "@/components/workspace/agent-run-button";
import { BulkActions } from "@/components/workspace/bulk-actions";
import { SeenMarker } from "@/components/workspace/lifecycle";
import { PendingActions } from "@/components/workspace/pending-actions";
import { ResearchComposer } from "@/components/workspace/research-composer";
import { ResearchOverview, ResearchResultsTable } from "@/components/workspace/research-report";
import { ResultCard, ResultList } from "@/components/workspace/result-card";
import { RunTrace } from "@/components/workspace/run-trace";
import { agentIdFromSlug } from "@/lib/agents/definitions";
import { countLabel, DRUG_CHANGE_LABEL, formatRelativeRu } from "@/lib/agents/format";
import { isConfigured } from "@/lib/agents/profile";
import { DRUG_CHANGE_TYPES, type AgentResultView } from "@/lib/agents/types";
import { isSpecialty } from "@/lib/specialty";
import { filterPhysicianResearchResults, researchViewFromSearchParams, researchViewQuery } from "@/lib/ui/physician-research-view";
import { pageSession } from "@/server/agents/page-session";
import { getAgentDetail, MONITORING_AGENTS } from "@/server/agents/workspace";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function DrugSinceLastVisit({ results, lastSeenAt }: { results: AgentResultView[]; lastSeenAt: string | null }) {
  const fresh = results.filter(result => result.newSinceLastSeen);
  return <section className="ws-since" aria-labelledby="ws-since-title">
    <h2 id="ws-since-title">{lastSeenAt ? `С прошлого просмотра · ${formatRelativeRu(lastSeenAt)}` : "Первый просмотр: изменения за выбранный период"}</h2>
    <ul>{DRUG_CHANGE_TYPES.map(type => {
      const count = fresh.filter(result => result.category === type).length;
      return <li key={type} className={count ? "has-items" : undefined}><strong>{count}</strong><span>{DRUG_CHANGE_LABEL[type].title}</span></li>;
    })}</ul>
  </section>;
}

export default async function AgentPage({ params, searchParams }: { params: Promise<{ specialty: string; agent: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { specialty, agent } = await params;
  if (!isSpecialty(specialty)) notFound();
  const agentId = agentIdFromSlug(agent);
  if (!agentId || agentId === "materials") notFound();
  const query = await searchParams;
  const researchView = researchViewFromSearchParams(query);
  const sessionId = await pageSession(specialty);
  const detail = await getAgentDetail(sessionId, specialty, agentId, { runId: first(query.run) });
  const { definition, card, results, partner, selectedRun, runs, profile } = detail;
  const now = new Date().toISOString();
  const lastSeenAt = profile.subscriptions[agentId].lastSeenAt;
  const fresh = results.filter(result => result.newSinceLastSeen);
  const earlier = results.filter(result => !result.newSinceLastSeen);
  const onDemand = agentId === "research";
  const researchResults = onDemand ? filterPhysicianResearchResults(results, researchView) : results;
  const tracksNew = MONITORING_AGENTS.includes(agentId);
  const pendingForAgent = detail.actions.filter(action => action.status === "pending_confirmation");
  const researchQuery = researchViewQuery(researchView);

  return <div className="ws-page ws-agent-page" data-agent={agentId}>
    {sessionId && <SeenMarker agentId={agentId} />}
    <Link className="ws-back" href={`/${specialty}`}><ArrowLeft size={15} aria-hidden="true" />Главное</Link>
    <header className="ws-agent-head">
      <span className="ws-agent-icon is-large"><AgentIcon icon={definition.icon} size={26} /></span>
      <div className="ws-agent-head-copy">
        <h1>{definition.name}</h1>
        <p className="ws-agent-job">{definition.job}</p>
        <p className="ws-muted">{definition.description}</p>
        <p className="ws-agent-meta"><Clock3 size={13} aria-hidden="true" />{card.lastRunAt ? `Последний запуск ${formatRelativeRu(card.lastRunAt)}` : "Ещё не запускался"} · {card.headline}</p>
      </div>
      {!onDemand && card.state !== "disabled" && <AgentRunButton agentId={agentId} />}
    </header>

    {onDemand ? <section className="ws-agent-composer" aria-label="Новое исследование"><ResearchComposer specialty={specialty} initialText={first(query.q) ?? ""} initialOptions={researchView} /></section> : null}

    <AgentConfigPanel specialty={specialty} definition={definition} preference={profile.preferences[agentId]} inheritedTopics={profile.interests.topics} enabled={card.enabled} defaultOpen={!isConfigured(profile) && !onDemand} />
    <PendingActions actions={pendingForAgent} />

    {agentId === "drugs" && selectedRun && <DrugSinceLastVisit results={results} lastSeenAt={lastSeenAt} />}

    <div className="ws-agent-layout">
      <div className="ws-agent-results">
        {agentId === "events" && results.length > 0 && <BulkActions resultIds={results.map(result => result.id)} calendar />}
        {!selectedRun ? (onDemand ? null : <p className="ws-empty">{card.state === "needs_setup" ? "Выберите темы в настройках агента — он сразу запустится." : "Агент ещё не запускался. Нажмите «Запустить сейчас»."}</p>) : <>
          {onDemand && <ResearchOverview run={selectedRun} results={researchResults} totalResults={results.length} options={researchView} />}

          {!tracksNew && agentId !== "research" && results.length > 0 && <section className="ws-section" aria-labelledby="ws-all-title">
            <h2 id="ws-all-title" className="ws-section-title">{agentId === "learning" ? `Маршрут · ${results.length}` : `Найдено · ${results.length}`}</h2>
            <ResultList results={results} specialty={specialty} emptyText="" />
          </section>}

          {onDemand && <section className="ws-section" aria-labelledby="ws-research-results-title">
            <h2 id="ws-research-results-title" className="ws-section-title">{researchView.mode === "articles" ? `Источники · ${researchResults.length}` : `Найдено · ${researchResults.length}`}</h2>
            {researchView.mode === "articles"
              ? <ResearchResultsTable results={researchResults} />
              : <ResultList results={researchResults} specialty={specialty} emptyText="По выбранным фильтрам ничего не найдено. Расширьте источники или тип материалов." />}
          </section>}

          {tracksNew && fresh.length > 0 && <section className="ws-section" aria-labelledby="ws-fresh-title">
            <h2 id="ws-fresh-title" className="ws-section-title">{lastSeenAt ? `Новое с прошлого просмотра · ${fresh.length}` : `Найдено · ${fresh.length}`}</h2>
            <div className="ws-result-list">{fresh.map((result, index) => <ResultCard key={result.id} result={result} specialty={specialty} visual={index < 2} />)}</div>
          </section>}
          {tracksNew && earlier.length > 0 && <section className="ws-section" aria-labelledby="ws-earlier-title">
            <h2 id="ws-earlier-title" className="ws-section-title">Ранее найдено · {earlier.length}</h2>
            <ResultList results={earlier} specialty={specialty} emptyText="" />
          </section>}
          {!onDemand && !results.length && <p className="ws-empty">{selectedRun.status === "blocked" ? "Запрос остановлен проверкой безопасности — подробности справа." : "По текущим настройкам ничего не найдено. Попробуйте расширить темы или период."}</p>}
          {partner.length > 0 && <section className="ws-section ws-partner-slot" aria-labelledby="ws-partner-title">
            <h2 id="ws-partner-title" className="ws-section-title">Партнёрский материал</h2>
            {partner.map(result => <ResultCard key={result.id} result={result} specialty={specialty} />)}
          </section>}
        </>}
      </div>
      <aside className="ws-agent-aside">
        {selectedRun && (onDemand ? <details className="ws-trace-disclosure"><summary>Как искали и что было доступно</summary><RunTrace run={selectedRun} connectors={detail.connectors} now={now} /></details> : <RunTrace run={selectedRun} connectors={detail.connectors} now={now} />)}
        {onDemand && runs.length > 1 && <section className="ws-history" aria-labelledby="ws-history-title">
          <h3 id="ws-history-title">Предыдущие вопросы</h3>
          <ul>{runs.filter(run => run.input.text).slice(0, 8).map(run => <li key={run.id}><Link href={`/${specialty}/agents/${agent}?run=${encodeURIComponent(run.id)}&${researchQuery}`} aria-current={run.id === selectedRun?.id ? "true" : undefined}>{run.input.text}</Link><span>{countLabel(run.resultIds.length, ["источник", "источника", "источников"])} · {formatRelativeRu(run.startedAt)}</span></li>)}</ul>
        </section>}
      </aside>
    </div>
  </div>;
}
