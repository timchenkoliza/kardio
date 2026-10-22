import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ClinicalToolsHub } from "@/components/clinical-tools-hub";
import { DrugIntelligenceWorkspace } from "@/components/drug-intelligence-workspace";
import { EditorialContentCard } from "@/components/editorial-content-card";
import { ExploreGenUiSurface } from "@/components/explore-gen-ui-surface";
import { OncologyPracticeSurface } from "@/components/oncology-practice-surface";
import { OncologyStarterSurface, type OncologyStarterFocus } from "@/components/oncology-starter-surface";
import { ProductFrame } from "@/components/product-frame";
import { ProductProvider } from "@/components/product-provider";
import { EventsHub, VmpHub } from "@/components/professional-destination-hubs";
import { ReferenceHub } from "@/components/reference-hub";
import { SectionHelp } from "@/components/section-help";
import { PracticeGenUiSurface } from "@/components/shell-gen-ui-surfaces";
import type { ContentObject, Shell, Source, SpecialtyId, UserState } from "@/lib/domain/types";
import { curatedSourcesForSpecialty } from "@/lib/ui/curated-external-tools";
import { contentKindFromView, feedKindLabel, isFeedKind, selectFeedContent, type FeedKindFilter } from "@/lib/ui/feed";
import { specialtyLabel } from "@/lib/ui/labels";
import { listContent, listSources } from "@/server/repositories/catalog";
import { readState, SESSION_COOKIE } from "@/server/services/state";

export const dynamic = "force-dynamic";

const feedTabs: FeedKindFilter[] = ["all", "guideline", "article", "video", "clinical"];

const viewTitles: Record<string, string> = {
  saved: "Мои материалы",
  sources: "Источники",
  tools: "Калькуляторы",
  drugs: "Препараты",
  consilium: "Консилиум",
  reference: "Справочник",
  imaging: "Визуализация",
  referral: "ВМП",
  events: "События",
  education: "Обучение",
};

