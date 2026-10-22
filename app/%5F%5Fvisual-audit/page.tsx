import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardMediaView, ForYouList } from "@/components/portal/for-you";
import { Mascot } from "@/components/portal/mascot";
import { StandaloneBar } from "@/components/workspace/standalone-bar";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { ComposerSamples, ModeSamples, UploadSamples } from "@/components/visual-audit/samples";
import type { ForYouCard } from "@/lib/portal/cards";
import { SHOWCASE } from "@/lib/portal/showcase";
import { homeSuggestions } from "@/lib/portal/suggestions";
import { showcaseCard } from "@/server/portal/for-you";
import "./visual-audit.css";

/**
 * Visual audit — Preview and development only (production answers 404).
 * Every key component in every state, side by side, for visual regression
 * and manual acceptance: composer, answer modes, the mascot family, feed and
 * article cards with and without media, the de-identification upload states.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Визуальный аудит", robots: { index: false, follow: false } };

const LONG_TITLE = "Многоцентровое рандомизированное исследование долгосрочной эффективности и безопасности комбинированной терапии у взрослых пациентов с хронической сердечной недостаточностью и сохранённой фракцией выброса";
const LONG_SUMMARY = "Документ описывает дизайн, популяцию, конечные точки и статистические подходы исследования; в нём сопоставляются стратегии ведения, обсуждаются ограничения, подгрупповые эффекты, частота нежелательных явлений и условия, при которых результаты переносимы на практику амбулаторного звена и стационара.";

export default function VisualAuditPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  const neurology = SHOWCASE.filter(item => item.specialty === "neurology");
  const withMedia = showcaseCard(neurology.find(item => item.id === "sc-neurology-eso-ivt-2021") ?? neurology[0]);
  const noMedia: ForYouCard = { ...withMedia, id: "va-no-media", media: null };
  const longTitle: ForYouCard = { ...withMedia, id: "va-long-title", title: LONG_TITLE };
  const longSummary: ForYouCard = { ...withMedia, id: "va-long-summary", summary: LONG_SUMMARY };

  return <div className="ws-app ws-app-standalone va-root">
    <StandaloneBar label="Визуальный аудит · Preview" />
    <main className="ws-main" id="ws-main">
      <WorkspaceProvider specialty="cardiology">
        <div className="va-page">
          <header className="ws-page-head">
            <h1>Визуальный аудит product shell</h1>
            <p>Все ключевые компоненты во всех состояниях. Страница недоступна в production.</p>
          </header>

          <section className="va-section" id="composer" aria-labelledby="va-composer">
            <h2 id="va-composer">Composer</h2>
            <ComposerSamples suggestions={homeSuggestions("cardiology")} />
          </section>

          <section className="va-section" id="modes" aria-labelledby="va-modes">
            <h2 id="va-modes">Режимы ответа</h2>
            <ModeSamples />
          </section>

          <section className="va-section" id="mascot" aria-labelledby="va-mascot">
            <h2 id="va-mascot">Маскот «Смузи»</h2>
            <div className="va-mascots">
              {(["canonical", "drug", "guidelines", "research", "events", "materials"] as const).map(variant => <figure key={variant} data-sample={`mascot-${variant}`}>
                <Mascot variant={variant} size={120} motion={variant === "canonical" ? "breathe" : "still"} />
                <figcaption>{variant}</figcaption>
              </figure>)}
            </div>
          </section>

          <section className="va-section" id="cards" aria-labelledby="va-cards">
            <h2 id="va-cards">Карточки</h2>
            <div className="va-grid">
              <div className="va-sample" data-sample="card-media"><h3>с перерисованным медицинским изображением · 2:1</h3><ForYouList cards={[withMedia]} /></div>
              <div className="va-sample" data-sample="card-no-media"><h3>без изображения</h3><ForYouList cards={[noMedia]} /></div>
              <div className="va-sample" data-sample="card-long-title"><h3>длинный заголовок</h3><ForYouList cards={[longTitle]} /></div>
              <div className="va-sample" data-sample="card-long-summary"><h3>длинная аннотация</h3><ForYouList cards={[longSummary]} /></div>
              <div className="va-sample" data-sample="media-3-1"><h3>открытый материал · 3:1</h3>{withMedia.media && <CardMediaView media={withMedia.media} className="pt-item-hero" eager />}</div>
            </div>
          </section>

          <section className="va-section" id="upload" aria-labelledby="va-upload">
            <h2 id="va-upload">Обезличивание · состояния загрузки</h2>
            <UploadSamples />
          </section>
        </div>
      </WorkspaceProvider>
    </main>
  </div>;
}
