import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { VERIFICATION_LABEL, weakestVerification } from "@/lib/agents/format";
import type { AgentResultView, AgentRun, VerificationStatus } from "@/lib/agents/types";
import type { PhysicianResearchMode, PhysicianResearchViewOptions } from "@/lib/ui/physician-research-view";

function verificationCounts(results: readonly AgentResultView[]) {
  const statuses = results.flatMap(result => result.evidence.map(item => item.verificationStatus));
  return {
    total: statuses.length,
    supported: statuses.filter(status => status === "SUPPORTED").length,
    partial: statuses.filter(status => status === "PARTIALLY_SUPPORTED").length,
    unknown: statuses.filter(status => status === "UNKNOWN").length,
    unsupported: statuses.filter(status => status === "UNSUPPORTED").length,
  };
}

function coverageLabel(results: readonly AgentResultView[]): { label: string; tone: "good" | "medium" | "limited"; note: string } {
  const counts = verificationCounts(results);
  if (!counts.total) return { label: "Ограниченная", tone: "limited", note: "В выдаче нет проверяемых утверждений." };
  if (!counts.unknown && !counts.unsupported && counts.partial === 0) return { label: "Высокая", tone: "good", note: "Все показанные утверждения привязаны к подтверждённым источникам." };
  if (counts.supported + counts.partial > 0 && !counts.unsupported) return { label: "Средняя", tone: "medium", note: "Есть подтверждённые источники, но часть утверждений подтверждена не полностью." };
  return { label: "Ограниченная", tone: "limited", note: "Часть утверждений не удалось надёжно подтвердить." };
}

function modeTitle(mode: PhysicianResearchMode): string {
  if (mode === "articles") return "Поиск статей";
  if (mode === "academic") return "Академическая основа · beta";
  return "Краткий обзор";
}

export function ResearchOverview({
  run,
  results,
  totalResults,
  options,
}: {
  run: AgentRun;
  results: AgentResultView[];
  totalResults: number;
  options: PhysicianResearchViewOptions;
}) {
  const counts = verificationCounts(results);
  const coverage = coverageLabel(results);
  const uniqueSources = new Set(results.flatMap(result => result.evidence.map(item => item.sourceId))).size;
  const filtersActive = options.sourceScope !== "all" || options.contentScope !== "all";

  return <section className="ws-research-overview" aria-labelledby="research-overview-title">
    <div className="ws-research-overview-head">
      <div>
        <p className="ws-intro-meta">{modeTitle(options.mode)}</p>
        <h2 id="research-overview-title" className="ws-section-title">Насколько можно доверять выдаче</h2>
      </div>
      <span className={`ws-research-trust is-${coverage.tone}`}><ShieldCheck size={14} aria-hidden="true" />Проверяемость: {coverage.label}</span>
    </div>
    <p className="ws-research-trust-note">{coverage.note} Это оценка проверяемости ссылок, а не качества дизайна исследования или силы клинической рекомендации.</p>
    <dl className="ws-research-metrics">
      <div><dt>Показано</dt><dd>{results.length}{filtersActive ? ` из ${totalResults}` : ""}</dd></div>
      <div><dt>Источников в выводах</dt><dd>{uniqueSources}</dd></div>
      <div><dt>Подтверждено</dt><dd>{counts.supported}</dd></div>
      <div><dt>Частично</dt><dd>{counts.partial}</dd></div>
    </dl>
    {options.mode !== "articles" && run.synthesis && !filtersActive && <div className="ws-research-synthesis">
      <h3>{options.mode === "academic" ? "Основа для академического текста" : "Краткая сводка"}</h3>
      {run.synthesis.split("\n\n").map(paragraph => <p key={paragraph.slice(0, 60)}>{paragraph}</p>)}
      {options.mode === "academic" && <p className="ws-muted">Beta: сейчас это доказательная основа и структура. Полноценный академический экспорт и стили цитирования подключим отдельным шагом.</p>}
    </div>}
    {filtersActive && <p className="ws-muted">Фильтры сейчас применяются к показанной выдаче. Точный include/exclude конкретных сайтов остаётся в настройках источников.</p>}
  </section>;
}

function resultVerification(result: AgentResultView): VerificationStatus | null {
  return result.evidence.length ? weakestVerification(result.evidence.map(item => item.verificationStatus)) : null;
}

export function ResearchResultsTable({ results }: { results: AgentResultView[] }) {
  if (!results.length) return <p className="ws-empty">По выбранным фильтрам ничего не осталось. Расширьте источники или тип материалов.</p>;

  return <div className="ws-research-table-wrap">
    <table className="ws-research-table">
      <thead><tr><th>Материал</th><th>Источник</th><th>Тип</th><th>Проверка</th></tr></thead>
      <tbody>{results.map(result => {
        const verification = resultVerification(result);
        const action = result.actions.find(item => (item.kind === "open_source" || item.kind === "open_internal") && item.href);
        const title = action?.kind === "open_internal" && action.href
          ? <Link href={action.href}>{result.title}</Link>
          : action?.href
            ? <a href={action.href} target="_blank" rel="noreferrer">{result.title}<ExternalLink size={12} aria-hidden="true" /></a>
            : result.title;
        return <tr key={result.id}>
          <td data-label="Материал"><strong>{title}</strong><span>{result.summary}</span></td>
          <td data-label="Источник">{result.source.source}</td>
          <td data-label="Тип">{result.category ?? result.kind}</td>
          <td data-label="Проверка">{verification ? <span className={`ws-verify ws-verify-${VERIFICATION_LABEL[verification].tone}`}>{VERIFICATION_LABEL[verification].label}</span> : "—"}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
