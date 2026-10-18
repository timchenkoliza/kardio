import Link from "next/link";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { currentnessLabel, isPartner, kindLabel, publicationLabel } from "@/lib/ui/labels";
import { ContentSaveButton } from "./content-actions";
import { EditorialMedia } from "./editorial-media";

export function EditorialContentCard({ content, specialty, featured = false, position }: {
  content: ContentObject;
  specialty: SpecialtyId;
  featured?: boolean;
  position?: number;
}) {
  const partner = isPartner(content);
  const exceptionalState = content.currentness !== "current";

  return (
    <article className={featured ? "editorial-card featured-card" : "editorial-card"} data-kind={content.kind} data-rank-position={position}>
      <div className="editorial-card-meta">
        <div className="source-lockup">
          <span className="source-mark" aria-hidden="true">{content.source.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</span>
          <span><strong>{content.source.name}</strong><small>{partner ? "Партнёрский материал" : kindLabel[content.kind]}</small></span>
        </div>
        <ContentSaveButton contentId={content.id} specialty={specialty} compact />
      </div>

      <div className="editorial-card-main with-media">
        <Link className="editorial-card-link" href={`/${specialty}/content/${encodeURIComponent(content.id)}`}>
          <h2>{content.title}</h2>
          {content.summary && <p>{content.summary}</p>}
        </Link>
        <EditorialMedia content={content} specialty={specialty} compact={!featured} />
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
