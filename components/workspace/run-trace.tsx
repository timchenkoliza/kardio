import { CircleCheck, CircleDashed, CircleSlash, CircleX } from "lucide-react";
import { countLabel, formatRelativeRu } from "@/lib/agents/format";
import type { AgentRun, ConnectorDescriptor } from "@/lib/agents/types";
import { ModeBadge } from "./mode-badge";

const STEP_ICON = { done: CircleCheck, skipped: CircleDashed, failed: CircleX, blocked: CircleSlash } as const;
const STATUS_LABEL: Record<AgentRun["status"], string> = { running: "Выполняется", completed: "Готово", partial: "Готово частично", failed: "Ошибка", blocked: "Остановлено проверкой безопасности" };

/** "Как получен результат": the plan in plain language plus which sources were reachable. */
export function RunTrace({ run, connectors, now, showSynthesis = true }: { run: AgentRun; connectors: ConnectorDescriptor[]; now: string; showSynthesis?: boolean }) {
  const used = new Set(run.toolsUsed.flatMap(use => use.connectorIds));
  const shown = connectors.filter(connector => used.has(connector.id) || connector.mode === "UNAVAILABLE");
  return <section className="ws-trace" aria-labelledby={`trace-${run.id}`}>
    <div className="ws-trace-head">
      <h3 id={`trace-${run.id}`}>Как получен результат</h3>
      <span className={`ws-run-status is-${run.status}`}>{STATUS_LABEL[run.status]}</span>
    </div>
    <p className="ws-trace-meta">{formatRelativeRu(run.completedAt ?? run.startedAt, new Date(now))}{run.durationMs !== null ? ` · ${(run.durationMs / 1000).toFixed(1)} с` : ""} · {countLabel(run.resultIds.length, ["находка", "находки", "находок"])}{run.newResultCount ? `, новых ${run.newResultCount}` : ""}</p>
    {run.input.text && <p className="ws-trace-question">Задача: «{run.input.text}»</p>}
    <ol className="ws-steps">
      {run.plan.map(step => {
        const Icon = STEP_ICON[step.status];
        return <li key={step.id} className={`is-${step.status}`}><Icon size={16} aria-hidden="true" /><div><strong>{step.label}</strong>{step.detail && <span>{step.detail}</span>}</div></li>;
      })}
    </ol>
    {run.riskNotices.length > 0 && <ul className="ws-notices">{run.riskNotices.map(notice => <li key={notice}>{notice}</li>)}</ul>}
    {showSynthesis && run.synthesis && <div className="ws-synthesis"><h4>Обзор</h4>{run.synthesis.split("\n\n").map(paragraph => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}</div>}
    {shown.length > 0 && <div className="ws-sources-used"><h4>Источники и их состояние</h4><ul>{shown.map(connector => <li key={connector.id}><span>{connector.name}</span><ModeBadge mode={connector.mode} origin={connector.dataOrigin} snapshotAt={connector.snapshotAt} /></li>)}</ul></div>}
  </section>;
}
