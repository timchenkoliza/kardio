/* eslint-disable @next/next/no-img-element */
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { kindLabel } from "@/lib/ui/labels";

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
      aria-hidden="true"
    >
      <span className="editorial-art-orbit one" />
      <span className="editorial-art-orbit two" />
      <span className="editorial-art-line" />
      <strong>{kindLabel[content.kind]}</strong>
    </div>
  );
}
