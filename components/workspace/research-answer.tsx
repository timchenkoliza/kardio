import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { buildResearchAnswer, type StudyDigest } from "@/lib/agents/research-answer";
import { buildResearchComparison } from "@/lib/agents/research-comparison";
import type { ResearchMode } from "@/lib/agents/research-options";
import type { AgentResultView, AgentRun } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { nbsp } from "@/lib/ui/typography";
import { ResearchComparison } from "./research-comparison";
import { ResearchExport } from "./research-export";
import { ResearchResultsTable } from "./research-report";
import { ResultList } from "./result-card";

/**
 * The one main answer of the research scenario. Same component on the
 * scenario page and on the portal result, so the physician sees one result
 * whatever door they used. Comparison, every found record, export and the
 * search trace stay below, collapsed.
 */

const ACCESS_LABEL: Record<NonNullable<StudyDigest["access"]>, string> = {
  full_text: "прочитан полный текст",
  abstract: "прочитана аннотация",
  unavailable: "текст недоступен",
};

function Study({ study, first }: { study: StudyDigest; first: boolean }) {
  const primary = study.links[0];
  const meta = [study.design, study.journal, study.year, study.access ? ACCESS_LABEL[study.access] : null].filter(Boolean).join(" · ");
  return <li className="ws-ra-study" data-study={study.id}>
    <h3 className="ws-ra-title" lang="en">{study.internalHref
      ? <Link href={study.internalHref}>{study.title}</Link>
      : primary ? <a href={primary.href} target="_blank" rel="noreferrer">{study.title}</a> : study.title}</h3>
    <p className="ws-ra-meta">{meta}</p>
    {study.verificationLabel && <p className="ws-ra-check"><span className={`ws-verify ws-verify-${study.verificationTone ?? "unknown"}`}>{study.verificationLabel}</span></p>}
    {(study.effect || study.endpoint || study.population || study.followUp) && <dl className="ws-ra-facts">
      {study.effect && <div data-fact="effect"><dt>Результат</dt><dd>{study.effect}</dd></div>}
      {study.endpoint && <div data-fact="endpoint"><dt>Конечная точка</dt><dd lang="en">{study.endpoint}</dd></div>}
      {study.population && <div data-fact="population"><dt>Участники</dt><dd lang="en">{study.population}</dd></div>}
      {study.followUp && <div data-fact="follow-up"><dt>Наблюдение</dt><dd lang="en">{study.followUp}</dd></div>}
    </dl>}
    {study.conclusion && <details className="ws-ra-conclusion" open={first}>
      <summary>Вывод авторов · на языке оригинала</summary>
      <blockquote lang="en">{study.conclusion.text}</blockquote>
    </details>}
    {study.effectQuote && <details className="ws-ra-quote">
      <summary>Откуда цифры: цитата из статьи</summary>
      <p lang="en">{study.effectQuote}</p>
    </details>}
    {study.links.length > 0 && <p className="ws-ra-links">{study.links.map(link => <a key={link.href} className="ws-text-link" href={link.href} target="_blank" rel="noreferrer">{link.label}<ExternalLink size={13} aria-hidden="true" /></a>)}</p>}
  </li>;
}

export function ResearchAnswerView({ run, results, mode = "brief" }: { run: AgentRun; results: AgentResultView[]; mode?: ResearchMode }) {
  const answer = buildResearchAnswer(run, results);
  // «Найти статьи» is a table of records: the table below is the result, not a second list here.
  const studies = mode === "articles" && answer.kind === "question" ? [] : answer.studies;
  return <section className="ws-research-answer" aria-labelledby="ws-ra-title" data-research-answer={answer.kind}>
    <h2 id="ws-ra-title" className="ws-section-title">{answer.kind === "study" ? "Разбор публикации" : "Что нашли"}</h2>
    <p className="ws-ra-headline">{nbsp(answer.headline)}</p>
    {((answer.conditions?.length ?? 0) > 0 || (answer.unmatched?.length ?? 0) > 0) && <p className="ws-muted pt-search-conditions" data-missing={answer.unmatched?.length || undefined}>{nbsp(`${answer.conditions?.length ? `Искали по: ${answer.conditions.join(" · ")}.` : "Тему вопроса не распознали."}${answer.unmatched?.length ? ` Не учтено в поиске: ${answer.unmatched.map(words => `«${words}»`).join(", ")}. Проверьте это по найденным работам.` : ""}`)}</p>}
    {studies.length > 0 && <ol className="ws-ra-studies">{studies.map((study, index) => <Study key={study.id} study={study} first={index === 0} />)}</ol>}
    <div className="ws-ra-notes">
      {answer.trust.length > 0 && <section aria-labelledby="ws-ra-trust"><h3 id="ws-ra-trust">Что проверили</h3><ul>{answer.trust.map(line => <li key={line}>{nbsp(line)}</li>)}</ul></section>}
      {answer.kind !== "blocked" && <section aria-labelledby="ws-ra-practice"><h3 id="ws-ra-practice">Как читать результат</h3><p>{nbsp(answer.practice)}</p></section>}
      {answer.limitations.length > 0 && <section aria-labelledby="ws-ra-limits"><h3 id="ws-ra-limits">Ограничения</h3><ul>{answer.limitations.map(line => <li key={line}>{nbsp(line)}</li>)}</ul></section>}
    </div>
  </section>;
}

/**
 * Everything beyond the main answer, collapsed: the comparison table, every
 * found record (without decorative pictures: an illustration is not evidence)
 * and the bibliography export.
 */
export function ResearchMore({ run, results, specialty, mode }: { run: AgentRun; results: AgentResultView[]; specialty: SpecialtyId; mode: ResearchMode }) {
  if (!results.length) return null;
  const comparable = buildResearchComparison(results).length >= 2;
  return <div className="ws-research-more">
    {comparable && <details data-more="comparison"><summary>Сравнить исследования в таблице</summary><ResearchComparison results={results} /></details>}
    <details data-more="all" open={mode === "articles"}>
      <summary>{mode === "articles" ? `Найденные статьи · ${results.length}` : `Все найденные публикации · ${results.length}`}</summary>
      {mode === "articles" ? <ResearchResultsTable results={results} /> : <ResultList results={results} specialty={specialty} emptyText="" illustrated={false} />}
    </details>
    <details data-more="export"><summary>Список литературы и экспорт</summary><ResearchExport specialty={specialty} runId={run.id} completedAt={run.completedAt ?? run.startedAt} mode={mode} results={results} /></details>
  </div>;
}
