import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings2 } from "lucide-react";
import { PharmaComposer } from "@/components/pharma/pharma-composer";
import { PlacementFormats } from "@/components/pharma/placement-formats";
import { BrandLockup } from "@/components/workspace/workspace-frame";
import { canUseAgentCapability } from "@/lib/access/agent-entitlements";
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
  const canRunStudio = canUseAgentCapability(access.policy, access.subject.id, "content_studio", "run");
  const canEditStudio = canUseAgentCapability(access.policy, access.subject.id, "content_studio", "edit_draft");
  const canUploadSource = canUseAgentCapability(access.policy, access.subject.id, "content_studio", "upload_source");
  const canRequestReview = canUseAgentCapability(access.policy, access.subject.id, "content_studio", "request_review");
  const workspaceId = contentStudioWorkspaceIdForSubject(access.subject.id);
  const sessionId = await pageSession(specialty);
  const initialPackages = sessionId && workspaceId
    ? await contentStudioStore().listPackages(sessionId, specialty, workspaceId)
    : [];
  const physicianView = access.subject.role === "physician" || access.subject.role === "admin";

  return <div className="ws-app ws-app-standalone" data-specialty={specialty}>
    <header className="ws-partner-bar">
      <BrandLockup specialty={specialty} href={physicianView ? `/${specialty}` : `/${specialty}/pharma`} />
      <span className="ws-partner-bar-label">Кабинет партнёра · {specialtyLabel[specialty]}</span>
      {access.subject.role === "admin" && <Link className="ws-text-link" href="/admin/agent-access"><Settings2 size={15} aria-hidden="true" />Доступ</Link>}
    </header>
    <main className="ws-main" id="ws-main">
      <div className="ws-page">
        <section className="ws-intro" aria-labelledby="pharma-title">
          <h1 id="pharma-title">Что подготовить для врачей?</h1>
          <p className="ws-intro-lead">Опишите задачу или вставьте материал. Студия контента подготовит форматы для Ленты и проверит медицинские утверждения по источникам до публикации.</p>
          {canRunStudio
            ? <PharmaComposer allowed={canRunStudio} canEdit={canEditStudio} canUploadSource={canUploadSource} canRequestReview={canRequestReview} specialty={specialty} initialPackages={initialPackages} />
            : <p className="ws-empty">Студия контента доступна фарма-партнёрам и редакции.</p>}
        </section>
        <PlacementFormats />
      </div>
    </main>
  </div>;
}
