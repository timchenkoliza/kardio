import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AgentAccessAdmin } from "@/components/admin/agent-access-admin";
import { getRequestAccessState } from "@/server/access/request-access";

export const dynamic = "force-dynamic";

export default async function AgentAccessAdminPage() {
  const access = await getRequestAccessState();
  return <div className="ws-app ws-app-standalone">
    <main className="ws-main" id="ws-main">
      <div className="ws-page">
        <Link className="ws-back" href="/cardiology"><ArrowLeft size={15} aria-hidden="true" />В рабочее пространство</Link>
        <header className="ws-page-head">
          <h1>Доступ к агентам</h1>
          <p>Какие агенты доступны врачу, фарма-партнёру, редакции и администратору.</p>
          {!access.previewMutable && <p className="ws-muted">Только просмотр: изменения доступа выполняются в системе учётных записей.</p>}
        </header>
        <AgentAccessAdmin initialPolicy={access.policy} activeSubjectId={access.subject.id} mutable={access.previewMutable} />
      </div>
    </main>
  </div>;
}
