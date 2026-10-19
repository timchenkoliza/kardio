import Link from "next/link";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { currentnessLabel, isPartner, kindLabel, publicationLabel } from "@/lib/ui/labels";
import { approvedEditorialMediaForContent } from "@/lib/ui/approved-medical-media";
import { ContentSaveButton } from "./content-actions";
import { EditorialMedia } from "./editorial-media";

export type EditorialPresentation = "standard" | "hero" | "guideline" | "clinical" | "evidence" | "learning" | "event";

function presentationForContent(content: ContentObject, featured: boolean): EditorialPresentation {
  if (featured) return "hero";
  switch (content.kind) {
    case "guideline": return "guideline";
    case "clinical": return "clinical";
    case "article": return "evidence";
    case "video": return "learning";
    case "event": return "event";
    default: return "standard";
  }
}

export function EditorialContentCard({ content, specialty, featured = false, position, presentation }: {
  content: ContentObject;
  specialty: SpecialtyId;
  featured?: boolean;
  position?: number;
  presentation?: EditorialPresentation;
}) {
  const partner = isPartner(content);
  const exceptionalState = content.currentness !== "current";
  const resolvedPresentation = presentation ?? presentationForContent(content, featured);
  const hero = featured || resolvedPresentation === "hero";
  const hasCanonicalMedia = Boolean(content.asset?.url);
  const hasApprovedFallback = content.specialty === specialty && Boolean(approvedEditorialMediaForContent(content));
  const hasMedia = hasCanonicalMedia || hasApprovedFallback;
  const artDirectedFallback = !hasMedia && (hero || (resolvedPresentation === "clinical" && position === 1));
  const hasVisual = hasMedia || artDirectedFallback;
  const className = [
    "editorial-card",
    hero ? "featured-card" : "",
    hasMedia ? "has-media-card" : "no-media-card",
    hasVisual ? "has-visual-card" : "text-only-card",
  ].filter(Boolean).join(" ");

  return (
    <article
      className={className}
      data-kind={content.kind}
      data-presentation={resolvedPresentation}
      data-media-state={hasCanonicalMedia ? "real" : hasApprovedFallback ? "approved-fallback" : artDirectedFallback ? "art-directed" : "none"}
      data-rank-position={position}
    >
      <div className="editorial-card-meta">
        <div className="source-lockup">
          <span className="source-mark" aria-hidden="true">{content.source.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</span>
          <span><strong>{content.source.name}</strong><small>{partner ? "Партнёрский материал" : kindLabel[content.kind]}</small></span>
        </div>
        <ContentSaveButton contentId={content.id} specialty={specialty} compact />
      </div>

      <div className={hasVisual ? "editorial-card-main with-media" : "editorial-card-main text-only"}>
        <Link className="editorial-card-link" href={`/${specialty}/content/${encodeURIComponent(content.id)}`}>
          <h2>{content.title}</h2>
          {content.summary && <p>{content.summary}</p>}
        </Link>
        {hasVisual && <EditorialMedia content={content} specialty={specialty} compact={!hero} fallback={artDirectedFallback} />}
      </div>

      <div className="editorial-card-footer">
        <span>{publicationLabel(content)}</span>
        {exceptionalState && (
          <span className={`currentness ${content.currentness}`} title={currentnessLabel[content.currentness]}>
            <CircleAlert size={14} aria-hidden="true" />
            {content.currentness === "review" ? "Проверяем" : content.currentness === "superseded" ? "Есть новая версия" : "Архив"}
          </span>
        )}
        <Link className="quiet-link card-open-icon" href={`/${specialty}/content/${encodeURIComponent(content.id)}`} aria-label={`Открыть: ${content.title}`}>
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
