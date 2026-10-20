import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AgentAccessAdmin } from "@/components/admin/agent-access-admin";
import { getRequestAccessState } from "@/server/access/request-access";

export const dynamic = "force-dynamic";

export default async function AgentAccessAdminPage() {
  const access = await getRequestAccessState();
  return <main className="ws-main" id="ws-main">
    <div className="ws-page">
      <Link className="ws-back" href="/cardiology"><ArrowLeft size={15} aria-hidden="true" />В продукт</Link>
      <header className="ws-page-head">
        <p className="ws-intro-meta">B2D · admin · beta</p>
        <h1>Доступ к агентам</h1>
        <p>Один composer может быть одинаковым, но Supervisor получает только агентов, разрешённых конкретному workspace-пользователю. Здесь управляем demo-grants и проверяем разделение врач / фарма / редакция / администратор.</p>
        <p className="ws-muted"><ShieldCheck size={14} aria-hidden="true" /> Текущий режим: {access.previewMutable ? "Preview — demo overrides разрешены" : "Production/read-only — client overrides запрещены"}.</p>
      </header>
      <AgentAccessAdmin initialPolicy={access.policy} activeSubjectId={access.subject.id} mutable={access.previewMutable} />
      <section className="ws-section ws-card-block">
        <h2 className="ws-section-title">Production boundary</h2>
        <p>Этот экран уже задаёт правильный контракт subject → workspace → agent grants, но не заменяет SSO/RBAC. В production cookie impersonation отключён; следующий identity adapter должен возвращать тот же <code>AccessSubjectId</code> из доверенной серверной сессии.</p>
      </section>
    </div>
  </main>;
}
