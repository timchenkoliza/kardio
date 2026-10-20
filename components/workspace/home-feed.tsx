import Link from "next/link";
import { ExternalLink, Handshake, Play } from "lucide-react";
import type { AgentResultMedia } from "@/lib/ui/agent-result-media";
import type { FeedCatalogItem, FeedEntry, FeedPartnerSlot, FeedVideo, HomeFeed } from "@/server/agents/home-feed";
import { FeedArt } from "./feed-art";
import { HelpTip } from "./help-tip";
import { ResultCard } from "./result-card";

const NEEDS_CHECK_HELP = "Источник не подтвердил, что это действующая версия. Перед тем как опираться на материал, сверьте его с рубрикатором клинических рекомендаций Минздрава.";

export function NeedsCheck() {
  return <span className="ws-verify-group"><span className="ws-verify ws-verify-partial">Проверить актуальность</span><HelpTip label="Проверить актуальность">{NEEDS_CHECK_HELP}</HelpTip></span>;
}

function FeedMedia({ media, href }: { media: AgentResultMedia; href: string }) {
  return <Link className="ws-feed-media" href={href} tabIndex={-1} aria-hidden="true"><FeedArt art={media.art} alt={media.alt} animated={media.animated} /></Link>;
}

function CatalogCard({ item, media, lead }: { item: FeedCatalogItem; media: AgentResultMedia | null; lead: boolean }) {
  return <article className={`ws-feed-card${media ? " has-media" : ""}${lead ? " is-lead" : ""}`} aria-labelledby={`f-${item.id}`}>
    {media && <FeedMedia media={media} href={item.href} />}
    <div className="ws-feed-body">
      <div className="ws-result-meta">
        <span className="ws-kind" data-art={item.kind}>{item.kindLabel}</span>
        {item.topic && <span>{item.topic}</span>}
        {item.needsCheck && <NeedsCheck />}
      </div>
      <h3 className="ws-feed-title" id={`f-${item.id}`}><Link href={item.href}>{item.title}</Link></h3>
      <p className="ws-feed-summary">{item.summary}</p>
      <p className="ws-provenance"><span>{item.source}{item.year ? ` · ${item.year}` : ""}</span></p>
    </div>
  </article>;
}

function VideoCard({ video }: { video: FeedVideo }) {
  return <article className="ws-feed-card ws-feed-video" aria-labelledby="f-video">
    <Link className="ws-video-poster" href={video.href} aria-label={`Смотреть видеолекцию «${video.title}»`}>
      {video.poster ? <FeedArt art={video.poster.art} alt="" animated={false} /> : <span className="ws-video-blank" />}
      <span className="ws-video-play" aria-hidden="true"><Play size={22} /></span>
    </Link>
    <div className="ws-feed-body">
      <div className="ws-result-meta">
        <span className="ws-kind" data-art="video">Видеолекция</span>
        {video.needsCheck && <NeedsCheck />}
      </div>
      <h3 className="ws-feed-title" id="f-video"><Link href={video.href}>{video.title}</Link></h3>
      <p className="ws-provenance">
        <span>{video.source}</span>
        {video.sourceUrl && <a href={video.sourceUrl} target="_blank" rel="noreferrer">Открыть в источнике<ExternalLink size={11} aria-hidden="true" /></a>}
      </p>
    </div>
  </article>;
}

/** Native partner placement: reach slot in the feed, always labelled and kept apart from evidence. */
function PartnerSlot({ slot }: { slot: FeedPartnerSlot }) {
  const { example } = slot;
  return <aside className="ws-feed-card ws-feed-partner" aria-label="Партнёрский материал">
    <p className="ws-format-disclosure"><Handshake size={13} aria-hidden="true" />{slot.disclosure} · {slot.sponsor}
      <HelpTip label="Партнёрский материал">Материал компании-партнёра. Показываем его по вашим темам и отдельно от источников, на которые опираются агенты. Отключить можно в настройках.</HelpTip>
    </p>
    <div className="ws-feed-partner-grid">
      <FeedArt art="coronary_plaque" alt={example.imageAlt} animated={false} />
      <div className="ws-feed-body">
        <span className="ws-kind">{example.variant}</span>
        <h3 className="ws-feed-title">{example.title}</h3>
        <ul className="ws-feed-points">{example.keyPoints.map(point => <li key={point}>{point}</li>)}</ul>
        <p className="ws-format-meta">{example.meta}</p>
      </div>
    </div>
  </aside>;
}

function Entry({ entry, specialty, lead }: { entry: FeedEntry; specialty: string; lead: boolean }) {
  if (entry.type === "catalog") return <CatalogCard item={entry.item} media={entry.media} lead={lead} />;
  return <div className={lead ? "ws-feed-slot is-lead" : "ws-feed-slot"}><ResultCard result={entry.result} specialty={specialty} media={entry.media} /></div>;
}

export function HomeFeedList({ feed, specialty }: { feed: HomeFeed; specialty: string }) {
  if (!feed.entries.length && !feed.video) return <p className="ws-empty">Проверенных материалов по этой специальности пока нет.</p>;
  const items: React.ReactNode[] = [];
  feed.entries.forEach((entry, index) => {
    items.push(<Entry key={entry.id} entry={entry} specialty={specialty} lead={index === 0} />);
    if (index === feed.slots.partnerAfter && feed.partner) items.push(<PartnerSlot key="partner" slot={feed.partner} />);
    if (index === feed.slots.videoAfter && feed.video) items.push(<VideoCard key="video" video={feed.video} />);
  });
  if (feed.video && feed.entries.length <= feed.slots.videoAfter) items.push(<VideoCard key="video" video={feed.video} />);
  if (feed.partner && feed.entries.length <= feed.slots.partnerAfter) items.push(<PartnerSlot key="partner" slot={feed.partner} />);
  return <div className="ws-feed">{items}</div>;
}
