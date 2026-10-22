import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { formatRelativeRu } from "@/lib/agents/format";
import type { AgentRun } from "@/lib/agents/types";
import { GALLERY, galleryAvailable, galleryHref, type MascotVariant } from "@/lib/portal/agents-gallery";
import { askHref, jobForRun, type PortalJob } from "@/lib/portal/jobs";
import { isRussian, localizeItem } from "@/lib/presentation/physician";
import { isSpecialty, specialties } from "@/lib/specialty";
import { nbsp } from "@/lib/ui/typography";
import { Mascot } from "@/components/portal/mascot";
import { AgentCard } from "@/components/workspace/agent-card";
import { PendingActions } from "@/components/workspace/pending-actions";
import { pageSession } from "@/server/agents/page-session";
import { workspaceStore } from "@/server/agents/store";
import { getWorkspaceView } from "@/server/agents/workspace";

export const dynamic = "force-dynamic";

const JOB_TO_AGENT: Partial<Record<PortalJob, MascotVariant>> = { drug: "drug", guidelines: "guidelines", research: "research", answer: "consilium", events: "events", materials: "materials", learning: "learning", updates: "updates" };

/** The physician's own last request per capability (questions they typed, not background checks). */
function lastActivity(runs: readonly AgentRun[]): Map<MascotVariant, AgentRun> {
  const latest = new Map<MascotVariant, AgentRun>();
  for (const run of runs) {
    if (run.trigger === "schedule_catchup" || run.trigger === "configuration" || !run.input.text) continue;
    const agent = JOB_TO_AGENT[jobForRun(run)];
    if (agent && !latest.has(agent)) latest.set(agent, run);
  }
  return latest;
}

export default async function AgentsPage({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  const sessionId = await pageSession(specialty);
  const store = workspaceStore();
  const [workspace, actions, runs] = await Promise.all([
    getWorkspaceView(sessionId, specialty),
    sessionId ? store.listActions(sessionId, specialty) : Promise.resolve([]),
    sessionId ? store.listRuns(sessionId, specialty, undefined, 80) : Promise.resolve([]),
  ]);
  const now = new Date().toISOString();
  const recent = lastActivity(runs);
  // Background checks list what they found; titles pass the same Russian presentation as the feed.
  const background = workspace.cards.filter(card => card.agentId !== "reference").map(card => ({ ...card, highlights: card.highlights.map(title => isRussian(title) ? title : localizeItem({ title, typeLabel: "Публикация" }).title) }));
  const pending = actions.filter(action => action.status === "pending_confirmation");

  return <div className="ws-page pt-agents">
    <header className="ws-page-head">
      <h1>{nbsp(`Агенты для специальности «${specialties[specialty].name}»`)}</h1>
      <p>{nbsp("Каждый агент делает одну работу на проверенных источниках и показывает, откуда взят каждый вывод. Спрашивать можно и прямо с главной — поле само выберет нужного агента.")}</p>
    </header>

    {pending.length > 0 && <PendingActions actions={pending} />}

    <section className="ws-section" aria-labelledby="pt-gallery-title">
      <h2 id="pt-gallery-title" className="sr-only">Галерея агентов</h2>
      <ul className="pt-gallery">
        {GALLERY.map(agent => {
          const available = galleryAvailable(agent, specialty);
          const href = galleryHref(agent, specialty);
          const run = recent.get(agent.id);
          return <li key={agent.id} className={available ? "pt-agent" : "pt-agent is-soon"} data-agent={agent.id}>
            <div className="pt-agent-figure">
              <Mascot variant={agent.id} size={88} />
              <span className="pt-agent-tip" aria-hidden="true">{agent.help}</span>
            </div>
            <div className="pt-agent-body">
              <p className="pt-agent-role">{agent.role}</p>
              <h3 className="pt-agent-name">{href ? <Link className="pt-agent-link" href={href}>{nbsp(agent.name)}</Link> : nbsp(agent.name)}</h3>
              <p className="pt-agent-can">{nbsp(agent.can)}</p>
              <p className="pt-agent-sources"><span>Источники:</span> {nbsp(agent.sources)}</p>
              {run && <p className="pt-agent-last">Последний запрос: <Link href={askHref(specialty, { run: run.id })}>«{run.input.text}»</Link> · {formatRelativeRu(run.completedAt ?? run.startedAt)}</p>}
              <div className="pt-agent-foot">
                <span className="pt-agent-status" data-ready={available}>{available ? "Готов к работе" : "Готовим для вашей специальности"}</span>
                {href && <span className="pt-agent-cta" aria-hidden="true">{agent.id === "materials" ? "Открыть" : agent.id === "calculators" ? "Посчитать" : "Спросить"}<ArrowRight size={14} /></span>}
              </div>
            </div>
          </li>;
        })}
      </ul>
    </section>

    <details className="ws-section ws-card-block pt-background">
      <summary>{nbsp("Фоновые проверки для подборки «Для вас»")}</summary>
      <p className="ws-muted">{nbsp("Эти проверки работают сами: следят за новыми публикациями, рекомендациями, препаратами и событиями по вашим темам. Ничего настраивать не нужно.")}</p>
      <div className="ws-agent-grid is-wide">{background.map(card => <AgentCard key={card.agentId} card={card} specialty={specialty} now={now} />)}</div>
    </details>
  </div>;
}
