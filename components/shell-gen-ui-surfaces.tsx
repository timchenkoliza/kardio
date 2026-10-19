import Link from "next/link";
import { ArrowRight, Bookmark, BookOpen, CalendarDays, Calculator, Clock, FolderOpen, Library, Pin, Search, Sparkles } from "lucide-react";
import type { ContentObject, Source, SpecialtyId, UserState } from "@/lib/domain/types";
import { selectFeedContent } from "@/lib/ui/feed";
import { kindLabel, specialtyLabel } from "@/lib/ui/labels";
import { buildPracticeHomeModel, buildWorkspaceHomeModel } from "@/lib/ui/shell-model";
import { EditorialContentCard } from "@/components/editorial-content-card";
import { GenUiStack, type GenUiBlock } from "@/components/gen-ui-stack";
import { SectionHelp } from "@/components/section-help";
import { WorkspaceResearchAgent } from "@/components/workspace-research-agent";
import { ProcedureBenchmarks, ProfessionalConsultationHub } from "@/components/workspace-professional-intelligence";

export function ExploreGenUiSurface({ specialty, content, sources }: { specialty: SpecialtyId; content: ContentObject[]; sources: Source[] }) {
  const visible = selectFeedContent({ content, query: "", kind: "all", savedIds: [] });
  const featured = visible[0] ?? null;
  const rest = visible.slice(1, 10);
  const blocks: GenUiBlock[] = [
    ...(featured ? [{
      id: "explore-featured",
      label: "Главный материал",
      kind: "hero_knowledge" as const,
      content: <section className="editorial-feed gen-ui-editorial-hero" aria-label="Главный материал"><EditorialContentCard content={featured} specialty={specialty} featured position={1} /></section>,
    }] : []),
    ...(rest.length ? [{
      id: "explore-knowledge",
      label: "Материалы",
      kind: "knowledge_shelf" as const,
      content: <section className="editorial-feed" aria-label="Материалы"><div className="editorial-stream">{rest.map((item, index) => <EditorialContentCard key={item.id} content={item} specialty={specialty} position={index + 2} />)}</div></section>,
    }] : []),
    {
      id: "explore-routes",
      label: "Исследовать",
      kind: "topic_cluster",
      content: <aside className="context-module" aria-label="Быстрые маршруты"><span className="eyebrow">Куда дальше</span><div className="heading-with-help"><h2>Исследовать</h2><SectionHelp text="Быстрые маршруты в соседние разделы каталога. Они не меняют ваши сохранения и рабочий режим." /></div><div className="quick-job-list"><Link href={`/${specialty}?kind=guideline`}><BookOpen size={18} /><span><strong>Рекомендации</strong><small>Текущие версии и архив</small></span><ArrowRight size={16} /></Link><Link href={`/${specialty}?view=events`}><CalendarDays size={18} /><span><strong>События</strong><small>Только подтверждённые объекты каталога</small></span><ArrowRight size={16} /></Link><Link href={`/${specialty}?view=sources`}><Library size={18} /><span><strong>Источники</strong><small>{sources.length} в каталоге</small></span><ArrowRight size={16} /></Link></div></aside>,
    },
    {
      id: "explore-search-prompt",
      label: "Поиск по теме",
      kind: "context_prompt",
      content: <aside className="context-module quiet-module"><Search size={20} aria-hidden="true" /><div className="heading-with-help"><h2>Ищите по теме</h2><SectionHelp text="Поиск учитывает заголовки, темы, источники и описания; результат остаётся объяснимым и детерминированным." /></div><p>Поиск работает по заголовкам, темам, источникам и описаниям. Результат остаётся объяснимым и детерминированным.</p></aside>,
    },
  ];

  return <GenUiStack specialty={specialty} shell="explore" blocks={blocks} />;
}