const emptyCopy: Record<string, { title: string; body: string }> = {
  saved: { title: "Пока ничего не сохранено", body: "Сохраняйте материалы из ленты — они появятся здесь." },
  referral: { title: "Материалы по ВМП пока не добавлены", body: "Раздел появится, когда в каталоге будут проверенные маршруты и материалы по ВМП." },
  events: { title: "Событий пока нет", body: "Новые подтверждённые события появятся здесь после загрузки в каталог." },
  education: { title: "Обучающих материалов пока нет", body: "Курсы, лекции и другие проверенные материалы появятся здесь после загрузки в каталог." },
  sources: { title: "Источники пока не добавлены", body: "Проверенные профессиональные источники появятся здесь после загрузки в каталог." },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isSpecialty(value: string): value is SpecialtyId {
  return value === "cardiology" || value === "oncology";
}

function isShell(value: string | undefined): value is Shell {
  return value === "explore" || value === "practice" || value === "workspace";
}

function oncologyFocus(kind: FeedKindFilter): OncologyStarterFocus {
  if (kind === "guideline") return "guideline";
  if (kind === "article") return "evidence";
  if (kind === "video") return "learning";
  if (kind === "clinical") return "clinical";
  return "all";
}

/**
 * Frozen legacy interface (archive). Not linked from primary navigation.
 * Consilium, medical-image viewing and the clinical-case workspace shell are
 * retired from the product direction; their code stays in the repository.
 */
const RETIRED_VIEWS = new Set(["consilium", "imaging"]);

function RetiredSurface({ specialty, title }: { specialty: SpecialtyId; title: string }) {
  return <section className="empty-state retired-surface" aria-labelledby="retired-title">
    <span className="empty-state-mark" aria-hidden="true">—</span>
    <h1 id="retired-title">{title}: раздел выведен из продукта</h1>
    <p>Продукт развивается как рабочее пространство врача с агентами. Синтетический консилиум и интерпретация медицинских изображений в него не входят.</p>
    <Link className="secondary-button" href={`/${specialty}`}>Перейти в рабочее пространство</Link>
  </section>;
}

export default async function LegacyHome({
  params,
  searchParams,
}: {
  params: Promise<{ specialty: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { specialty: rawSpecialty } = await params;
  if (!isSpecialty(rawSpecialty)) notFound();
  // The frozen archive exists only for the specialties it was built for; its copy is cardiology/oncology-specific.
  if (rawSpecialty !== "cardiology" && rawSpecialty !== "oncology") redirect(`/${rawSpecialty}`);
  const specialty = rawSpecialty;
  const queryParams = await searchParams;
  const query = first(queryParams.q)?.trim() ?? "";
  const view = first(queryParams.view) ?? "feed";
  const kindParam = first(queryParams.kind);
  const kind: FeedKindFilter = isFeedKind(kindParam) ? kindParam : "all";
  const shellParam = first(queryParams.shell);

  const cookieStore = await cookies();
  const state = await readState(cookieStore.get(SESSION_COOKIE)?.value);
  const [content, sources] = await Promise.all([listContent(specialty), listSources(specialty)]);
  const requestedShell = isShell(shellParam) ? shellParam : state.shell;
  const activeShell: Shell = requestedShell === "workspace" ? "explore" : requestedShell;
  const initialState = { ...state, specialty, shell: activeShell };
  const rootHome = view === "feed" && !query && kind === "all";

  return <ProductProvider initialState={initialState} specialty={specialty}>
    <ProductFrame specialty={specialty}>
      <div className="alpha-shell">
        {rootHome && initialState.shell === "practice" ? (
          specialty === "cardiology" ? <PracticeGenUiSurface specialty={specialty} content={content} sources={sources} state={initialState} /> : <OncologyPracticeSurface />
        ) : RETIRED_VIEWS.has(view) ? (
          <RetiredSurface specialty={specialty} title={viewTitles[view] ?? "Раздел"} />
        ) : (
          <ExploreOrCatalogHome specialty={specialty} content={content} sources={sources} state={initialState} query={query} view={view} kind={kind} />
        )}
      </div>
    </ProductFrame>
  </ProductProvider>;
}

function ExploreOrCatalogHome({
  specialty,
  content,
  sources,
  state,
  query,
  view,
  kind,
}: {
  specialty: SpecialtyId;
  content: ContentObject[];
  sources: Source[];
  state: UserState;
  query: string;
  view: string;
  kind: FeedKindFilter;
}) {
  if (view === "tools") return <ClinicalToolsHub specialty={specialty} />;
  if (view === "drugs") return <DrugIntelligenceWorkspace specialty={specialty} />;
  if (view === "reference") return <ReferenceHub specialty={specialty} />;
  if (view === "events") return <EventsHub specialty={specialty} content={content} />;
  if (view === "referral") return <VmpHub specialty={specialty} />;

  const viewKind = contentKindFromView(view);
  let visible = selectFeedContent({
    content,
    query,
    kind: viewKind ? (viewKind as FeedKindFilter) : kind,
    savedIds: state.savedIds,
    savedOnly: view === "saved",
  });
  if (view === "education") visible = selectFeedContent({ content: content.filter(item => item.kind === "video" || item.tags.some(tag => /курс|лекц|образован/i.test(tag))), query, savedIds: state.savedIds });
  if (view === "sources") visible = [];

  const featured = visible[0] ?? null;
  const rest = visible.slice(1, 10);
  const currentCount = content.filter(item => item.currentness === "current").length;
  const reviewCount = content.filter(item => item.currentness === "review").length;
  const isFeedCatalog = view === "feed" && !query;
  const isExploreHome = isFeedCatalog && kind === "all";
  const isOncologyStarter = specialty === "oncology" && content.length === 0 && isFeedCatalog;
  const isOncologyEducationStart = specialty === "oncology" && content.length === 0 && view === "education" && !query;
  const pageTitle = query ? "Поиск" : viewTitles[view] ?? (kind !== "all" ? feedKindLabel(kind) : isExploreHome ? "Обзор" : "Материалы");

  return <>
    <section className="feed-intro explore-intro" aria-labelledby="feed-title">
      <div>
        <span className="eyebrow">{specialtyLabel[specialty]}{isExploreHome ? " · Обзор" : ""}</span>
        <div className="heading-with-help"><h1 id="feed-title">{pageTitle}</h1><SectionHelp text={isExploreHome ? "Обзор помогает находить новое. Порядок блоков строится по явным признакам каталога и вашим настройкам интерфейса, без данных пациента." : "Раздел показывает только объекты выбранного типа или запроса из текущего каталога."} /></div>
        <p>{query ? `По запросу «${query}»` : specialty === "cardiology" ? "Новые темы, проверяемые материалы и понятные пути к первоисточникам." : "Проверенные внешние точки входа сейчас; собственный каталог специальности — по мере отдельной верифицированной загрузки."}</p>
      </div>
      {specialty === "cardiology" && isExploreHome && <div className="feed-trust-summary" aria-label="Состояние каталога"><span><strong>{content.length}</strong> материалов</span><span><strong>{currentCount}</strong> актуальных</span>{reviewCount > 0 && <span><strong>{reviewCount}</strong> требуют проверки</span>}</div>}
    </section>

    {isFeedCatalog && <nav className="feed-tabs" aria-label="Разделы обзора">{feedTabs.map(tab => <Link key={tab} className={kind === tab ? "feed-tab active" : "feed-tab"} href={`/${specialty}/legacy${tab === "all" ? `?shell=${state.shell}` : `?kind=${tab}&shell=${state.shell}`}`}>{feedKindLabel(tab)}</Link>)}</nav>}

    {view === "sources" ? (
      <SourceDirectory specialty={specialty} sources={sources} />
    ) : isOncologyStarter ? (
      <OncologyStarterSurface focus={oncologyFocus(kind)} />
    ) : isOncologyEducationStart ? (
      <OncologyStarterSurface focus="learning" showIntro={false} />
    ) : isExploreHome && visible.length ? (
      <ExploreGenUiSurface specialty={specialty} content={content} sources={sources} />
    ) : visible.length ? (
      <div className="feed-layout explore-layout">
        <section className="editorial-feed" aria-label="Материалы">
          {featured && <EditorialContentCard content={featured} specialty={specialty} featured position={1} />}
          <div className="editorial-stream">{rest.map((item, index) => <EditorialContentCard key={item.id} content={item} specialty={specialty} position={index + 2} />)}</div>
        </section>
      </div>
    ) : (
      <EmptyState specialty={specialty} view={view} query={query} />
    )}
  </>;
}

function SourceDirectory({ specialty, sources }: { specialty: SpecialtyId; sources: Source[] }) {
  const curated = curatedSourcesForSpecialty(specialty);
  const canonicalUrls = new Set(sources.flatMap(source => [source.url?.toLowerCase(), source.name.toLowerCase()].filter((value): value is string => Boolean(value))));
  const extras = curated.filter(source => !canonicalUrls.has(source.url.toLowerCase()) && !canonicalUrls.has(source.name.toLowerCase()));
  return <section className="source-directory" aria-label="Каталог источников">
    {sources.map(source => <article className="source-row" key={source.id}><span className="source-mark large" aria-hidden="true">{source.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</span><div><h2>{source.name}</h2><p>{source.publisher ?? source.type}</p></div>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">Открыть источник <ArrowRight size={15} /></a> : <span className="muted">Ссылка не указана</span>}</article>)}
    {extras.map(source => <article className="source-row" key={`curated:${source.id}`}><span className="source-mark large" aria-hidden="true">{source.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</span><div><h2>{source.name}</h2><p>{source.category} · {source.note}</p></div><a href={source.url} target="_blank" rel="noreferrer">Открыть источник <ArrowRight size={15} /></a></article>)}
    {sources.length === 0 && extras.length === 0 && <EmptyState specialty={specialty} view="sources" />}
  </section>;
}

function EmptyState({ specialty, view, query }: { specialty: SpecialtyId; view: string; query?: string }) {
  const oncology = specialty === "oncology";
  const copy = emptyCopy[view] ?? { title: "Материалов пока нет", body: "Новые проверенные материалы появятся здесь после загрузки в каталог." };
  return <section className="empty-state"><span className="empty-state-mark" aria-hidden="true">{query ? "⌕" : "—"}</span><h2>{query ? "Ничего не найдено" : oncology ? "В собственном каталоге раздел пока пуст" : copy.title}</h2><p>{query ? "Попробуйте более короткий запрос или название темы." : oncology ? "Внешние профессиональные источники доступны в основных разделах, а материалы внутреннего каталога появятся после отдельной проверки." : copy.body}</p><Link className="secondary-button" href={`/${specialty}/legacy`}>{view === "saved" ? "Перейти к обзору" : "Вернуться к обзору"}</Link></section>;
}
