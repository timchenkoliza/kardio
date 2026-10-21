import { ArrowRight, ExternalLink, Handshake } from "lucide-react";
import { formatDateRu } from "@/lib/agents/format";
import { STATE_LABEL, type ForYouCard } from "@/lib/portal/cards";
import type { ClientPortalEvent } from "@/lib/portal/metrics";
import { TrackedLink } from "./tracked-link";

const ART: Record<ForYouCard["kind"], string> = { publication: "article", guideline: "guideline", drug_signal: "clinical", event: "event", learning: "video", saved_topic: "article", catalog: "guideline", partner: "article" };

function dateLabel(date: string | null): string | null {
  if (!date) return null;
  if (/^\d{4}$/.test(date)) return date;
  return formatDateRu(date, { day: "numeric", month: "short", year: "numeric" }) ?? date;
}

function eventsFor(card: ForYouCard, primary: boolean): ClientPortalEvent[] {
  const events: ClientPortalEvent[] = [];
  if (card.isNew) events.push("update_opened_since_previous_session");
  if (card.kind === "learning") events.push("learning_recommendation_opened");
  if (card.kind === "event") events.push("event_opened");
  if (primary && card.primary.external) events.push("source_opened");
  return events;
}

export function StateBadge({ state, freshness }: { state: ForYouCard["source"]["state"]; freshness: string }) {
  return <span className="ws-mode pt-state" data-state={state}>{STATE_LABEL[state]}{freshness ? ` · ${freshness}` : ""}</span>;
}

function Card({ card }: { card: ForYouCard }) {
  const date = dateLabel(card.date);
  if (card.partner) {
    return <aside className="pt-card is-partner" aria-label="Партнёрский материал">
      <p className="ws-format-disclosure"><Handshake size={13} aria-hidden="true" />{card.partner.disclosure} · {card.partner.sponsor}</p>
      <h3 className="pt-card-title">{card.title}</h3>
      {card.summary && <p className="pt-card-summary">{card.summary}</p>}
      <p className="pt-shown">Почему вы это видите: {card.whyShown}</p>
      <div className="pt-card-actions"><TrackedLink className="ws-text-link" href={card.primary.href} events={[]}>{card.primary.label}<ArrowRight size={14} aria-hidden="true" /></TrackedLink></div>
    </aside>;
  }
  return <article className={`pt-card${card.isNew ? " is-new" : ""}`} data-kind={card.kind} aria-labelledby={`fy-${card.id}`}>
    <div className="ws-result-meta">
      {card.isNew && <span className="ws-new">Новое</span>}
      <span className="ws-kind" data-art={ART[card.kind]}>{card.label}</span>
      {card.topic && <span>{card.topic}</span>}
      {date && <span>{date}</span>}
    </div>
    <h3 className="pt-card-title" id={`fy-${card.id}`}>
      <TrackedLink href={card.primary.href} external={card.primary.external} events={eventsFor(card, true)} resultId={card.resultId} resultKind={card.kind}>{card.title}</TrackedLink>
    </h3>
    {card.summary && <p className="pt-card-summary">{card.summary}</p>}
    {card.whyItMatters && <p className="pt-why"><strong>Почему важно:</strong> {card.whyItMatters}</p>}
    <p className="pt-shown">Почему вы это видите: {card.whyShown}</p>
    <p className="ws-provenance"><span>{card.source.name}</span><StateBadge state={card.source.state} freshness={card.source.freshness} /></p>
    <div className="pt-card-actions">
      <TrackedLink className="ws-button is-small" href={card.primary.href} external={card.primary.external} events={eventsFor(card, true)} resultId={card.resultId} resultKind={card.kind}>{card.primary.label}{card.primary.external ? <ExternalLink size={13} aria-hidden="true" /> : <ArrowRight size={13} aria-hidden="true" />}</TrackedLink>
      {card.next && <TrackedLink className="ws-button is-small is-quiet" href={card.next.href} external={card.next.external} events={card.kind === "learning" ? ["learning_recommendation_opened"] : []}>{card.next.label}</TrackedLink>}
    </div>
  </article>;
}

export function ForYouList({ cards }: { cards: ForYouCard[] }) {
  return <div className="pt-cards">{cards.map(card => <Card key={card.id} card={card} />)}</div>;
}
