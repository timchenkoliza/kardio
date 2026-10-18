import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowRight, Bookmark, BookOpen, CalendarDays, Calculator, Clock, FolderOpen, Library, Pin, Search } from "lucide-react";
import { ClinicalToolsHub, ImagingWorkspace } from "@/components/clinical-tools-hub";
import { EditorialContentCard } from "@/components/editorial-content-card";
import { GenUiStack } from "@/components/gen-ui-stack";
import { ProductFrame } from "@/components/product-frame";
import { ProductProvider } from "@/components/product-provider";
import { EventsHub, VmpHub } from "@/components/professional-destination-hubs";
import { ReferenceHub } from "@/components/reference-hub";
import { SectionHelp } from "@/components/section-help";
import { WorkspaceResearchAgent } from "@/components/workspace-research-agent";
import type { ContentObject, Source, SpecialtyId, UserState } from "@/lib/domain/types";
import { curatedSourcesForSpecialty } from "@/lib/ui/curated-external-tools";
import { contentKindFromView, feedKindLabel, isFeedKind, selectFeedContent, type FeedKindFilter } from "@/lib/ui/feed";
import { kindLabel, specialtyLabel } from "@/lib/ui/labels";
import { buildPracticeHomeModel, buildWorkspaceHomeModel } from "@/lib/ui/shell-model";
import { listContent, listSources } from "@/server/repositories/catalog";
import { readState, SESSION_COOKIE } from "@/server/services/state";

export const dynamic = "force-dynamic";

const feedTabs: FeedKindFilter[] = ["all", "guideline", "article", "video", "clinical"];

const viewTitles: Record<string, string> = {
  saved: "Мои материалы",
  sources: "Источники",
  tools: "Калькуляторы",
  reference: "Справочник",
  imaging: "Визуализация",
  referral: "ВМП",
  events: "События",
  education: "Обучение",
};

