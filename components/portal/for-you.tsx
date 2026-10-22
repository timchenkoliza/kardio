/* eslint-disable @next/next/no-img-element -- licensed static media from public/media, sized by CSS */
import { ArrowRight, ExternalLink, Handshake } from "lucide-react";
import { formatDateRu } from "@/lib/agents/format";
import { STATE_LABEL, type CardMedia, type ForYouCard } from "@/lib/portal/cards";
import type { ClientPortalEvent } from "@/lib/portal/metrics";
import { russianPublicationDate } from "@/lib/presentation/physician";
import { nbsp } from "@/lib/ui/typography";
import { FeedArt } from "@/components/workspace/feed-art";
import { SaveResultButton } from "./result-actions";
import { ScenarioButtons } from "./scenario-buttons";
import { TrackedLink } from "./tracked-link";

export function dateLabel(date: string | null): string | null {
  if (!date) return null;
  if (/^\d{4}$/.test(date)) return date;
  if (/^\d{4}-\d{2}$/.test(date)) return formatDateRu(`${date}-15`, { month: "long", year: "numeric" }) ?? date;
  if (/^\d{4}\s+[A-Za-z]{3}/.test(date)) return russianPublicationDate(date);
  return formatDateRu(date, { day: "numeric", month: "short", year: "numeric" }) ?? date;
}

function eventsFor(card: ForYouCard): ClientPortalEvent[] {
  const events: ClientPortalEvent[] = [];
  if (card.isNew) events.push("update_opened_since_previous_session");
  if (card.kind === "learning") events.push("learning_recommendation_opened");
  if (card.kind === "event") events.push("event_opened");
  return events;
}

/** Source state in words (kept for the result page provenance lines). */
export function StateBadge({ state, freshness }: { state: ForYouCard["source"]["state"]; freshness: string }) {
  return <span className="ws-mode pt-state" data-state={state}>{STATE_LABEL[state]}{freshness ? ` · ${freshness}` : ""}</span>;
}

export function CardMediaView({ media, className = "pt-card-media", eager = false }: { media: CardMedia; className?: string; eager?: boolean }) {
  if (media.kind === "art") return <figure className={className} data-media="art"><FeedArt art={media.art} alt={media.alt} animated={media.animated} /></figure>;
  return <figure className={className} data-media="image">
    <img src={media.src} alt={media.alt} loading={eager ? "eager" : "lazy"} decoding="async" />
    {media.credit && <figcaption>{media.credit}</figcaption>}
  </figure>;
}

export function TrustBadge({ trust }: { trust: ForYouCard["trust"] }) {
  return <span className="pt-trust" data-tone={trust.tone}>{trust.label}</span>;
}

function SourceLink({ url, className = "pt-source-link" }: { url: string; className?: string }) {
  return <TrackedLink className={className} href={url} external events={["source_opened"]}>Открыть первоисточник<ExternalLink size={13} aria-hidden="true" /></TrackedLink>;
}

function Card({ card, lead }: { card: ForYouCard; lead: boolean }) {
  const date = dateLabel(card.date);
  if (card.partner) {
    return <aside className="pt-card is-partner" aria-label="Партнёрский материал">
      <p className="ws-format-disclosure"><Handshake size={13} aria-hidden="true" />{card.partner.disclosure} · {card.partner.sponsor}</p>
      <h3 className="pt-card-title">{nbsp(card.title)}</h3>
      {card.summary && <p className="pt-card-summary">{nbsp(card.summary)}</p>}
      <p className="pt-shown">Почему вы это видите: {card.whyShown}</p>
      <div className="pt-card-actions"><TrackedLink className="ws-text-link" href={card.primary.href} events={[]}>{card.primary.label}<ArrowRight size={14} aria-hidden="true" /></TrackedLink></div>
    </aside>;
  }
  return <article className={`pt-card${card.media ? " has-media" : ""}${lead ? " is-lead" : ""}${card.isNew ? " is-new" : ""}`} data-kind={card.kind} data-showcase={card.showcase || undefined} aria-labelledby={`fy-${card.id}`}>
    <div className="pt-card-body">
      <div className="pt-card-meta">
        {card.isNew && <span className="ws-new">Новое</span>}
        <span className="ws-kind" data-art={card.kind === "guideline" || card.kind === "catalog" || card.kind === "showcase" ? "guideline" : card.kind === "event" ? "event" : "article"}>{card.label}</span>
        {card.showcase && <span className="pt-curated">Подборка</span>}
        {date && <time dateTime={card.date ?? undefined}>{date}</time>}
      </div>
      <h3 className="pt-card-title" id={`fy-${card.id}`}>
        <TrackedLink className="pt-card-link" href={card.href} events={eventsFor(card)} resultId={card.resultId} resultKind={card.kind}>{nbsp(card.title)}</TrackedLink>
      </h3>
      {card.summary && <p className="pt-card-summary">{nbsp(card.summary)}</p>}
      {card.whyItMatters && <p className="pt-why"><strong>Почему важно:</strong> {nbsp(card.whyItMatters)}</p>}
      {card.tags.length > 0 && <ul className="pt-tags" aria-label="Темы">{card.tags.slice(0, 4).map(tag => <li key={tag}>{tag}</li>)}</ul>}
      <p className="pt-card-source"><span className="pt-card-publisher">{card.source.name}</span><TrustBadge trust={card.trust} />{card.source.freshness && !card.showcase && <span className="pt-card-fresh">{card.source.freshness}</span>}</p>
      {(card.scenarios.length > 0 || card.source.url || card.resultId || card.next) && <div className="pt-card-actions">
        <ScenarioButtons scenarios={card.scenarios} />
        {card.next && <TrackedLink className="ws-button is-small is-quiet" href={card.next.href} events={card.kind === "learning" ? ["learning_recommendation_opened"] : []}>{card.next.label}</TrackedLink>}
        {card.resultId && <SaveResultButton resultId={card.resultId} saved={false} />}
        {card.source.url && <SourceLink url={card.source.url} />}
      </div>}
    </div>
    {card.media && <CardMediaView media={card.media} eager={lead} />}
  </article>;
}

export function ForYouList({ cards }: { cards: ForYouCard[] }) {
  return <div className="pt-cards">{cards.map((card, index) => <Card key={card.id} card={card} lead={index === 0} />)}</div>;
}
