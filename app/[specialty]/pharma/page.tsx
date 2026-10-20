import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole, Settings2 } from "lucide-react";
import { PharmaComposer } from "@/components/pharma/pharma-composer";
import { canUseAgentCapability, visibleAgentsForSubject } from "@/lib/access/agent-entitlements";
import { PHARMA_AGENT_DEFINITIONS } from "@/lib/pharma/agents";
import { isSpecialty } from "@/lib/specialty";
import { specialtyLabel } from "@/lib/ui/labels";
import { getRequestAccessState } from "@/server/access/request-access";
import { pageSession } from "@/server/agents/page-session";
import { contentStudioStore, contentStudioWorkspaceIdForSubject } from "@/server/pharma/store";

export const dynamic = "force-dynamic";

export default async function PharmaPartnerPage({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();

  const access = await getRequestAccessState();
  const agentIds = visibleAgentsForSubject(access.policy, access.subject.id, "partner_workspace");
  const agents = agentIds.map(id => id === "content_studio" ? PHARMA_AGENT_DEFINITIONS.content_studio : null).filter(Boolean);
  const canRunStudio = canUseAgentCapability(access.policy, access.subject.id, "content_studio", "run");
  const canEditStudio = canUseAgentCapability(access.policy, access.subject.id, "content_studio", "edit_draft");
  const canRequestReview = canUseAgentCapability(access.policy, access.subject.id, "content_studio", "request_review");
  const workspaceId = contentStudioWorkspaceIdForSubject(access.subject.id);
  const sessionId = await pageSession(specialty);
  const initialPackages = sessionId && workspaceId
    ? await contentStudioStore().listPackages(sessionId, specialty, workspaceId)
    : [];

  return <main className="ws-main" id="ws-main">
    <div className="ws-page">
      <Link className="ws-back" href={`/${specialty}`}><ArrowLeft size={15} aria-hidden="true" />Рабочее пространство врача</Link>

      <section className="ws-intro" aria-labelledby="pharma-title">
        <p className="ws-intro-meta">{specialtyLabel[specialty]} · кабинет фарма-партнёра · beta</p>
        <h1 id="pharma-title">Что хотите подготовить для врачей?</h1>
        <p className="ws-intro-lead">Один вход для задач партнёра. Теперь Content Studio создаёт и сохраняет настоящий пакет: Brief → Run → Article / Useful / Media / Event / Performance → Review.</p>
        <p className="ws-muted">Текущий demo-пользователь: <strong>{access.subject.label}</strong> · policy: {access.source === "preview_override" ? "preview override" : "default"}.</p>
        <PharmaComposer
          allowed={canRunStudio}
          canEdit={canEditStudio}
          canRequestReview={canRequestReview}
          specialty={specialty}
          initialPackages={initialPackages}
        />
      </section>

      <section className="ws-section ws-card-block" aria-labelledby="pharma-access-title">
        <div className="ws-section-head">
          <div>
            <h2 id="pharma-access-title" className="ws-section-title">Доступные вам агенты</h2>
            <p className="ws-muted">Каталог вычисляется на сервере из subject → workspace role → agent grants. Preview overrides демонстрационные и не являются production authentication.</p>
          </div>
          <Link className="ws-text-link" href="/admin/agent-access"><Settings2 size={15} aria-hidden="true" />Управление доступом</Link>
        </div>
        {agents.length ? <div className="ws-agent-grid is-wide">
          {agents.map(agent => agent && <article key={agent.id} className="ws-card-block">
            <p className="ws-intro-meta"><LockKeyhole size={13} aria-hidden="true" /> {access.subject.role} · grant</p>
            <h3>{agent.name}</h3>
            <p>{agent.job}</p>
            <p className="ws-muted">{agent.description}</p>
          </article>)}
        </div> : <div className="ws-empty">
          <p><strong>Для текущего пользователя partner-agents не выданы.</strong></p>
          <p>Переключите demo-пользователя или grants в админке. В production роль должна приходить из доверенной identity-системы.</p>
        </div>}
      </section>
    </div>
  </main>;
}
