/* eslint-disable @next/next/no-img-element -- approved derivatives from public/media/derived, sized by CSS */
import { ArrowRight, ExternalLink, Handshake } from "lucide-react";
import { formatDateRu } from "@/lib/agents/format";
import { publishableDerivative } from "@/lib/media/derivatives";
import { STATE_LABEL, type CardMedia, type ForYouCard } from "@/lib/portal/cards";
import type { ClientPortalEvent } from "@/lib/portal/metrics";
import { russianPublicationDate } from "@/lib/presentation/physician";
import { nbsp } from "@/lib/ui/typography";
import { FeedArt } from "@/components/workspace/feed-art";
import { SaveResultButton } from "./result-actions";
import { SaveLinkButton } from "./save-link-button";
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

/** Media a physician may see: in-house art, or a derivative the manifest still lists as approved. */
export function renderableMedia(media: CardMedia | null): CardMedia | null {
  if (!media) return null;
  return media.kind === "art" || publishableDerivative(media) ? media : null;
}

export function CardMediaView({ media, className = "pt-card-media", eager = false }: { media: CardMedia; className?: string; eager?: boolean }) {
  if (media.kind === "art") return <figure className={className} data-media="art"><FeedArt art={media.art} alt={media.alt} animated={media.animated} /></figure>;
  // Anything that is not an approved derivative — a source image, a rejected attempt, a stale id — renders nothing.
  const derivative = publishableDerivative(media);
  if (!derivative) return null;
  return <figure className={className} data-media="derivative" data-derivative-id={derivative.id} data-pipeline={derivative.transformation.version}>
    <img src={derivative.src as string} alt={derivative.alt} width={derivative.width} height={derivative.height} loading={eager ? "eager" : "lazy"} decoding="async" />
    <figcaption>{media.caveat ? `${media.caveat}. ` : ""}{derivative.label}</figcaption>
  </figure>;
}

export function TrustBadge({ trust }: { trust: ForYouCard["trust"] }) {
  return <span className="pt-trust" data-tone={trust.tone}>{trust.label}</span>;
}

function SourceLink({ url, className = "pt-source-link" }: { url: string; className?: string }) {
  return <TrackedLink className={className} href={url} external events={["source_opened"]}>Открыть первоисточник<ExternalLink size={13} aria-hidden="true" /></TrackedLink>;
}

function Card({ card, lead, showWhy }: { card: ForYouCard; lead: boolean; showWhy: boolean }) {
  const date = dateLabel(card.date);
  const media = renderableMedia(card.media);
  if (card.partner) {
    return <aside className="pt-card is-partner" aria-label="Партнёрский материал">
      <p className="ws-format-disclosure"><Handshake size={13} aria-hidden="true" />{card.partner.disclosure} · {card.partner.sponsor}</p>
      <h3 className="pt-card-title">{nbsp(card.title)}</h3>
      {card.summary && <p className="pt-card-summary">{nbsp(card.summary)}</p>}
      <p className="pt-shown">Почему вы это видите: {card.whyShown}</p>
      <div className="pt-card-actions"><TrackedLink className="ws-text-link" href={card.primary.href} events={[]}>{card.primary.label}<ArrowRight size={14} aria-hidden="true" /></TrackedLink></div>
    </aside>;
  }
  return <article className={`pt-card${media ? " has-media" : ""}${lead ? " is-lead" : ""}${card.isNew ? " is-new" : ""}`} data-kind={card.kind} data-showcase={card.showcase || undefined} aria-labelledby={`fy-${card.id}`}>
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
      {card.whyItMatters && showWhy && <p className="pt-why"><strong>Почему важно:</strong> {nbsp(card.whyItMatters)}</p>}
      {card.tags.length > 0 && <ul className="pt-tags" aria-label="Темы">{card.tags.slice(0, 4).map(tag => <li key={tag}>{tag}</li>)}</ul>}
      <p className="pt-card-source"><span className="pt-card-publisher">{card.source.name}</span><TrustBadge trust={card.trust} />{card.source.freshness && !card.showcase && <span className="pt-card-fresh">{card.source.freshness}</span>}</p>
      {/* A card acts on its material only: open (title), save, first source. New searches on the topic live on the material page. */}
      {(card.source.url || card.resultId || card.next) && <div className="pt-card-actions">
        {card.next && <TrackedLink className="ws-button is-small is-quiet" href={card.next.href} events={card.kind === "learning" ? ["learning_recommendation_opened"] : []}>{card.next.label}</TrackedLink>}
        {card.resultId ? <SaveResultButton resultId={card.resultId} saved={false} /> : card.source.url ? <SaveLinkButton url={card.source.url} title={card.title} saved={false} /> : null}
        {card.source.url && <SourceLink url={card.source.url} />}
      </div>}
    </div>
    {media && <CardMediaView media={media} eager={lead} />}
  </article>;
}

/** Feed groups by what a physician does with the material; the order is the order of each group's first card. */
const GROUP: Record<ForYouCard["kind"], { id: string; title: string }> = {
  guideline: { id: "guidelines", title: "Рекомендации" },
  catalog: { id: "guidelines", title: "Рекомендации" },
  showcase: { id: "guidelines", title: "Рекомендации" },
  publication: { id: "research", title: "Исследования и обзоры" },
  drug_signal: { id: "drugs", title: "Препараты" },
  event: { id: "events", title: "События" },
  learning: { id: "learning", title: "Обучение" },
  saved_topic: { id: "saved", title: "По вашим материалам" },
  partner: { id: "partner", title: "Партнёрский материал" },
};

export function ForYouList({ cards }: { cards: ForYouCard[] }) {
  // «Почему важно» that repeats on several cards is a template, not a finding: shown only where it is the card's own.
  const counts = new Map<string, number>();
  for (const card of cards) if (card.whyItMatters) counts.set(card.whyItMatters, (counts.get(card.whyItMatters) ?? 0) + 1);
  // Kinds are grouped, not interleaved: one heading per group instead of a different label on every other card.
  const groups: Array<{ id: string; title: string; cards: ForYouCard[] }> = [];
  for (const card of cards) {
    const group = GROUP[card.kind];
    const existing = groups.find(item => item.id === group.id);
    if (existing) existing.cards.push(card); else groups.push({ ...group, cards: [card] });
  }
  const lead = cards[0]?.id;
  return <div className="pt-feed-groups">{groups.map(group => <section key={group.id} className="pt-feed-group" aria-labelledby={`fyg-${group.id}`} data-group={group.id}>
    <h3 id={`fyg-${group.id}`} className="pt-feed-group-title">{group.title}<span className="ws-muted"> · {group.cards.length}</span></h3>
    <div className="pt-cards">{group.cards.map(card => <Card key={card.id} card={card} lead={card.id === lead} showWhy={(counts.get(card.whyItMatters ?? "") ?? 0) < 2} />)}</div>
  </section>)}</div>;
}