const emptyCopy: Record<string, { title: string; body: string }> = {
  saved: {
    title: "Пока ничего не сохранено",
    body: "Сохраняйте материалы из ленты — они появятся здесь.",
  },
  referral: {
    title: "Материалы по ВМП пока не добавлены",
    body: "Раздел появится, когда в каталоге будут проверенные маршруты и материалы по ВМП.",
  },
  events: {
    title: "Событий пока нет",
    body: "Новые подтверждённые события появятся здесь после загрузки в каталог.",
  },
  education: {
    title: "Обучающих материалов пока нет",
    body: "Курсы, лекции и другие проверенные материалы появятся здесь после загрузки в каталог.",
  },
  sources: {
    title: "Источники пока не добавлены",
    body: "Проверенные профессиональные источники появятся здесь после загрузки в каталог.",
  },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isSpecialty(value: string): value is SpecialtyId {
  return value === "cardiology" || value === "oncology";
}

export default async function SpecialtyHome({
  params,
  searchParams,
}: {
  params: Promise<{ specialty: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { specialty: rawSpecialty } = await params;
  if (!isSpecialty(rawSpecialty)) notFound();
  const specialty = rawSpecialty;
  const queryParams = await searchParams;
  const query = first(queryParams.q)?.trim() ?? "";
  const view = first(queryParams.view) ?? "feed";
  const kindParam = first(queryParams.kind);
  const kind: FeedKindFilter = isFeedKind(kindParam) ? kindParam : "all";

  const cookieStore = await cookies();
  const state = await readState(cookieStore.get(SESSION_COOKIE)?.value);
  const [content, sources] = await Promise.all([listContent(specialty), listSources(specialty)]);
  const initialState = { ...state, specialty };
  const rootHome = view === "feed" && !query && kind === "all";

  return (
    <ProductProvider initialState={initialState} specialty={specialty}>
      <ProductFrame specialty={specialty}>
        <div className="alpha-shell">
          {rootHome && specialty === "cardiology" && state.shell === "practice" ? (
            <PracticeHome specialty={specialty} content={content} sources={sources} state={initialState} />
          ) : rootHome && specialty === "cardiology" && state.shell === "workspace" ? (
            <WorkspaceHome specialty={specialty} content={content} sources={sources} state={initialState} />
          ) : (
            <ExploreOrCatalogHome specialty={specialty} content={content} sources={sources} state={initialState} query={query} view={view} kind={kind} />
          )}
        </div>
      </ProductFrame>
    </ProductProvider>
  );
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
  if (view === "reference") return <ReferenceHub specialty={specialty} />;
  if (view === "imaging") return <ImagingWorkspace specialty={specialty} />;
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
  const pageTitle = query ? "Поиск" : viewTitles[view] ?? (kind !== "all" ? feedKindLabel(kind) : isExploreHome ? "Лента" : "Материалы");

  return <>
    <section className="feed-intro explore-intro" aria-labelledby="feed-title">
      <div>
        <span className="eyebrow">{specialtyLabel[specialty]}{isExploreHome ? " · Обзор" : ""}</span>
        <div className="heading-with-help">
          <h1 id="feed-title">{pageTitle}</h1>
          <SectionHelp text={isExploreHome ? "Обзор помогает находить новое: материалы ранжируются детерминированно по каталогу, без персональных данных пациента." : "Раздел показывает только объекты выбранного типа или запроса из текущего каталога."} />
        </div>
        <p>{query ? `По запросу «${query}»` : specialty === "cardiology" ? "Новые темы, проверяемые материалы и понятные пути к первоисточникам." : "Отдельное пространство специальности. Контент появится только после собственной верифицированной загрузки."}</p>
      </div>
      {specialty === "cardiology" && isExploreHome && (
        <div className="feed-trust-summary" aria-label="Состояние каталога">
          <span><strong>{content.length}</strong> материалов</span>
          <span><strong>{currentCount}</strong> актуальных</span>
          {reviewCount > 0 && <span><strong>{reviewCount}</strong> требуют проверки</span>}
        </div>
      )}
    </section>

    {isFeedCatalog && specialty === "cardiology" && (
      <nav className="feed-tabs" aria-label="Разделы ленты">
        {feedTabs.map(tab => (
          <Link key={tab} className={kind === tab ? "feed-tab active" : "feed-tab"} href={`/${specialty}${tab === "all" ? "" : `?kind=${tab}`}`}>
            {feedKindLabel(tab)}
          </Link>
        ))}
      </nav>
    )}

    {view === "sources" ? (
      <SourceDirectory specialty={specialty} sources={sources} />
    ) : visible.length ? (
      <div className="feed-layout explore-layout">
        <section className="editorial-feed" aria-label="Материалы">
          {featured && <EditorialContentCard content={featured} specialty={specialty} featured position={1} />}
          <div className="editorial-stream">
            {rest.map((item, index) => <EditorialContentCard key={item.id} content={item} specialty={specialty} position={index + 2} />)}
          </div>
        </section>

        {isExploreHome && (
          <aside className="context-rail" aria-label="Быстрый доступ">
            <div className="context-module">
              <span className="eyebrow">Куда дальше</span>
              <div className="heading-with-help"><h2>Исследовать</h2><SectionHelp text="Быстрые маршруты в соседние разделы каталога. Они не меняют ваши сохранения и рабочий режим." /></div>
              <div className="quick-job-list">
                <Link href={`/${specialty}?kind=guideline`}><BookOpen size={18} /><span><strong>Рекомендации</strong><small>Текущие версии и архив</small></span><ArrowRight size={16} /></Link>
                <Link href={`/${specialty}?view=events`}><CalendarDays size={18} /><span><strong>События</strong><small>Только подтверждённые объекты каталога</small></span><ArrowRight size={16} /></Link>
                <Link href={`/${specialty}?view=sources`}><Library size={18} /><span><strong>Источники</strong><small>{sources.length} в каталоге</small></span><ArrowRight size={16} /></Link>
              </div>
            </div>
            <div className="context-module quiet-module">
              <Search size={20} aria-hidden="true" />
              <div className="heading-with-help"><h2>Ищите по теме</h2><SectionHelp text="Поиск учитывает заголовки, темы, источники и описания; результат остаётся объяснимым и детерминированным." /></div>
              <p>Поиск работает по заголовкам, темам, источникам и описаниям. Результат остаётся объяснимым и детерминированным.</p>
            </div>
          </aside>
        )}
      </div>
    ) : (
      <EmptyState specialty={specialty} view={view} query={query} />
    )}
  </>;
}

function PracticeHome({ specialty, content, sources, state }: { specialty: SpecialtyId; content: ContentObject[]; sources: Source[]; state: UserState }) {
  const model = buildPracticeHomeModel(content, state, specialty);
  const personal = model.pinned.length ? model.pinned : model.recent.length ? model.recent : model.saved;
  const blocks = [
    {
      id: "practice-launcher",
      label: "Быстрые инструменты",
      content: <section className="practice-launcher" aria-label="Рабочие задачи">
        <Link href={`/${specialty}?kind=guideline`}><BookOpen size={22} /><span><strong>Рекомендации</strong><small>Открыть текущие версии</small></span><ArrowRight size={17} /></Link>
        <Link href={`/${specialty}?view=tools`}><Calculator size={22} /><span><strong>Калькуляторы</strong><small>Две кардиологические шкалы</small></span><ArrowRight size={17} /></Link>
        <Link href={`/${specialty}?view=reference`}><Search size={22} /><span><strong>Справочник</strong><small>Лекарства и взаимодействия</small></span><ArrowRight size={17} /></Link>
        <Link href={`/${specialty}?view=referral`}><ArrowRight size={22} /><span><strong>ВМП</strong><small>Официальные документы и навигация</small></span><ArrowRight size={17} /></Link>
      </section>,
    },
    {
      id: "practice-current",
      label: "Рекомендации и личное",
      content: <div className="practice-columns">
        <section className="practice-primary" aria-labelledby="guidelines-title">
          <div className="mode-section-heading"><div><span className="eyebrow">Сейчас под рукой</span><div className="heading-with-help"><h2 id="guidelines-title">Текущие рекомендации</h2><SectionHelp text="Здесь только текущие клинические рекомендации из каталога; архивные и заменённые версии не поднимаются в этот блок." /></div></div><Link href={`/${specialty}?kind=guideline`}>Все рекомендации <ArrowRight size={15} /></Link></div>
          {model.currentGuidelines.length ? <div className="mode-row-list">{model.currentGuidelines.map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} />)}</div> : <ModeInlineEmpty text="В каталоге пока нет текущих рекомендаций." />}
        </section>
        <aside className="practice-personal" aria-label="Ваш быстрый доступ">
          <div className="mode-section-heading compact"><div><span className="eyebrow">Личное</span><div className="heading-with-help"><h2>{model.pinned.length ? "Закреплено" : model.recent.length ? "Недавнее" : "Сохранено"}</h2><SectionHelp text="Приоритет: закреплённое → недавно открытое → сохранённое. Это ваш собственный слой, а не редакционная рекомендация." /></div></div></div>
          {personal.length ? <div className="personal-shortlist">{personal.slice(0, 4).map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} compact />)}</div> : <ModeInlineEmpty text="Здесь появятся материалы, которые вы закрепите, сохраните или недавно открывали." />}
          <Link className="secondary-button practice-saved-link" href={`/${specialty}?view=saved`}><Bookmark size={15} /> Мои материалы</Link>
        </aside>
      </div>,
    },
    ...(model.taskObjects.length > 0 ? [{
      id: "practice-catalog-tools",
      label: "Рабочие объекты каталога",
      content: <section className="practice-tools" aria-labelledby="practice-tools-title"><div className="mode-section-heading"><div><span className="eyebrow">Инструменты</span><div className="heading-with-help"><h2 id="practice-tools-title">Рабочие объекты каталога</h2><SectionHelp text="Только явно загруженные инструменты, справочные объекты и маршруты. Никаких сгенерированных формул или пациентских рекомендаций." /></div></div></div><div className="mode-row-list">{model.taskObjects.map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} />)}</div></section>,
    }] : []),
  ];

  return <div className="practice-home">
    <section className="mode-hero practice-hero" aria-labelledby="practice-title">
      <div>
        <span className="eyebrow">{specialtyLabel[specialty]} · Практика</span>
        <div className="heading-with-help"><h1 id="practice-title">Рабочий стол врача</h1><SectionHelp text="Практика собрана вокруг повторяемых рабочих задач: сначала актуальные рекомендации и инструменты, затем ваш личный быстрый доступ." /></div>
        <p>Не лента новостей: быстрый вход в текущие рекомендации, инструменты и то, что вы сами закрепили для повторной работы.</p>
      </div>
      <div className="mode-stats" aria-label="Рабочее состояние">
        <span><strong>{model.currentGuidelines.length}</strong> текущих рекомендаций</span>
        <span><strong>{model.taskObjects.length}</strong> инструментов каталога</span>
        <span><strong>{model.pinned.length}</strong> закреплено</span>
      </div>
    </section>
    <GenUiStack specialty={specialty} shell="practice" blocks={blocks} />
    <p className="mode-footnote">Источники в каталоге: {sources.length}. Практика не использует данные пациента и не пытается угадывать контекст приёма.</p>
  </div>;
}

