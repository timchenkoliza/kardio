import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { PharmaComposer } from "@/components/pharma/pharma-composer";
import { visibleAgentsForRole } from "@/lib/access/agent-entitlements";
import { PHARMA_AGENT_DEFINITIONS } from "@/lib/pharma/agents";
import { isSpecialty } from "@/lib/specialty";
import { specialtyLabel } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

export default async function PharmaPartnerPage({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();

  const agentIds = visibleAgentsForRole("pharma", "partner_workspace");
  const agents = agentIds.map(id => id === "content_studio" ? PHARMA_AGENT_DEFINITIONS.content_studio : null).filter(Boolean);

  return <main className="ws-main" id="ws-main">
    <div className="ws-page">
      <Link className="ws-back" href={`/${specialty}`}><ArrowLeft size={15} aria-hidden="true" />Рабочее пространство врача</Link>

      <section className="ws-intro" aria-labelledby="pharma-title">
        <p className="ws-intro-meta">{specialtyLabel[specialty]} · кабинет фарма-партнёра · beta</p>
        <h1 id="pharma-title">Что хотите подготовить для врачей?</h1>
        <p className="ws-intro-lead">Один вход для задач партнёра. Доступные агенты определяются ролью: врач не видит коммерческие workflow, фарма не получает клинические персональные инструменты.</p>
        <PharmaComposer />
      </section>

      <section className="ws-section ws-card-block" aria-labelledby="pharma-access-title">
        <div className="ws-section-head">
          <div>
            <h2 id="pharma-access-title" className="ws-section-title">Доступные вам агенты</h2>
            <p className="ws-muted">В первой версии доступ задаётся централизованной entitlement-policy. Полноценная админка и серверная identity/ACL — следующий слой; этот preview не выдаёт текущую модель за security boundary.</p>
          </div>
        </div>
        <div className="ws-agent-grid is-wide">
          {agents.map(agent => agent && <article key={agent.id} className="ws-card-block">
            <p className="ws-intro-meta"><LockKeyhole size={13} aria-hidden="true" /> pharma · editorial · admin</p>
            <h3>{agent.name}</h3>
            <p>{agent.job}</p>
            <p className="ws-muted">{agent.description}</p>
          </article>)}
        </div>
      </section>
    </div>
  </main>;
}
