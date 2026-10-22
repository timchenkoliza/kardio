import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { isRussian } from "@/lib/presentation/physician";
import { isSpecialty, specialties } from "@/lib/specialty";
import { nbsp } from "@/lib/ui/typography";
import { CardMediaView, dateLabel, renderableMedia, TrustBadge } from "@/components/portal/for-you";
import { SaveResultButton } from "@/components/portal/result-actions";
import { ScenarioButtons } from "@/components/portal/scenario-buttons";
import { TrackedLink } from "@/components/portal/tracked-link";
import { pageSession } from "@/server/agents/page-session";
import { workspaceStore } from "@/server/agents/store";
import { resultCard, showcaseCardById } from "@/server/portal/for-you";

export const dynamic = "force-dynamic";

/**
 * One item of «Для вас» on its own page, in the same tab: the Russian card in
 * full, what to do next with it, and the source wording only behind
 * «Оригинал». The external first source opens only from its own button.
 */
export default async function ItemPage({ params }: { params: Promise<{ specialty: string; id: string }> }) {
  const { specialty, id: rawId } = await params;
  if (!isSpecialty(specialty)) notFound();
  const id = decodeURIComponent(rawId);

  let card = /^sc-/u.test(id) ? showcaseCardById(specialty, id) : null;
  let quotes: Array<{ text: string; url: string | null }> = [];
  let saved = false;
  if (!card && /^res-[a-f0-9-]{36}$/u.test(id)) {
    const sessionId = await pageSession(specialty);
    const result = sessionId ? (await workspaceStore().listResults(sessionId, specialty)).find(item => item.id === id) : undefined;
    if (result) {
      card = resultCard(result, specialty, false);
      saved = Boolean(result.savedMaterialId);
      quotes = result.evidence.filter(item => item.supportText || item.claim).map(item => ({ text: item.supportText ?? item.claim, url: item.sourceUrl })).filter(item => item.text.length > 40).slice(0, 3);
    }
  }
  if (!card) notFound();

  const date = dateLabel(card.date);
  const media = renderableMedia(card.media);
  const russianQuotes = quotes.filter(quote => isRussian(quote.text));
  const originalQuotes = quotes.filter(quote => !isRussian(quote.text));
  // The short form is only a real finding: a line of publication metadata is not a «Ключевая мысль».
  const keyText = card.summary && !/^(?:Документ:|Национальный документ:|Опубликовано в журнале|Уверенность доказательств)/u.test(card.summary) ? card.summary : card.whyItMatters ?? null;
  const authorsWords = !keyText && !russianQuotes.length ? originalQuotes.slice(0, 1) : [];
  const hasOriginal = Boolean(card.original || originalQuotes.length);

  return <div className="ws-page pt-item" data-item-kind={card.kind}>
    <Link className="ws-back" href={`/${specialty}#fy-${card.id}`}><ArrowLeft size={15} aria-hidden="true" />К ленте</Link>
    <article className="pt-item-card" aria-labelledby="pt-item-title">
      <header className="pt-item-head">
        <div className="pt-card-meta">
          <span className="ws-kind" data-art="guideline">{card.label}</span>
          {card.showcase && <span className="pt-curated">Подборка</span>}
          {date && <time dateTime={card.date ?? undefined}>{date}</time>}
        </div>
        <h1 id="pt-item-title">{nbsp(card.title)}</h1>
        <p className="pt-card-source"><span className="pt-card-publisher">{card.source.name}</span><TrustBadge trust={card.trust} />{!card.showcase && card.source.freshness && <span className="pt-card-fresh">{card.source.freshness}</span>}</p>
        <div className="pt-card-actions">
          {card.resultId && <SaveResultButton resultId={card.resultId} saved={saved} />}
          {card.source.url && <TrackedLink className="ws-button is-small" href={card.source.url} external events={["source_opened"]}>Открыть первоисточник<ExternalLink size={13} aria-hidden="true" /></TrackedLink>}
        </div>
      </header>
      {media && <CardMediaView media={media} className="pt-item-hero" eager />}

      <div className="pt-item-grid">
        <div className="pt-item-main">
          <section className="pt-item-section pt-item-key" aria-labelledby="pt-item-key">
            <h2 id="pt-item-key" className="pt-subtitle">{keyText ? "Ключевая мысль" : "Краткого изложения на русском нет"}</h2>
            {keyText
              ? <p>{nbsp(keyText)}</p>
              : authorsWords.length
                ? <><p className="pt-derived">Вывод авторов (на английском, дословно):</p>{authorsWords.map(quote => <blockquote key={quote.text.slice(0, 40)} className="pt-quote" lang="en"><p>{quote.text}</p></blockquote>)}</>
                : <p>{nbsp(`${card.summary ? `${card.summary} ` : ""}Содержание — в первоисточнике по кнопке выше.`)}</p>}
          </section>
          <section className="pt-item-section" aria-labelledby="pt-item-short">
            <h2 id="pt-item-short" className="pt-subtitle">Коротко</h2>
            <ul className="pt-item-facts">
              <li><span>Тип</span><strong>{card.label}</strong></li>
              {date && <li><span>Дата публикации</span><strong>{date}</strong></li>}
              <li><span>Источник</span><strong>{card.source.name}</strong></li>
              {card.whyItMatters && card.summary && <li><span>Почему важно</span><strong>{nbsp(card.whyItMatters)}</strong></li>}
              <li><span>Почему вы это видите</span><strong>{nbsp(card.whyShown)}</strong></li>
            </ul>
            {card.tags.length > 0 && <ul className="pt-tags" aria-label="Темы">{card.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>}
          </section>
          {russianQuotes.length > 0 && <section className="pt-item-section" aria-labelledby="pt-item-quotes">
            <h2 id="pt-item-quotes" className="pt-subtitle">Из источника</h2>
            {russianQuotes.map(quote => <blockquote key={quote.text.slice(0, 40)} className="pt-quote"><p>{nbsp(quote.text)}</p></blockquote>)}
          </section>}
          {card.scenarios.length > 0 && <section className="pt-item-section" aria-labelledby="pt-item-next">
            <h2 id="pt-item-next" className="pt-subtitle">Новый поиск по теме</h2>
            <p className="ws-muted">{nbsp(`Запустит новый поиск по теме «${card.scenarios[0].text}» — не по этому материалу. Результат откроется на отдельной странице, этот материал останется в ленте.`)}</p>
            <div className="pt-card-actions"><ScenarioButtons scenarios={card.scenarios} origin={{ href: `/${specialty}/item/${encodeURIComponent(id)}`, label: card.title }} /></div>
          </section>}
          {hasOriginal && <details className="pt-original">
            <summary>Оригинал</summary>
            <div className="pt-original-body" lang="en">
              {card.original && <p className="pt-original-title">{card.original.title}</p>}
              {card.original?.summary && <p>{card.original.summary}</p>}
              {originalQuotes.map(quote => <blockquote key={quote.text.slice(0, 40)} className="pt-quote"><p>{quote.text}</p></blockquote>)}
            </div>
          </details>}
        </div>
      </div>
    </article>
    <p className="ws-muted pt-item-note">{nbsp(card.showcase
      ? "Подборка редакции: опубликованный документ профессионального сообщества. Статус в России сверяйте с рубрикатором клинических рекомендаций Минздрава."
      : "Перед применением сверяйте с действующими российскими клиническими рекомендациями и инструкцией из ГРЛС.")}</p>
  </div>;
}