function WorkspaceHome({ specialty, content, sources, state }: { specialty: SpecialtyId; content: ContentObject[]; sources: Source[]; state: UserState }) {
  const model = buildWorkspaceHomeModel(content, state, specialty);
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const followedSources = model.followedSourceIds.map(id => sourceById.get(id)).filter((source): source is Source => Boolean(source));
  const pinnedSources = model.pinnedSourceIds.map(id => sourceById.get(id)).filter((source): source is Source => Boolean(source));

  return <div className="workspace-home">
    <section className="mode-hero workspace-hero" aria-labelledby="workspace-title">
      <div>
        <span className="eyebrow">{specialtyLabel[specialty]} · Рабочее пространство</span>
        <div className="heading-with-help"><h1 id="workspace-title">Ваши материалы и контекст</h1><SectionHelp text="Рабочее пространство строится только из ваших действий: сохранений, закреплений, подборок, тем, истории и явно заданных интересов." /></div>
        <p>Сохраняйте свои материалы, интересы и профессиональные вопросы. Агент помогает собирать маршрут по теме, не превращая пространство в ещё одну общую ленту.</p>
      </div>
      <div className="mode-stats" aria-label="Состояние пространства">
        <span><strong>{model.saved.length}</strong> сохранено</span>
        <span><strong>{model.collections.length}</strong> подборок</span>
        <span><strong>{model.researchInterests.length + model.followedTopics.length}</strong> тем</span>
      </div>
    </section>

    <WorkspaceResearchAgent specialty={specialty} content={content} />

    {!model.hasOwnedState ? (
      <section className="workspace-empty">
        <div className="workspace-empty-icon"><FolderOpen size={28} /></div>
        <span className="eyebrow">Пока пусто</span>
        <div className="heading-with-help"><h2>Рабочее пространство начинается с ваших действий</h2><SectionHelp text="Пустое состояние намеренное: сюда не подмешивается общий каталог, пока вы сами не зададите контекст." /></div>
        <p>Добавьте интересующую нозологию выше, сохраните материал или закрепите нужное. Мы не подставляем сюда случайные статьи.</p>
        <div className="workspace-empty-actions"><Link className="primary-source-button" href={`/${specialty}`}>Перейти в обзор <ArrowRight size={15} /></Link><Link className="secondary-button" href={`/${specialty}?view=saved`}>Мои материалы</Link></div>
      </section>
    ) : (
      <div className="workspace-board">
        {model.pinned.length > 0 && <WorkspaceSection title="Закреплено" eyebrow="Всегда под рукой" help="Материалы, которые вы явно закрепили для быстрого возврата." icon={<Pin size={18} />}><div className="mode-row-list">{model.pinned.map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} compact />)}</div></WorkspaceSection>}
        {model.collections.length > 0 && <WorkspaceSection title="Подборки" eyebrow="Ваши наборы" help="Пользовательские наборы материалов. Состав определяется только вами." icon={<FolderOpen size={18} />}><div className="collection-list">{model.collections.map(collection => <article key={collection.id} className="collection-card"><div><strong>{collection.name}</strong><span>{collection.items.length} материалов</span></div>{collection.items.length > 0 ? <div className="collection-preview">{collection.items.slice(0, 3).map(item => <Link key={item.id} href={`/${specialty}/content/${encodeURIComponent(item.id)}`}>{item.title}</Link>)}</div> : <p>Подборка пока пустая.</p>}</article>)}</div></WorkspaceSection>}
        {model.saved.length > 0 && <WorkspaceSection title="Сохранено" eyebrow="Ваш архив" help="Все материалы, которые вы сохранили из каталога." icon={<Bookmark size={18} />}><div className="mode-row-list">{model.saved.slice(0, 8).map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} compact />)}</div></WorkspaceSection>}
        {model.recent.length > 0 && <WorkspaceSection title="Недавнее" eyebrow="Продолжить работу" help="Недавно открытые материалы из вашей локальной истории работы." icon={<Clock size={18} />}><div className="mode-row-list">{model.recent.map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} compact />)}</div></WorkspaceSection>}
        {(model.researchInterests.length > 0 || model.followedTopics.length > 0 || followedSources.length > 0 || pinnedSources.length > 0 || model.recentQueries.length > 0) && <WorkspaceSection title="Контекст" eyebrow="Явно выбранное" help="Темы, нозологии, источники и запросы, которые формируют ваш персональный рабочий контекст." icon={<Library size={18} />}><div className="workspace-context-groups">{model.researchInterests.length > 0 && <div><strong>Интересы и нозологии</strong><div className="workspace-chips">{model.researchInterests.map(interest => <span key={interest}>{interest}</span>)}</div></div>}{model.followedTopics.length > 0 && <div><strong>Темы</strong><div className="workspace-chips">{model.followedTopics.map(topic => <Link key={topic} href={`/${specialty}?q=${encodeURIComponent(topic)}`}>{topic}</Link>)}</div></div>}{[...pinnedSources, ...followedSources].length > 0 && <div><strong>Источники</strong><div className="workspace-chips">{[...pinnedSources, ...followedSources].filter((source, index, array) => array.findIndex(item => item.id === source.id) === index).map(source => <span key={source.id}>{source.name}</span>)}</div></div>}{model.recentQueries.length > 0 && <div><strong>Недавние запросы</strong><div className="workspace-chips">{model.recentQueries.map(query => <Link key={query} href={`/${specialty}?q=${encodeURIComponent(query)}`}>{query}</Link>)}</div></div>}</div></WorkspaceSection>}
      </div>
    )}
  </div>;
}

