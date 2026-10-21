import { notFound } from "next/navigation";
import { AgentCard } from "@/components/workspace/agent-card";
import { PendingActions } from "@/components/workspace/pending-actions";
import { isSpecialty } from "@/lib/specialty";
import { pageSession } from "@/server/agents/page-session";
import { workspaceStore } from "@/server/agents/store";
import { getWorkspaceView } from "@/server/agents/workspace";

export const dynamic = "force-dynamic";

export default async function AgentsPage({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  const sessionId = await pageSession(specialty);
  const [workspace, actions] = await Promise.all([
    getWorkspaceView(sessionId, specialty),
    sessionId ? workspaceStore().listActions(sessionId, specialty) : Promise.resolve([]),
  ]);
  const now = new Date().toISOString();
  const enabled = workspace.cards.filter(card => card.enabled);
  const disabled = workspace.cards.filter(card => !card.enabled);

  return <div className="ws-page">
    <header className="ws-page-head">
      <h1>Фоновые проверки</h1>
      <p>Служебная страница: какие проверки источников работают в фоне для подборки «Для вас» и когда они последний раз запускались. Для вопросов и задач эта страница не нужна — пользуйтесь полем на главной.</p>
    </header>
    <PendingActions actions={actions.filter(action => action.status === "pending_confirmation")} />
    <section className="ws-section" aria-labelledby="ws-active-agents">
      <h2 id="ws-active-agents" className="ws-section-title">Работают</h2>
      <div className="ws-agent-grid is-wide">{enabled.map(card => <AgentCard key={card.agentId} card={card} specialty={specialty} now={now} />)}</div>
    </section>
    {disabled.length > 0 && <section className="ws-section" aria-labelledby="ws-disabled-agents">
      <h2 id="ws-disabled-agents" className="ws-section-title">Выключены</h2>
      <div className="ws-agent-grid is-wide">{disabled.map(card => <AgentCard key={card.agentId} card={card} specialty={specialty} now={now} />)}</div>
    </section>}
  </div>;
}
