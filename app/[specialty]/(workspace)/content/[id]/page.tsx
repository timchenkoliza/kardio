import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";
import { ContentOpenTracker } from "@/components/content-open-tracker";
import { SaveLinkButton } from "@/components/portal/save-link-button";
import { EditorialContentCard } from "@/components/editorial-content-card";
import { EditorialMedia } from "@/components/editorial-media";
import { ProductProvider } from "@/components/product-provider";
import type { SpecialtyId } from "@/lib/domain/types";
import { catalogTopicLabel } from "@/lib/agents/vocabulary";
import { relatedContent } from "@/lib/ui/feed";
import { currentnessLabel, kindLabel, publicationLabel, sourceTypeLabel, specialtyLabel } from "@/lib/ui/labels";
import { getContent, listContent } from "@/server/repositories/catalog";
import { readState, SESSION_COOKIE } from "@/server/services/state";
import { pageSession } from "@/server/agents/page-session";
import { workspaceStore } from "@/server/agents/store";

export const dynamic = "force-dynamic";

function isSpecialty(value: string): value is SpecialtyId {
  return value === "cardiology" || value === "oncology";
}

export default async function ContentDetail({ params }: { params: Promise<{ specialty: string; id: string }> }) {
  const { specialty: rawSpecialty, id } = await params;
  if (!isSpecialty(rawSpecialty)) notFound();
  const specialty = rawSpecialty;
  const decodedId = decodeURIComponent(id);
  const cookieStore = await cookies();
  const state = await readState(cookieStore.get(SESSION_COOKIE)?.value);
  const [content, catalog] = await Promise.all([getContent(specialty, decodedId), listContent(specialty)]);
  if (!content) notFound();

  const related = relatedContent(content, catalog, 3);
  // «Сохранить» writes to «Мои материалы» like every other save: the document's link with its title.
  const saveUrl = content.canonicalUrl ?? content.source.url ?? null;
  const sessionId = await pageSession(specialty);
  const saved = Boolean(saveUrl && sessionId && (await workspaceStore().listMaterials(sessionId, specialty)).some(material => material.url === saveUrl));
  const StatusIcon = content.currentness === "current" ? CheckCircle2 : CircleAlert;

  return (
    <ProductProvider initialState={{ ...state, specialty }} specialty={specialty}>
      <ContentOpenTracker contentId={content.id} sourceId={content.sourceId} specialty={specialty} currentness={content.currentness} />
      <div className="ws-page alpha-shell detail-shell">
          <Link className="ws-back" href={`/${specialty}`}><ArrowLeft size={15} aria-hidden="true" />Главное</Link>
          <article className="content-detail">
            <header className="content-detail-head">
              <div className="detail-source-line">
                <span className="source-mark large" aria-hidden="true">{content.source.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</span>
                <div>
                  <strong>{content.source.name}</strong>
                  <span>{sourceTypeLabel(content.source.type)} · {specialtyLabel[specialty]}</span>
                </div>
              </div>
              {saveUrl && <SaveLinkButton url={saveUrl} title={content.title} saved={saved} />}
            </header>

            <div className="detail-title-block">
              <span className="eyebrow">{kindLabel[content.kind]}</span>
              <h1>{content.title}</h1>
              {content.summary && <p className="detail-deck">{content.summary}</p>}
            </div>

            <div className="detail-visual"><EditorialMedia content={content} specialty={specialty} /></div>

            <dl className="detail-facts">
              <div><dt>Источник</dt><dd>{content.source.name}</dd></div>
              <div><dt>Публикация</dt><dd>{publicationLabel(content)}</dd></div>
              <div><dt>Статус</dt><dd><StatusIcon size={15} /> {currentnessLabel[content.currentness]}</dd></div>
              {content.version && <div><dt>Версия</dt><dd>{content.version}</dd></div>}
            </dl>

            {content.topics.length > 0 && (
              <section className="detail-section">
                <span className="eyebrow">Темы</span>
                <div className="topic-list">{content.topics.map(topic => { const label = catalogTopicLabel(specialty, topic); return <Link key={topic} href={`/${specialty}/agents/research?q=${encodeURIComponent(label)}`}>{label}</Link>; })}</div>
              </section>
            )}

            <section className="source-evidence-panel">
              <div>
                <span className="eyebrow">Первоисточник</span>
                <h2>Перейти к первоисточнику</h2>
                <p>Мы показываем материал вместе с источником и статусом актуальности. Отсутствующие даты, версии или права не додумываются.</p>
              </div>
              {content.canonicalUrl ? (
                <a className="primary-source-button" href={content.canonicalUrl} target="_blank" rel="noreferrer">Открыть источник <ExternalLink size={16} /></a>
              ) : content.source.url ? (
                <a className="primary-source-button" href={content.source.url} target="_blank" rel="noreferrer">Страница источника <ArrowUpRight size={16} /></a>
              ) : (
                <span className="muted">Ссылка на первоисточник не указана</span>
              )}
            </section>

            {content.currentness === "superseded" && content.supersededById && (
              <section className="version-callout">
                <CircleAlert size={20} aria-hidden="true" />
                <div><strong>Есть более новая версия</strong><p>Этот материал сохранён как часть истории. Для текущей работы перейдите к новой версии.</p></div>
                <Link href={`/${specialty}/content/${encodeURIComponent(content.supersededById)}`}>Открыть новую версию <ArrowUpRight size={15} /></Link>
              </section>
            )}
          </article>

          {related.length > 0 && (
            <section className="related-section" aria-labelledby="related-title">
              <div className="section-heading"><span className="eyebrow">Следующий шаг</span><h2 id="related-title">Связанные материалы</h2><p>По общей теме, источнику или типу материала.</p></div>
              <div className="related-grid">{related.map(item => <EditorialContentCard key={item.id} content={item} specialty={specialty} />)}</div>
            </section>
          )}
      </div>
    </ProductProvider>
  );
}
