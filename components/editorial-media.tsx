/* eslint-disable @next/next/no-img-element */
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";

function visualVariant(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = ((hash << 5) - hash + id.charCodeAt(index)) | 0;
  return Math.abs(hash) % 6;
}

export function EditorialMedia({ content, specialty, compact = false }: {
  content: ContentObject;
  specialty: SpecialtyId;
  compact?: boolean;
}) {
  if (content.asset?.url) {
    return (
      <figure className={compact ? "editorial-media compact has-image" : "editorial-media has-image"}>
        <img
          src={content.asset.url}
          alt={content.asset.caption ?? ""}
          loading="lazy"
          decoding="async"
          width={content.asset.width ?? undefined}
          height={content.asset.height ?? undefined}
        />
        {content.asset.credit && <figcaption>{content.asset.credit}</figcaption>}
      </figure>
    );
  }

  return (
    <div
      className={compact ? "editorial-media compact editorial-art" : "editorial-media editorial-art"}
      data-kind={content.kind}
      data-specialty={specialty}
      data-variant={visualVariant(content.id)}
      aria-hidden="true"
    >
      <span className="editorial-art-orbit one" />
      <span className="editorial-art-orbit two" />
      <span className="editorial-art-line" />
    </div>
  );
}
