import Link from "next/link";
import { ArrowRight, CircleAlert, Clock3 } from "lucide-react";
import { AGENT_DEFINITIONS } from "@/lib/agents/definitions";
import { formatRelativeRu } from "@/lib/agents/format";
import type { AgentCardState } from "@/lib/agents/types";
import { AgentIcon } from "./agent-icon";
import { AgentRunButton } from "./agent-run-button";

const STATE_LABEL: Record<AgentCardState["state"], string> = {
  needs_setup: "Нужна настройка",
  ready: "Готов",
  fresh: "Есть новое",
  stale: "Пора обновить",
  failed: "Ошибка запуска",
  disabled: "Выключен",
};

export function AgentCard({ card, now, variant = "grid" }: { card: AgentCardState; specialty: string; now: string; variant?: "grid" | "row" }) {
  const definition = AGENT_DEFINITIONS[card.agentId];
  const runnable = card.agentId !== "research" && card.agentId !== "materials" && card.state !== "needs_setup" && card.state !== "disabled";
  return <article className={`ws-agent-card is-${card.state} ws-agent-card-${variant}`} data-agent={card.agentId} aria-labelledby={`agent-${card.agentId}-title`}>
    <div className="ws-agent-card-top">
      <span className="ws-agent-icon"><AgentIcon icon={definition.icon} /></span>
      <span className={`ws-state ws-state-${card.state}`}>{card.state === "fresh" && card.newResults > 0 ? `${card.newResults} новых` : STATE_LABEL[card.state]}</span>
    </div>
    <h3 id={`agent-${card.agentId}-title`}><Link href={card.primaryAction.href}>{definition.name}</Link></h3>
    <p className="ws-agent-job">{definition.job}</p>
    <p className="ws-agent-headline">{card.state === "failed" && <CircleAlert size={15} aria-hidden="true" />}{card.headline}</p>
    {card.highlights.length > 0 && <ul className="ws-highlights" aria-label="Главное из сводки">{card.highlights.map(title => <li key={title}>{title}</li>)}</ul>}
    {card.breakdown.length > 0 && <ul className="ws-breakdown" aria-label="Из чего состоит результат">
      {card.breakdown.slice(0, 4).map(item => <li key={item.label}><strong>{item.count}</strong> {item.label}</li>)}
    </ul>}
    {card.reasons.length > 0 && <p className="ws-agent-reasons"><span className="sr-only">Почему так: </span>{card.reasons.join(" · ")}</p>}
    <div className="ws-agent-card-foot">
      <span className="ws-agent-meta"><Clock3 size={13} aria-hidden="true" />{card.agentId === "materials" ? "Ищет по запросу" : formatRelativeRu(card.lastRunAt, new Date(now))}</span>
      <div className="ws-agent-card-actions">
        {runnable && <AgentRunButton agentId={card.agentId} compact />}
        <Link className="ws-button is-primary is-small" href={card.primaryAction.href}>{card.primaryAction.label}<ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
    </div>
  </article>;
}
