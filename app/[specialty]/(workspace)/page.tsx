import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, BellRing } from "lucide-react";
import { AgentCard } from "@/components/workspace/agent-card";
import { AgentComposer } from "@/components/workspace/agent-composer";
import { InterestsSetup } from "@/components/workspace/interests-setup";
import { CatchUpRunner } from "@/components/workspace/lifecycle";
import { ResultList } from "@/components/workspace/result-card";
import { agentHref } from "@/lib/agents/definitions";
import { countLabel, formatRelativeRu } from "@/lib/agents/format";
import { topicLabels } from "@/lib/agents/vocabulary";
import { isSpecialty } from "@/lib/specialty";
import { specialtyLabel } from "@/lib/ui/labels";
import { pageSession } from "@/server/agents/page-session";
import { getWorkspaceView } from "@/server/agents/workspace";

export const dynamic = "force-dynamic";

/** Old `?view=` deep links keep working: each maps to the job that replaced it. */
const LEGACY_VIEW_TARGETS: Record<string, string> = {
  feed: "",
  saved: "/materials",
  sources: "/settings#sources",
  drugs: "/agents/drugs",
  events: "/agents/events",
  education: "/agents/learning",
  tools: "/legacy?view=tools",
  reference: "/legacy?view=reference",
  referral: "/legacy?view=referral",
  consilium: "/legacy?view=consilium",
  imaging: "/legacy?view=imaging",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ params, searchParams }: { params: Promise<{ specialty: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  const query = await searchParams;
  const view = first(query.view);
  if (view && view !== "feed") redirect(`/${specialty}${LEGACY_VIEW_TARGETS[view] ?? ""}`);
  if (first(query.kind) || first(query.shell)) {
    const legacy = new URLSearchParams();
    for (const key of ["kind", "shell"]) { const value = first(query[key]); if (value) legacy.set(key, value); }
    redirect(`/${specialty}/legacy?${legacy.toString()}`);
  }
  const q = first(query.q)?.trim();
  if (q) redirect(`/${specialty}/agents/research?q=${encodeURIComponent(q)}`);

  const sessionId = await pageSession(specialty);
  const workspace = await getWorkspaceView(sessionId, specialty);
  const now = new Date().toISOString();
  const interests = topicLabels(specialty, workspace.profile.interests.topics);
  const digest = workspace.cards.find(card => card.agentId === "whats_new");
  const newTotal = digest?.newResults ?? 0;
  const previousVisit = workspace.profile.previousVisitAt;

  return <div className="ws-page ws-home">
    <CatchUpRunner enabled={workspace.configured && Boolean(sessionId)} />
    <section className="ws-hero" aria-labelledby="ws-hero-title">
      <div className="ws-hero-copy">
        <span className="ws-eyebrow is-inverse">{specialtyLabel[specialty]} · рабочее пространство врача</span>
        <h1 id="ws-hero-title">Что хотите делегировать?</h1>
        <p>Агенты выполняют профессиональные задачи по вашим темам и доверенным источникам. У каждого вывода — источник и статус проверки. Решения остаются за вами.</p>
        {workspace.configured && <p className="ws-hero-status">{newTotal ? `${countLabel(newTotal, ["новое обновление", "новых обновления", "новых обновлений"])} в ваших темах${previousVisit ? ` с визита ${formatRelativeRu(previousVisit)}` : ""}` : "С прошлого визита новых обновлений нет"} · темы: {interests.slice(0, 4).join(", ")}{interests.length > 4 ? ` и ещё ${interests.length - 4}` : ""}</p>}
      </div>
      <AgentComposer specialty={specialty} />
    </section>

    {workspace.pendingActions > 0 && <Link className="ws-pending-banner" href={`/${specialty}/agents`}><BellRing size={18} aria-hidden="true" /><span>{countLabel(workspace.pendingActions, ["действие ждёт", "действия ждут", "действий ждут"])} вашего подтверждения</span><ArrowRight size={16} aria-hidden="true" /></Link>}

    {!workspace.configured && <InterestsSetup specialty={specialty} interests={workspace.profile.interests} mode="onboarding" />}

    <section className="ws-section" aria-labelledby="ws-agents-title">
      <div className="ws-section-head">
        <div><h2 id="ws-agents-title" className="ws-section-title">Ваши агенты</h2><p className="ws-muted">Каждый агент делает одну работу и показывает, почему результат здесь.</p></div>
        <Link className="ws-text-link" href={`/${specialty}/agents`}>Настроить агентов<ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      <div className="ws-agent-grid">{workspace.cards.map(card => <AgentCard key={card.agentId} card={card} specialty={specialty} now={now} />)}</div>
    </section>

    <section className="ws-section" aria-labelledby="ws-recent-title">
      <div className="ws-section-head">
        <div><h2 id="ws-recent-title" className="ws-section-title">Последние результаты</h2><p className="ws-muted">Только то, что нашли ваши агенты. Сначала — новое с прошлого просмотра.</p></div>
      </div>
      <ResultList results={workspace.recentResults} specialty={specialty} emptyText={workspace.configured ? "Агенты ещё работают или пока ничего не нашли. Откройте агента, чтобы запустить его вручную." : "Выберите темы выше — агенты начнут работать и результаты появятся здесь."} />
      {workspace.recentResults.length > 0 && <p className="ws-more"><Link className="ws-text-link" href={agentHref(specialty, "whats_new")}>Вся сводка «Что нового для меня»<ArrowRight size={15} aria-hidden="true" /></Link></p>}
    </section>
  </div>;
}