export function PracticeGenUiSurface({ specialty, content, sources, state }: { specialty: SpecialtyId; content: ContentObject[]; sources: Source[]; state: UserState }) {
  const model = buildPracticeHomeModel(content, state, specialty);
  const personal = model.pinned.length ? model.pinned : model.recent.length ? model.recent : model.saved;
  const blocks: GenUiBlock[] = [
    {
      id: "practice-launcher",
      label: "Быстрые инструменты",
      kind: "tool_shelf",
      content: <section className="practice-launcher" aria-label="Рабочие задачи"><Link href={`/${specialty}?kind=guideline`}><BookOpen size={22} /><span><strong>Рекомендации</strong><small>Открыть текущие версии</small></span><ArrowRight size={17} /></Link><Link href={`/${specialty}?view=tools`}><Calculator size={22} /><span><strong>Калькуляторы</strong><small>Две кардиологические шкалы</small></span><ArrowRight size={17} /></Link><Link href={`/${specialty}?view=reference`}><Search size={22} /><span><strong>Справочник</strong><small>Лекарства и взаимодействия</small></span><ArrowRight size={17} /></Link><Link href={`/${specialty}?view=referral`}><ArrowRight size={22} /><span><strong>ВМП</strong><small>Официальные документы и навигация</small></span><ArrowRight size={17} /></Link></section>,
    },
    {
      id: "practice-consultation",
      label: "Обсудить с коллегами",
      kind: "expert_route",
      content: <ProfessionalConsultationHub specialty={specialty} compact />,
    },
    {
      id: "practice-guidelines",
      label: "Текущие рекомендации",
      kind: "guideline_shelf",
      content: <section className="practice-primary" aria-labelledby="guidelines-title"><div className="mode-section-heading"><div><span className="eyebrow">Сейчас под рукой</span><div className="heading-with-help"><h2 id="guidelines-title">Текущие рекомендации</h2><SectionHelp text="Здесь только текущие клинические рекомендации из каталога; архивные и заменённые версии не поднимаются в этот блок." /></div></div><Link href={`/${specialty}?kind=guideline`}>Все рекомендации <ArrowRight size={15} /></Link></div>{model.currentGuidelines.length ? <div className="mode-row-list">{model.currentGuidelines.map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} />)}</div> : <ModeInlineEmpty text="В каталоге пока нет текущих рекомендаций." />}</section>,
    },
    {
      id: "practice-personal",
      label: "Личный быстрый доступ",
      kind: "saved_shelf",
      content: <aside className="practice-personal" aria-label="Ваш быстрый доступ"><div className="mode-section-heading compact"><div><span className="eyebrow">Личное</span><div className="heading-with-help"><h2>{model.pinned.length ? "Закреплено" : model.recent.length ? "Недавнее" : "Сохранено"}</h2><SectionHelp text="Приоритет: закреплённое → недавно открытое → сохранённое. Это ваш собственный слой, а не редакционная рекомендация." /></div></div></div>{personal.length ? <div className="personal-shortlist">{personal.slice(0, 4).map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} compact />)}</div> : <ModeInlineEmpty text="Здесь появятся материалы, которые вы закрепите, сохраните или недавно открывали." />}<Link className="secondary-button practice-saved-link" href={`/${specialty}?view=saved`}><Bookmark size={15} /> Мои материалы</Link></aside>,
    },
    ...(model.taskObjects.length ? [{
      id: "practice-catalog-tools",
      label: "Рабочие объекты каталога",
      kind: "reference_shelf" as const,
      content: <section className="practice-tools" aria-labelledby="practice-tools-title"><div className="mode-section-heading"><div><span className="eyebrow">Инструменты</span><div className="heading-with-help"><h2 id="practice-tools-title">Рабочие объекты каталога</h2><SectionHelp text="Только явно загруженные инструменты, справочные объекты и маршруты. Никаких сгенерированных формул или пациентских рекомендаций." /></div></div></div><div className="mode-row-list">{model.taskObjects.map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} />)}</div></section>,
    }] : []),
  ];

  return <div className="practice-home"><section className="mode-hero practice-hero" aria-labelledby="practice-title"><div><span className="eyebrow">{specialtyLabel[specialty]} · Практика</span><div className="heading-with-help"><h1 id="practice-title">Рабочий стол врача</h1><SectionHelp text="Практика собрана вокруг повторяемых рабочих задач: сначала актуальные рекомендации и инструменты, затем ваш личный быстрый доступ." /></div><p>Не лента новостей: быстрый вход в текущие рекомендации, инструменты, коллег и то, что вы сами закрепили для повторной работы.</p></div><div className="mode-stats" aria-label="Рабочее состояние"><span><strong>{model.currentGuidelines.length}</strong> текущих рекомендаций</span><span><strong>{model.taskObjects.length}</strong> инструментов каталога</span><span><strong>{model.pinned.length}</strong> закреплено</span></div></section><GenUiStack specialty={specialty} shell="practice" blocks={blocks} /><p className="mode-footnote">Источники в каталоге: {sources.length}. Практика не использует данные пациента и не пытается угадывать контекст приёма.</p></div>;
}

