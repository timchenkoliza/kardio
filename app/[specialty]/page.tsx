import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, CalendarDays, Calculator, Library, Search } from "lucide-react";
import { ProductFrame } from "@/components/product-frame";
import { ProductProvider } from "@/components/product-provider";
import { EditorialContentCard } from "@/components/editorial-content-card";
import type { SpecialtyId } from "@/lib/domain/types";
import { contentKindFromView, feedKindLabel, isFeedKind, selectFeedContent, type FeedKindFilter } from "@/lib/ui/feed";
import { specialtyLabel } from "@/lib/ui/labels";
import { listContent, listSources } from "@/server/repositories/catalog";
import { readState, SESSION_COOKIE } from "@/server/services/state";

export const dynamic = "force-dynamic";

const feedTabs: FeedKindFilter[] = ["all", "guideline", "article", "video", "clinical"];

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

  return (
    <ProductProvider initialState={{ ...state, specialty }} specialty={specialty}>
      <ProductFrame specialty={specialty}>
        <div className="alpha-shell">
          <section className="feed-intro" aria-labelledby="feed-title">
            <div>
              <span className="eyebrow">{specialtyLabel[specialty]}</span>
              <h1 id="feed-title">{query ? "Поиск" : view === "saved" ? "Мои материалы" : view === "sources" ? "Источники" : "Лента"}</h1>
              <p>{query ? `По запросу «${query}»` : specialty === "cardiology" ? "Проверяемые профессиональные материалы — без пациентских данных и без лишнего шума." : "Отдельное пространство специальности. Контент появится только после собственной верифицированной загрузки."}</p>
            </div>
            {specialty === "cardiology" && !query && view === "feed" && (
              <div className="feed-trust-summary" aria-label="Состояние каталога">
                <span><strong>{content.length}</strong> материалов</span>
                <span><strong>{currentCount}</strong> актуальных</span>
                {reviewCount > 0 && <span><strong>{reviewCount}</strong> требуют проверки</span>}
              </div>
            )}
          </section>

          {view === "feed" && !query && specialty === "cardiology" && (
            <nav className="feed-tabs" aria-label="Разделы ленты">
              {feedTabs.map(tab => (
                <Link key={tab} className={kind === tab ? "feed-tab active" : "feed-tab"} href={`/${specialty}${tab === "all" ? "" : `?kind=${tab}`}`}>
                  {feedKindLabel(tab)}
                </Link>
              ))}
            </nav>
          )}

          {view === "sources" ? (
            <section className="source-directory" aria-label="Каталог источников">
              {sources.length ? sources.map(source => (
                <article className="source-row" key={source.id}>
                  <span className="source-mark large" aria-hidden="true">{source.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</span>
                  <div><h2>{source.name}</h2><p>{source.publisher ?? source.type}</p></div>
                  {source.url ? <a href={source.url} target="_blank" rel="noreferrer">Открыть источник <ArrowRight size={15} /></a> : <span className="muted">Ссылка не указана</span>}
                </article>
              )) : <EmptyState specialty={specialty} view={view} />}
            </section>
          ) : visible.length ? (
            <div className="feed-layout">
              <section className="editorial-feed" aria-label="Материалы">
                {featured && <EditorialContentCard content={featured} specialty={specialty} featured position={1} />}
                <div className="editorial-stream">
                  {rest.map((item, index) => <EditorialContentCard key={item.id} content={item} specialty={specialty} position={index + 2} />)}
                </div>
              </section>

              {!query && view === "feed" && (
                <aside className="context-rail" aria-label="Быстрый доступ">
                  <div className="context-module">
                    <span className="eyebrow">Быстрый доступ</span>
                    <h2>Рабочие задачи</h2>
                    <div className="quick-job-list">
                      <Link href={`/${specialty}?kind=guideline`}><BookOpen size={18} /><span><strong>Рекомендации</strong><small>Текущие версии и архив</small></span><ArrowRight size={16} /></Link>
                      <Link href={`/${specialty}?view=events`}><CalendarDays size={18} /><span><strong>События</strong><small>Только подтверждённые объекты каталога</small></span><ArrowRight size={16} /></Link>
                      <Link href={`/${specialty}?view=tools`}><Calculator size={18} /><span><strong>Калькуляторы</strong><small>Без выдуманных формул</small></span><ArrowRight size={16} /></Link>
                      <Link href={`/${specialty}?view=sources`}><Library size={18} /><span><strong>Источники</strong><small>{sources.length} в каталоге</small></span><ArrowRight size={16} /></Link>
                    </div>
                  </div>
                  <div className="context-module quiet-module">
                    <Search size={20} aria-hidden="true" />
                    <h2>Ищите по задаче</h2>
                    <p>Поиск работает по заголовкам, темам, источникам и описаниям. Результат остаётся объяснимым и детерминированным.</p>
                  </div>
                </aside>
              )}
            </div>
          ) : (
            <EmptyState specialty={specialty} view={view} query={query} />
          )}
        </div>
      </ProductFrame>
    </ProductProvider>
  );
}

function EmptyState({ specialty, view, query }: { specialty: SpecialtyId; view: string; query?: string }) {
  const oncology = specialty === "oncology";
  return (
    <section className="empty-state">
      <span className="empty-state-mark" aria-hidden="true">{query ? "⌕" : "—"}</span>
      <h2>{query ? "Ничего не найдено" : oncology ? "Онкология пока без канонического набора" : "В этом разделе пока нет материалов"}</h2>
      <p>{query ? "Попробуйте более короткий запрос или название темы." : oncology ? "Мы не подменяем онкологию кардиологическими материалами. Раздел наполнится после собственной проверенной загрузки." : `Раздел «${view}» не заполняется синтетическими данными.`}</p>
      <Link className="secondary-button" href={`/${specialty}`}>Вернуться в ленту</Link>
    </section>
  );
}
