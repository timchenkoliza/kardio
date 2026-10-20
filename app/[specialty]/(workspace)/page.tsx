import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, BellRing } from "lucide-react";
import { AgentCard } from "@/components/workspace/agent-card";
import { AgentComposer } from "@/components/workspace/agent-composer";
import { InterestsSetup } from "@/components/workspace/interests-setup";
import { CatchUpRunner } from "@/components/workspace/lifecycle";
import { HelpTip } from "@/components/workspace/help-tip";
import { HomeFeedList } from "@/components/workspace/home-feed";
import { agentHref } from "@/lib/agents/definitions";
import { countLabel, formatRelativeRu } from "@/lib/agents/format";
import { topicLabels } from "@/lib/agents/vocabulary";
import { isSpecialty } from "@/lib/specialty";
import { pageSession } from "@/server/agents/page-session";
import { getHomeFeed } from "@/server/agents/home-feed";
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

  const feed = await getHomeFeed(specialty, workspace.profile, workspace.recentResults);

  return <div className="ws-page ws-home">
    <CatchUpRunner enabled={workspace.configured && Boolean(sessionId)} />
    <section className="ws-feed-head" aria-labelledby="ws-hero-title">
      <h1 id="ws-hero-title">Что нового для вас</h1>
      {workspace.configured
        ? <p className="ws-intro-status">{newTotal ? `${countLabel(newTotal, ["новый материал", "новых материала", "новых материалов"])}${previousVisit ? ` с визита ${formatRelativeRu(previousVisit)}` : ""} · ` : ""}Темы: {interests.slice(0, 4).join(", ")}{interests.length > 4 ? ` и ещё ${interests.length - 4}` : ""} · <Link className="ws-text-link" href={`/${specialty}/settings`}>Изменить</Link></p>
        : <p className="ws-intro-status"><a className="ws-text-link" href="#ws-setup">Выбрать темы</a></p>}
    </section>

    {workspace.pendingActions > 0 && <Link className="ws-pending-banner" href={`/${specialty}/agents`}><BellRing size={18} aria-hidden="true" /><span>{countLabel(workspace.pendingActions, ["действие ждёт", "действия ждут", "действий ждут"])} вашего подтверждения</span><ArrowRight size={16} aria-hidden="true" /></Link>}

    <section className="ws-section" aria-label="Лента «Что нового для вас»">
      <HomeFeedList feed={feed} specialty={specialty} />
      {workspace.recentResults.length > 0 && <p className="ws-more"><Link className="ws-text-link" href={agentHref(specialty, "whats_new")}>Вся сводка «Что нового для меня»<ArrowRight size={15} aria-hidden="true" /></Link></p>}
    </section>

    <section className="ws-section ws-delegate" aria-labelledby="ws-delegate-title">
      <h2 id="ws-delegate-title" className="ws-section-title">Поручить задачу агенту <HelpTip label="Агент">Агент делает одну работу: следит за рекомендациями, препаратами и событиями, ищет данные в источниках или в ваших файлах. У каждого вывода есть источник и статус проверки, решение остаётся за вами.</HelpTip></h2>
      <AgentComposer specialty={specialty} compact />
    </section>

    {!workspace.configured && <div id="ws-setup"><InterestsSetup specialty={specialty} interests={workspace.profile.interests} mode="onboarding" /></div>}

    <section className="ws-section" aria-labelledby="ws-agents-title">
      <div className="ws-section-head">
        <h2 id="ws-agents-title" className="ws-section-title">Ваши агенты <HelpTip label="Ваши агенты">Агенты работают по темам и источникам из настроек. На карточке — что агент нашёл с вашего прошлого визита.</HelpTip></h2>
        <Link className="ws-text-link" href={`/${specialty}/agents`}>Настроить агентов<ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      <div className="ws-agent-grid">{workspace.cards.map(card => <AgentCard key={card.agentId} card={card} specialty={specialty} now={now} />)}</div>
    </section>
  </div>;
}
