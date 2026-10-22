import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, BellRing } from "lucide-react";
import { countLabel, formatDateRu } from "@/lib/agents/format";
import { AGENT_ORDER } from "@/lib/agents/definitions";
import { isRunDue } from "@/lib/agents/profile";
import { topicsFor } from "@/lib/agents/vocabulary";
import type { SpecialtyId } from "@/lib/domain/types";
import { askHref, HOME_SHORTCUTS, JOBS } from "@/lib/portal/jobs";
import { GALLERY } from "@/lib/portal/agents-gallery";
import { getSpecialty, isSpecialty } from "@/lib/specialty";
import { CatchUpRunner } from "@/components/workspace/lifecycle";
import { ForYouList } from "@/components/portal/for-you";
import { Mascot } from "@/components/portal/mascot";
import { PortalInput } from "@/components/portal/portal-input";
import { TopicNudge } from "@/components/portal/topic-nudge";
import { pageSession } from "@/server/agents/page-session";
import { workspaceStore } from "@/server/agents/store";
import { catalogFor, loadProfile } from "@/server/agents/workspace";
import { buildForYou } from "@/server/portal/for-you";
import { nbsp } from "@/lib/ui/typography";
import { recordForYouRendered } from "@/server/portal/manager";

export const dynamic = "force-dynamic";

/** Old deep links keep working: each maps to the job that replaced it. */
const LEGACY_VIEW_TARGETS: Record<string, string> = {
  feed: "",
  saved: "/materials",
  sources: "/settings#sources",
  drugs: "/ask?job=drug",
  events: "/ask?job=events",
  education: "/ask?job=learning",
  tools: "/legacy?view=tools",
  reference: "/legacy?view=reference",
  referral: "/legacy?view=referral",
  consilium: "/legacy?view=consilium",
  imaging: "/legacy?view=imaging",
};

const EXAMPLES: Record<SpecialtyId, string[]> = {
  therapy: ["Длительность антибиотикотерапии при внебольничной пневмонии", "Аторвастатин: противопоказания", "Клинические рекомендации по ХОБЛ"],
  pediatrics: ["Острый средний отит у детей: когда показаны антибиотики", "Ибупрофен у детей: дозирование", "Рекомендации по бронхиолиту"],
  obgyn: ["Аспирин для профилактики преэклампсии", "Прогестерон при угрозе преждевременных родов", "Рекомендации по гестационному диабету"],
  cardiology: ["Что изменилось в рекомендациях по ХСН", "Апиксабан: противопоказания и взаимодействия", "ПОАК при фибрилляции предсердий у пожилых"],
  neurology: ["Профилактика мигрени у взрослых", "Леветирацетам при беременности", "Рекомендации по рассеянному склерозу"],
  endocrinology: ["Метформин при сниженной функции почек", "Семаглутид: противопоказания", "Рекомендации по лечению гипотиреоза"],
  oncology: ["Иммунотерапия рака лёгкого: систематические обзоры", "Поддерживающая терапия: что нового"],
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
  // Free text never travels in URLs; an old ?q= link opens the empty input instead.
  if (first(query.q)) redirect(askHref(specialty));

  const adapter = getSpecialty(specialty);
  const sessionId = await pageSession(specialty);
  const store = workspaceStore();
  const profile = await loadProfile(sessionId, specialty);
  const [results, runs, materials, actions, catalog] = await Promise.all([
    sessionId ? store.listResults(sessionId, specialty) : Promise.resolve([]),
    sessionId ? store.listRuns(sessionId, specialty, undefined, 120) : Promise.resolve([]),
    sessionId ? store.listMaterials(sessionId, specialty) : Promise.resolve([]),
    sessionId ? store.listActions(sessionId, specialty) : Promise.resolve([]),
    catalogFor(specialty),
  ]);
  const forYou = buildForYou({ specialty, profile, results, runs, materials, content: catalog.content });
  if (sessionId) await recordForYouRendered(sessionId, specialty, forYou);
  const now = new Date();
  // First visit (no session yet) or any due background check: «Для вас» is (re)built without any setup.
  const catchUpDue = !sessionId || AGENT_ORDER.some(agentId => isRunDue(profile, agentId, now));
  const pending = actions.filter(action => action.status === "pending_confirmation").length;
  const status = forYou.previousVisitAt
    ? `С прошлого визита ${formatDateRu(forYou.previousVisitAt, { day: "numeric", month: "long" }) ?? ""}: ${forYou.newCount ? countLabel(forYou.newCount, ["новый материал", "новых материала", "новых материалов"]) : "нового пока нет"}`
    : forYou.cards.some(card => card.showcase) ? "Свежие публикации и подборка редакции по специальности" : "Первый визит: последнее по специальности";

  return <div className="ws-page pt-home">
    <CatchUpRunner enabled={catchUpDue} />
    <section className="pt-hero" aria-labelledby="pt-title">
      <h1 id="pt-title">{nbsp(`Ответы и обновления — ${adapter.audienceDative}`)}</h1>
      <p className="pt-lead">{nbsp("Спросите своими словами: препарат, рекомендация, диагноз или тема. Ответ собирается из рекомендаций, обзоров и официальных инструкций — у каждого утверждения есть источник и дата.")}</p>
      <PortalInput specialty={specialty} examples={EXAMPLES[specialty]} />
      <nav className="pt-shortcuts" aria-label="Частые задачи">
        {HOME_SHORTCUTS.map(job => {
          const agent = GALLERY.find(item => item.job === job);
          return <Link key={job} className="pt-shortcut" href={askHref(specialty, { job })}>
            <span className="pt-shortcut-copy"><strong>{JOBS[job].label}</strong><span>{JOBS[job].promise}</span></span>
            {agent && <Mascot variant={agent.id} size={64} className="pt-shortcut-mascot" />}
            <span className="pt-shortcut-tip" aria-hidden="true">{agent?.help}</span>
          </Link>;
        })}
      </nav>
      <p className="pt-hero-more"><Link className="ws-text-link" href={`/${specialty}/agents`}>Все агенты: консилиум, мероприятия, ваши материалы<ArrowRight size={15} aria-hidden="true" /></Link></p>
    </section>

    {pending > 0 && <Link className="ws-pending-banner" href={`/${specialty}/agents`}><BellRing size={18} aria-hidden="true" /><span>{countLabel(pending, ["действие ждёт", "действия ждут", "действий ждут"])} вашего подтверждения</span><ArrowRight size={16} aria-hidden="true" /></Link>}

    <section className="ws-section pt-foryou" aria-labelledby="pt-foryou-title">
      <div className="ws-section-head">
        <div>
          <h2 id="pt-foryou-title" className="ws-section-title">{nbsp("Для вас")}</h2>
          <p className="ws-muted">{status}{forYou.topics.length ? ` · темы: ${forYou.topics.slice(0, 3).join(", ")}` : ""}</p>
        </div>
        <Link className="ws-text-link" href={`/${specialty}/settings`}>{forYou.topics.length ? "Изменить темы" : "Выбрать темы"}<ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      {forYou.cards.length
        ? <ForYouList cards={forYou.cards} />
        : <p className="ws-empty">{catchUpDue ? "Источники проверяются — подборка появится через несколько секунд." : `Свежих материалов по специальности «${adapter.name}» за последние две недели не нашлось. Задайте вопрос выше — ответ соберётся из источников.`}</p>}
      {!forYou.personalised && forYou.cards.length > 0 && <TopicNudge topics={topicsFor(specialty)} chosen={profile.interests.topics} trustedSources={profile.interests.trustedSources} />}
    </section>
  </div>;
}
