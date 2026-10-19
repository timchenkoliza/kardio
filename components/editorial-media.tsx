/* eslint-disable @next/next/no-img-element */
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";

function mediaTreatment(content: ContentObject): "diagnostic" | "editorial" {
  const explicitText = [content.title, ...content.tags, ...content.topics].join(" ");
  const explicitDiagnosticFormat = /(?:\bКТ\b|\bМРТ\b|\bУЗИ\b|\bЭКГ\b|эхокар|эхо[- ]?кг|ангиограф|рентген|томограф|dicom|ultrasound|echocardi|ct\b|mri\b)/iu.test(explicitText);
  return content.kind === "clinical" || explicitDiagnosticFormat ? "diagnostic" : "editorial";
}

export function EditorialMedia({ content, compact = false }: {
  content: ContentObject;
  specialty: SpecialtyId;
  compact?: boolean;
  fallback?: boolean;
}) {
  if (!content.asset?.url) return null;

  return (
    <figure
      className={compact ? "editorial-media compact has-image" : "editorial-media has-image"}
      data-media-treatment={mediaTreatment(content)}
    >
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