function ModeContentRow({ item, specialty, compact = false }: { item: ContentObject; specialty: SpecialtyId; compact?: boolean }) {
  return <article className={compact ? "mode-content-row compact" : "mode-content-row"}>
    <div className="mode-content-mark" aria-hidden="true">{item.source.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</div>
    <div className="mode-content-copy"><span>{item.source.name} · {kindLabel[item.kind]}</span><Link href={`/${specialty}/content/${encodeURIComponent(item.id)}`}>{item.title}</Link>{!compact && item.summary && <p>{item.summary}</p>}</div>
    <Link className="mode-row-open" href={`/${specialty}/content/${encodeURIComponent(item.id)}`} aria-label={`Открыть: ${item.title}`}><ArrowRight size={16} /></Link>
  </article>;
}

function WorkspaceSection({ title, eyebrow, help, icon, children }: { title: string; eyebrow: string; help: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="workspace-section"><div className="workspace-section-head"><div className="workspace-section-icon">{icon}</div><div><span className="eyebrow">{eyebrow}</span><div className="heading-with-help"><h2>{title}</h2><SectionHelp text={help} /></div></div></div>{children}</section>;
}

function ModeInlineEmpty({ text }: { text: string }) {
  return <div className="mode-inline-empty">{text}</div>;
}

function SourceDirectory({ specialty, sources }: { specialty: SpecialtyId; sources: Source[] }) {
  const curated = curatedSourcesForSpecialty(specialty);
  const canonicalUrls = new Set(sources.flatMap(source => [source.url?.toLowerCase(), source.name.toLowerCase()].filter((value): value is string => Boolean(value))));
  const extras = curated.filter(source => !canonicalUrls.has(source.url.toLowerCase()) && !canonicalUrls.has(source.name.toLowerCase()));
  return <section className="source-directory" aria-label="Каталог источников">
    {sources.map(source => (
      <article className="source-row" key={source.id}>
        <span className="source-mark large" aria-hidden="true">{source.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</span>
        <div><h2>{source.name}</h2><p>{source.publisher ?? source.type}</p></div>
        {source.url ? <a href={source.url} target="_blank" rel="noreferrer">Открыть источник <ArrowRight size={15} /></a> : <span className="muted">Ссылка не указана</span>}
      </article>
    ))}
    {extras.map(source => <article className="source-row" key={`curated:${source.id}`}><span className="source-mark large" aria-hidden="true">{source.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</span><div><h2>{source.name}</h2><p>{source.category} · {source.note}</p></div><a href={source.url} target="_blank" rel="noreferrer">Открыть источник <ArrowRight size={15} /></a></article>)}
    {sources.length === 0 && extras.length === 0 && <EmptyState specialty={specialty} view="sources" />}
  </section>;
}

function EmptyState({ specialty, view, query }: { specialty: SpecialtyId; view: string; query?: string }) {
  const oncology = specialty === "oncology";
  const copy = emptyCopy[view] ?? { title: "Материалов пока нет", body: "Новые проверенные материалы появятся здесь после загрузки в каталог." };
  return (
    <section className="empty-state">
      <span className="empty-state-mark" aria-hidden="true">{query ? "⌕" : "—"}</span>
      <h2>{query ? "Ничего не найдено" : oncology ? "Онкология пока без канонического набора" : copy.title}</h2>
      <p>{query ? "Попробуйте более короткий запрос или название темы." : oncology ? "Мы не подменяем онкологию кардиологическими материалами. Раздел наполнится после собственной проверенной загрузки." : copy.body}</p>
      <Link className="secondary-button" href={`/${specialty}`}>{view === "saved" ? "Перейти в ленту" : "Вернуться на главную"}</Link>
    </section>
  );
}
