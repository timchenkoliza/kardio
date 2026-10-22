/* eslint-disable @next/next/no-img-element -- audit page shows the stored source next to its derivative */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ForYouList } from "@/components/portal/for-you";
import { StandaloneBar } from "@/components/workspace/standalone-bar";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { LAUNCH_SPECIALTY_IDS, type ContentObject, type SpecialtyId } from "@/lib/domain/types";
import { mediaKey, MEDIA_MANIFEST } from "@/lib/media/derivatives";
import type { MediaDerivative, Rect } from "@/lib/media/types";
import type { ForYouCard } from "@/lib/portal/cards";
import { showcaseById } from "@/lib/portal/showcase";
import { specialties } from "@/lib/specialty";
import { catalogCard, showcaseCard } from "@/server/portal/for-you";
import { listContent } from "@/server/repositories/catalog";
import "./media-audit.css";

/**
 * SOURCE → TRANSFORMED → CARD for every source of the media pipeline. Preview
 * and development only: production answers 404. The card column is built and
 * rendered by the same functions as the feed (inside the workspace provider its
 * actions need), one page-level set per specialty, so a later card about the
 * same clinical object shows what the feed would show there.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Медиа-конвейер · аудит", robots: { index: false, follow: false } };

function Regions({ derivative }: { derivative: MediaDerivative }) {
  const { width, height, crop, remove, keepText } = derivative.source;
  const box = (rect: Rect, className: string, key: string) => <rect key={key} className={className} x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} />;
  return <svg className="ma-regions" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    {crop && box(crop, "ma-crop", "crop")}
    {remove.map((rect, index) => box(rect, "ma-remove", `remove-${index}`))}
    {keepText.map((rect, index) => box(rect, "ma-keep", `keep-${index}`))}
  </svg>;
}

function Transformed({ derivative }: { derivative: MediaDerivative }) {
  if (derivative.src) return <figure className="ma-figure"><img src={derivative.src} alt={derivative.alt} /><figcaption>Approved · {derivative.transformation.version}</figcaption></figure>;
  if (derivative.attemptSrc) return <figure className="ma-figure is-rejected"><img src={derivative.attemptSrc} alt="" /><figcaption>Не прошло проверку — на карточки не попадает</figcaption></figure>;
  return <div className="ma-empty">Не преобразовано: {derivative.validation.failureReason}</div>;
}

function Checks({ derivative }: { derivative: MediaDerivative }) {
  return <ul className="ma-checks">
    {derivative.validation.checks.map(check => <li key={check.id} data-pass={check.pass}>
      <span>{check.pass ? "✓" : "✗"} {check.id}</span><span>{String(check.value)}</span><span>{check.threshold}</span>
    </li>)}
  </ul>;
}

function cardLabel(card: ForYouCard | null, manifest: MediaDerivative[]): string {
  if (!card) return "Документ недоступен в этом окружении";
  const key = mediaKey(card.media);
  if (!card.media || !key) return "Карточка без изображения";
  if (card.media.kind === "art") return `Fallback: in-house art «${card.media.art}»`;
  const shown = manifest.find(item => item.id === key);
  return `Derivative ${key}${shown ? ` (${shown.source.id})` : ""}`;
}

export default async function MediaAuditPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  const derivatives = MEDIA_MANIFEST.derivatives;
  const cardiology: ContentObject[] = await listContent("cardiology").catch(() => []);

  const sections = LAUNCH_SPECIALTY_IDS.map(specialty => {
    const used = new Set<string>();
    const rows = derivatives.filter(item => item.specialty === specialty).map((derivative, index) => {
      const showcase = showcaseById(derivative.document.id);
      const content = cardiology.find(item => item.id === derivative.document.id);
      const base = showcase ? showcaseCard(showcase, used) : content ? catalogCard(content, specialty as SpecialtyId, [], used) : null;
      return { derivative, card: base ? { ...base, id: `${base.id}-${index}` } : null };
    });
    return { specialty, rows };
  });
  const approved = derivatives.filter(item => item.status === "approved").length;

  return <div className="ws-app ws-app-standalone">
    <StandaloneBar label="Медиа-конвейер · аудит (Preview)" />
    <main className="ws-main" id="ws-main">
      <div className="ws-page ma-page">
        <header className="ws-page-head">
          <h1>Источник → преобразование → карточка</h1>
          <p>{MEDIA_MANIFEST.pipeline.version} · {MEDIA_MANIFEST.designSystem.version} · одобрено {approved} из {derivatives.length}. Пунктир — кадрирование, красное — удалённые подписи, зелёное — сохранённый текст. Страница недоступна в production.</p>
        </header>
        {sections.map(section => <WorkspaceProvider key={section.specialty} specialty={section.specialty}><section className="ma-section" aria-labelledby={`ma-${section.specialty}`}>
          <h2 id={`ma-${section.specialty}`}>{specialties[section.specialty].name}</h2>
          {section.rows.map(({ derivative, card }) => <article key={derivative.id} className="ma-row" data-status={derivative.status} data-derivative-id={derivative.id}>
            <header className="ma-row-head">
              <h3>{derivative.document.title}</h3>
              <p>{derivative.subject} · match {derivative.match.grade}: {derivative.match.reason}</p>
            </header>
            <div className="ma-columns">
              <div className="ma-column" data-column="source">
                <p className="ma-label">Source · {derivative.source.id}</p>
                <figure className="ma-figure ma-source"><div className="ma-stage"><img src={derivative.source.file} alt="Исходное изображение" /><Regions derivative={derivative} /></div><figcaption>{derivative.source.credit} · <a href={derivative.source.url} rel="noreferrer" target="_blank">оригинал</a></figcaption></figure>
              </div>
              <div className="ma-column" data-column="transformed">
                <p className="ma-label">Transformed · {derivative.status}</p>
                <Transformed derivative={derivative} />
              </div>
              <div className="ma-column" data-column="card">
                <p className="ma-label">{cardLabel(card, derivatives)}</p>
                {card ? <ForYouList cards={[card]} /> : <div className="ma-empty">Нет данных каталога</div>}
              </div>
            </div>
            <details className="ma-details">
              <summary>{derivative.validation.status === "passed" ? "Проверки пройдены" : `Отклонено: ${derivative.validation.failureReason}`} · fallback {derivative.fallback.kind}{derivative.fallback.ref ? ` ${derivative.fallback.ref}` : ""}</summary>
              <Checks derivative={derivative} />
              <dl className="ma-provenance">
                <dt>derivative</dt><dd>{derivative.id}</dd>
                <dt>source</dt><dd>{derivative.source.id} · sha256 {derivative.source.sha256.slice(0, 16)}… · {derivative.source.license}</dd>
                <dt>document</dt><dd>{derivative.document.id}</dd>
                <dt>transformation</dt><dd>{derivative.transformation.version} · {Object.entries(derivative.transformation.params).map(([key, value]) => `${key}=${value}`).join(", ")}</dd>
                <dt>design system</dt><dd>{derivative.designSystem.version}</dd>
                <dt>created</dt><dd>{derivative.createdAt}</dd>
                {derivative.sha256 && <><dt>file sha256</dt><dd>{derivative.sha256.slice(0, 16)}…</dd></>}
              </dl>
            </details>
          </article>)}
        </section></WorkspaceProvider>)}
      </div>
    </main>
  </div>;
}
