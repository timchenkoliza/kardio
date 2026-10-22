import Link from "next/link";
import { ArrowRight, ExternalLink, ShieldAlert } from "lucide-react";
import { formatDateRu, VERIFICATION_LABEL, weakestVerification } from "@/lib/agents/format";
import type { AgentResultView, AgentRun } from "@/lib/agents/types";
import type { SpecialtyAdapter } from "@/lib/specialty";
import { stateForOrigin } from "@/lib/portal/cards";
import type { PortalJob } from "@/lib/portal/jobs";
import { researchOptionsForAnswerMode } from "@/lib/agents/research-options";
import { ResearchAnswerView, ResearchMore } from "@/components/workspace/research-answer";
import { ResultList } from "@/components/workspace/result-card";
import { StateBadge } from "./for-you";
import { FollowupJobButton, SaveResultButton } from "./result-actions";
import { TrackedLink } from "./tracked-link";

/**
 * Job-specific result modes. Every mode keeps the same honesty rules:
 * sources and dates are visible, unavailable sources are named, nothing is
 * paraphrased beyond what the source states.
 */

function Synthesis({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="pt-synthesis">{text.split("\n\n").map(paragraph => <p key={paragraph.slice(0, 48)}>{paragraph}</p>)}</div>;
}

function retrieved(result: AgentResultView): string {
  const date = formatDateRu(result.source.retrievedAt, { day: "numeric", month: "short", year: "numeric" }) ?? result.source.retrievedAt.slice(0, 10);
  return result.source.dataOrigin === "runtime_api" ? `получено ${date}` : `снимок от ${date}`;
}

/** One quoted conclusion: the answer unit of the reference job. */
function AnswerItem({ result }: { result: AgentResultView }) {
  const evidence = result.evidence[0];
  const verification = evidence ? VERIFICATION_LABEL[evidence.verificationStatus] : null;
  const source = result.actions.find(action => action.kind === "open_source" && action.href);
  return <li className="pt-answer">
    <div className="ws-result-meta">
      <span className="ws-kind" data-art={result.category === "Клинические рекомендации" ? "guideline" : "article"}>{result.category ?? "Обзор"}</span>
      {typeof result.attributes.journal === "string" && <span>{result.attributes.journal}</span>}
      {typeof result.attributes.year === "string" && <span>{result.attributes.year}</span>}
      {verification && <span className={`ws-verify ws-verify-${verification.tone}`}>{verification.label}</span>}
    </div>
    {evidence && <blockquote className="pt-quote" lang="en"><p>{evidence.claim}</p></blockquote>}
    <p className="pt-answer-source">{typeof result.attributes.conclusionLabel === "string" ? `Раздел «${result.attributes.conclusionLabel}» реферата: ` : ""}<cite>{result.title}</cite></p>
    {evidence?.verificationNote && <p className="ws-evidence-note">{evidence.verificationNote}</p>}
    <div className="pt-card-actions">
      {source?.href && <TrackedLink className="ws-button is-small" href={source.href} external events={["source_opened"]} resultId={result.id} resultKind={result.kind}>Открыть в PubMed<ExternalLink size={13} aria-hidden="true" /></TrackedLink>}
      <SaveResultButton resultId={result.id} saved={Boolean(result.savedMaterialId)} />
    </div>
  </li>;
}

/** FDA label: sections are the content, shown directly. */
function DrugLabelBlock({ result }: { result: AgentResultView }) {
  const titles = typeof result.attributes.sectionTitles === "string" ? result.attributes.sectionTitles.split("|") : [];
  const dailyMed = result.actions.find(action => action.kind === "open_source" && action.href?.includes("dailymed"));
  const grls = result.actions.find(action => action.kind === "open_source" && action.href?.includes("grls"));
  const status = weakestVerification(result.evidence.map(item => item.verificationStatus));
  return <article className="pt-drug" aria-labelledby={`drug-${result.id}`}>
    <div className="ws-result-meta">
      <span className="ws-kind" data-art="clinical">Инструкция FDA</span>
      {typeof result.attributes.effectiveDate === "string" && <span>редакция от {formatDateRu(result.attributes.effectiveDate, { day: "numeric", month: "long", year: "numeric" }) ?? result.attributes.effectiveDate}</span>}
      <span className={`ws-verify ws-verify-${VERIFICATION_LABEL[status].tone}`}>{VERIFICATION_LABEL[status].label}</span>
    </div>
    <h2 className="pt-drug-title" id={`drug-${result.id}`}>{result.title}</h2>
    {result.summary && <p className="ws-muted">{result.summary}</p>}
    <p className="pt-boundary"><ShieldAlert size={14} aria-hidden="true" />Это инструкция, утверждённая в США. Показания, дозы и ограничения в России определяет инструкция из ГРЛС; openFDA предупреждает, что данные не валидированы. Решение о назначении — за врачом.</p>
    <dl className="pt-drug-sections">
      {result.evidence.map((item, index) => <div key={item.id} className="pt-drug-section">
        <dt>{titles[index] ?? "Раздел инструкции"}</dt>
        <dd lang="en">{item.claim}</dd>
      </div>)}
    </dl>
    {result.attributes.truncated === true && <p className="ws-muted">Длинные разделы сокращены — полный текст в инструкции на DailyMed.</p>}
    <p className="ws-provenance"><span>{result.source.source}</span><StateBadge state={stateForOrigin(result.source.dataOrigin)} freshness={retrieved(result)} /></p>
    <div className="pt-card-actions">
      {dailyMed?.href && <TrackedLink className="ws-button is-small" href={dailyMed.href} external events={["source_opened"]} resultId={result.id} resultKind={result.kind}>Инструкция на DailyMed<ExternalLink size={13} aria-hidden="true" /></TrackedLink>}
      {grls?.href && <TrackedLink className="ws-button is-small" href={grls.href} external events={["source_opened"]} resultId={result.id} resultKind={result.kind}>Проверить в ГРЛС<ExternalLink size={13} aria-hidden="true" /></TrackedLink>}
      <SaveResultButton resultId={result.id} saved={Boolean(result.savedMaterialId)} />
    </div>
  </article>;
}

function NextActions({ run, job }: { run: AgentRun; job: PortalJob }) {
  const text = run.input.text?.trim();
  if (!text || run.status === "blocked") return null;
  const options: Array<{ job: PortalJob; label: string }> = [];
  if (job !== "research") options.push({ job: "research", label: "Разобрать по исследованиям" });
  if (job !== "guidelines") options.push({ job: "guidelines", label: "Клинические рекомендации по теме" });
  if (job !== "learning") options.push({ job: "learning", label: "Что изучить по теме" });
  return <section className="pt-next" aria-labelledby="pt-next-title">
    <h2 id="pt-next-title" className="pt-subtitle">Что дальше</h2>
    <div className="pt-card-actions">{options.slice(0, 3).map(option => <FollowupJobButton key={option.job} text={text} job={option.job} label={option.label} />)}</div>
  </section>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section className="ws-section" aria-labelledby={id}><h2 id={id} className="pt-subtitle">{title}</h2>{children}</section>;
}

function Cards({ results, specialty }: { results: AgentResultView[]; specialty: string }) {
  return <ResultList results={results} specialty={specialty} emptyText="" />;
}

function Handoffs({ adapter, title }: { adapter: SpecialtyAdapter; title: string }) {
  return <section className="pt-handoffs" aria-labelledby="pt-handoffs-title">
    <h2 id="pt-handoffs-title" className="pt-subtitle">{title}</h2>
    <ul>{adapter.organisers.map(organiser => <li key={organiser.url}>
      <TrackedLink href={organiser.url} external events={["source_opened"]}>{organiser.name}<ExternalLink size={13} aria-hidden="true" /></TrackedLink>
      <span className="ws-muted">Ссылка проверена {formatDateRu(organiser.checkedAt, { day: "numeric", month: "long" }) ?? organiser.checkedAt}; это календарь организатора, а не запись о событии</span>
    </li>)}</ul>
  </section>;
}

function RubricatorHandoff() {
  return <aside className="pt-boundary-block" aria-label="Статус рекомендаций в России">
    <p><strong>Статус в России</strong> · Рубрикатор клинических рекомендаций Минздрава пока не подключён, поэтому официальный статус документов здесь не утверждается.</p>
    <TrackedLink className="ws-text-link" href="https://cr.minzdrav.gov.ru/" external events={["source_opened"]}>Открыть рубрикатор<ExternalLink size={13} aria-hidden="true" /></TrackedLink>
  </aside>;
}

export function JobResult({ job, run, results, partner, specialty, adapter }: { job: PortalJob; run: AgentRun; results: AgentResultView[]; partner: AgentResultView[]; specialty: string; adapter: SpecialtyAdapter }) {
  if (run.status === "blocked") {
    return <div className="pt-blocked" role="alert">
      <p><ShieldAlert size={16} aria-hidden="true" />{run.plan[0]?.detail ?? "Запрос остановлен проверкой безопасности."}</p>
      {run.riskNotices.map(notice => <p key={notice} className="ws-muted">{notice}</p>)}
    </div>;
  }
  if (run.status === "failed") return <p className="ws-empty" role="alert">Не получилось собрать результат: {run.error ?? "источник ответил ошибкой"}. Попробуйте ещё раз или переформулируйте вопрос.</p>;

  const notices = run.riskNotices.length ? <ul className="ws-notices">{run.riskNotices.map(notice => <li key={notice}>{notice}</li>)}</ul> : null;

  if (job === "answer" || job === "drug") {
    const labels = results.filter(result => result.kind === "drug_label");
    const answers = results.filter(result => result.kind === "reference_answer").sort((a, b) => Number(a.attributes.relevance ?? 99) - Number(b.attributes.relevance ?? 99));
    const signals = results.filter(result => result.kind === "drug_change");
    const more = results.filter(result => result.kind === "research_finding");
    return <>
      {notices}
      <Synthesis text={run.synthesis} />
      {labels.map(result => <DrugLabelBlock key={result.id} result={result} />)}
      {signals.length > 0 && <Section id="pt-signals" title="Регуляторные сигналы по препарату"><Cards results={signals} specialty={specialty} /></Section>}
      {answers.length > 0 && <Section id="pt-answers" title="Выводы обзоров и рекомендаций"><p className="ws-muted">Цитаты разделов «Выводы» из рефератов на языке оригинала. Сначала — наиболее близкие к вопросу.</p><ol className="pt-answers">{answers.map(result => <AnswerItem key={result.id} result={result} />)}</ol></Section>}
      {more.length > 0 && <Section id="pt-more" title="Ещё по теме"><Cards results={more} specialty={specialty} /></Section>}
      {!labels.length && !answers.length && !more.length && !signals.length && <p className="ws-empty">Подходящих источников не нашлось. Назовите заболевание, препарат (МНН) или тему — например, «метформин при ХБП» или «профилактика мигрени».</p>}
      <NextActions run={run} job={job} />
    </>;
  }

  if (job === "guidelines") {
    const catalog = results.filter(result => result.category !== "guideline_publication");
    const published = results.filter(result => result.category === "guideline_publication");
    return <>
      {notices}
      <Synthesis text={run.synthesis} />
      <RubricatorHandoff />
      {catalog.length > 0 && <Section id="pt-catalog" title="Каталог рекомендаций специальности"><Cards results={catalog} specialty={specialty} /></Section>}
      {published.length > 0 && <Section id="pt-published" title="Опубликованные рекомендации"><Cards results={published} specialty={specialty} /></Section>}
      {!results.length && <p className="ws-empty">Опубликованных рекомендаций по запросу не нашлось. Уточните заболевание или проверьте рубрикатор Минздрава.</p>}
      <NextActions run={run} job={job} />
    </>;
  }

  if (job === "events") {
    const covered = adapter.catalog;
    return <>
      {notices}
      <Synthesis text={run.synthesis} />
      {results.length > 0 && <>
        <p className="ws-muted">Даты, город и формат — как указано на странице организатора (снимок афиш от {formatDateRu(results[0].source.retrievedAt, { day: "numeric", month: "long" }) ?? ""}). Регистрация и календарь — только после вашего подтверждения; зарегистрировать вас продукт не может.</p>
        <Cards results={[...results].sort((a, b) => String(a.attributes.startDate ?? "").localeCompare(String(b.attributes.startDate ?? "")))} specialty={specialty} />
      </>}
      {partner.length > 0 && <Section id="pt-partner" title="Партнёрский материал"><Cards results={partner} specialty={specialty} /></Section>}
      <Handoffs adapter={adapter} title={covered && results.length ? "Где ещё смотреть события" : "Календари организаторов"} />
    </>;
  }

  if (job === "learning") {
    return <>
      {notices}
      <Synthesis text={run.synthesis} />
      {results.length > 0 ? <Cards results={results} specialty={specialty} /> : <p className="ws-empty">Подходящих материалов не нашлось. Назовите тему, которую хотите освежить.</p>}
    </>;
  }

  if (job === "research") {
    // The same answer as on the scenario page: the research scenario runs and renders one way from every door.
    const mode = researchOptionsForAnswerMode(run.input.answerMode).mode;
    return <>
      {notices}
      <ResearchAnswerView run={run} results={results} mode={mode} />
      <ResearchMore run={run} results={results} specialty={adapter.id} mode={mode} />
      {run.input.text && <p><Link className="ws-text-link" href={`/${specialty}/agents/research?q=${encodeURIComponent(run.input.text)}`}>Повторить с другими источниками или типом материалов<ArrowRight size={15} aria-hidden="true" /></Link></p>}
      <NextActions run={run} job={job} />
    </>;
  }

  return <>
    {notices}
    <Synthesis text={run.synthesis} />
    {results.length > 0 ? <Cards results={results} specialty={specialty} /> : <p className="ws-empty">{job === "materials" ? "В ваших материалах совпадений нет." : "Нового по запросу не нашлось."}</p>}
    {partner.length > 0 && <Section id="pt-partner" title="Партнёрский материал"><Cards results={partner} specialty={specialty} /></Section>}
  </>;
}