export function WorkspaceGenUiSurface({ specialty, content, sources, state }: { specialty: SpecialtyId; content: ContentObject[]; sources: Source[]; state: UserState }) {
  const model = buildWorkspaceHomeModel(content, state, specialty);
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const followedSources = model.followedSourceIds.map(id => sourceById.get(id)).filter((source): source is Source => Boolean(source));
  const pinnedSources = model.pinnedSourceIds.map(id => sourceById.get(id)).filter((source): source is Source => Boolean(source));
  const hasContext = model.researchInterests.length > 0 || model.followedTopics.length > 0 || followedSources.length > 0 || pinnedSources.length > 0 || model.recentQueries.length > 0;

  const blocks: GenUiBlock[] = [
    {
      id: "workspace-procedure-benchmarks",
      label: "Статистика операций",
      kind: "benchmark_shelf",
      content: <ProcedureBenchmarks specialty={specialty} />,
    },
    {
      id: "workspace-consultation",
      label: "Обсудить с коллегами",
      kind: "expert_route",
      content: <ProfessionalConsultationHub specialty={specialty} />,
    },
    {
      id: "workspace-assistant",
      label: "Ассистент по теме",
      kind: "assistant_entry",
      content: <details className="workspace-assistant-entry"><summary><span className="workspace-assistant-entry-icon"><Sparkles size={18} /></span><span><strong>Исследовать тему</strong><small>Добавить профессиональный интерес или безопасный агрегированный контекст</small></span><ArrowRight size={17} /></summary><div className="workspace-assistant-entry-body"><WorkspaceResearchAgent specialty={specialty} content={content} /></div></details>,
    },
    ...(!model.hasOwnedState ? [{
      id: "workspace-cold-start",
      label: "Начать рабочее пространство",
      kind: "context_prompt" as const,
      content: <section className="workspace-empty"><div className="workspace-empty-icon"><FolderOpen size={28} /></div><span className="eyebrow">Ваш личный слой пока пуст</span><div className="heading-with-help"><h2>Сохранения и подборки начинаются с ваших действий</h2><SectionHelp text="Статистика практики и профессиональные маршруты доступны сразу. Личный слой — сохранения, подборки, темы и история — формируется только вашими действиями." /></div><p>Добавьте интересующую нозологию, сохраните материал или закрепите нужное. Общий каталог не подмешивается сюда как будто это ваше сохранение.</p><div className="workspace-empty-actions"><Link className="primary-source-button" href={`/${specialty}`}>Перейти в обзор <ArrowRight size={15} /></Link><Link className="secondary-button" href={`/${specialty}?view=saved`}>Мои материалы</Link></div></section>,
    }] : []),
    ...(model.pinned.length ? [{ id: "workspace-pinned", label: "Закреплено", kind: "saved_shelf" as const, content: <WorkspaceSection title="Закреплено" eyebrow="Всегда под рукой" help="Материалы, которые вы явно закрепили для быстрого возврата." icon={<Pin size={18} />}><div className="mode-row-list">{model.pinned.map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} compact />)}</div></WorkspaceSection> }] : []),
    ...(model.collections.length ? [{ id: "workspace-collections", label: "Подборки", kind: "collection_shelf" as const, content: <WorkspaceSection title="Подборки" eyebrow="Ваши наборы" help="Пользовательские наборы материалов. Состав определяется только вами." icon={<FolderOpen size={18} />}><div className="collection-list">{model.collections.map(collection => <article key={collection.id} className="collection-card"><div><strong>{collection.name}</strong><span>{collection.items.length} материалов</span></div>{collection.items.length ? <div className="collection-preview">{collection.items.slice(0, 3).map(item => <Link key={item.id} href={`/${specialty}/content/${encodeURIComponent(item.id)}`}>{item.title}</Link>)}</div> : <p>Подборка пока пустая.</p>}</article>)}</div></WorkspaceSection> }] : []),
    ...(model.saved.length ? [{ id: "workspace-saved", label: "Сохранено", kind: "saved_shelf" as const, content: <WorkspaceSection title="Сохранено" eyebrow="Ваш архив" help="Все материалы, которые вы сохранили из каталога." icon={<Bookmark size={18} />}><div className="mode-row-list">{model.saved.slice(0, 8).map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} compact />)}</div></WorkspaceSection> }] : []),
    ...(model.recent.length ? [{ id: "workspace-recent", label: "Недавнее", kind: "update_strip" as const, content: <WorkspaceSection title="Недавнее" eyebrow="Продолжить работу" help="Недавно открытые материалы из вашей локальной истории работы." icon={<Clock size={18} />}><div className="mode-row-list">{model.recent.map(item => <ModeContentRow key={item.id} item={item} specialty={specialty} compact />)}</div></WorkspaceSection> }] : []),
    ...(hasContext ? [{ id: "workspace-context", label: "Профессиональный контекст", kind: "topic_cluster" as const, content: <WorkspaceSection title="Контекст" eyebrow="Явно выбранное" help="Темы, нозологии, источники и запросы, которые формируют ваш персональный рабочий контекст." icon={<Library size={18} />}><div className="workspace-context-groups">{model.researchInterests.length > 0 && <div><strong>Интересы и нозологии</strong><div className="workspace-chips">{model.researchInterests.map(interest => <span key={interest}>{interest}</span>)}</div></div>}{model.followedTopics.length > 0 && <div><strong>Темы</strong><div className="workspace-chips">{model.followedTopics.map(topic => <Link key={topic} href={`/${specialty}?q=${encodeURIComponent(topic)}`}>{topic}</Link>)}</div></div>}{[...pinnedSources, ...followedSources].length > 0 && <div><strong>Источники</strong><div className="workspace-chips">{[...pinnedSources, ...followedSources].filter((source, index, array) => array.findIndex(item => item.id === source.id) === index).map(source => <span key={source.id}>{source.name}</span>)}</div></div>}{model.recentQueries.length > 0 && <div><strong>Недавние запросы</strong><div className="workspace-chips">{model.recentQueries.map(query => <Link key={query} href={`/${specialty}?q=${encodeURIComponent(query)}`}>{query}</Link>)}</div></div>}</div></WorkspaceSection> }] : []),
  ];

  return <div className="workspace-home"><section className="mode-hero workspace-hero" aria-labelledby="workspace-title"><div><span className="eyebrow">{specialtyLabel[specialty]} · Рабочее пространство</span><div className="heading-with-help"><h1 id="workspace-title">Ваши материалы и профессиональный контекст</h1><SectionHelp text="Рабочее пространство соединяет системный профессиональный контекст — статистику и маршруты к коллегам — с вашим личным слоем сохранений, подборок, тем и истории." /></div><p>Смотрите ориентиры практики, находите профессиональные сообщества и сохраняйте собственный контекст. Данные пациента здесь не используются.</p></div><div className="mode-stats" aria-label="Состояние пространства"><span><strong>{model.saved.length}</strong> сохранено</span><span><strong>{model.collections.length}</strong> подборок</span><span><strong>{model.researchInterests.length + model.followedTopics.length}</strong> тем</span></div></section><GenUiStack specialty={specialty} shell="workspace" blocks={blocks} /></div>;
}

function ModeContentRow({ item, specialty, compact = false }: { item: ContentObject; specialty: SpecialtyId; compact?: boolean }) {
  return <article className={compact ? "mode-content-row compact" : "mode-content-row"}><div className="mode-content-mark" aria-hidden="true">{item.source.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</div><div className="mode-content-copy"><span>{item.source.name} · {kindLabel[item.kind]}</span><Link href={`/${specialty}/content/${encodeURIComponent(item.id)}`}>{item.title}</Link>{!compact && item.summary && <p>{item.summary}</p>}</div><Link className="mode-row-open" href={`/${specialty}/content/${encodeURIComponent(item.id)}`} aria-label={`Открыть: ${item.title}`}><ArrowRight size={16} /></Link></article>;
}

function WorkspaceSection({ title, eyebrow, help, icon, children }: { title: string; eyebrow: string; help: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="workspace-section"><div className="workspace-section-head"><div className="workspace-section-icon">{icon}</div><div><span className="eyebrow">{eyebrow}</span><div className="heading-with-help"><h2>{title}</h2><SectionHelp text={help} /></div></div></div>{children}</section>;
}

function ModeInlineEmpty({ text }: { text: string }) {
  return <div className="mode-inline-empty">{text}</div>;
}
