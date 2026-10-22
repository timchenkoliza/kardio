/* eslint-disable @next/next/no-img-element */
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { contentDerivative } from "@/lib/media/derivatives";
import { kindLabel } from "@/lib/ui/labels";

function mediaTreatment(content: ContentObject): "diagnostic" | "editorial" {
  const explicitText = [content.title, ...content.tags, ...content.topics].join(" ");
  const explicitDiagnosticFormat = /(?:\bКТ\b|\bМРТ\b|\bУЗИ\b|\bЭКГ\b|эхокар|эхо[- ]?кг|ангиограф|рентген|томограф|dicom|ultrasound|echocardi|ct\b|mri\b)/iu.test(explicitText);
  return content.kind === "clinical" || explicitDiagnosticFormat ? "diagnostic" : "editorial";
}

function contentMonogram(content: ContentObject): string {
  const words = content.title
    .split(/\s+/u)
    .map(word => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2);
  const monogram = words.map(word => word.slice(0, 1).toLocaleUpperCase("ru-RU")).join("");
  return monogram || content.source.name.slice(0, 1).toLocaleUpperCase("ru-RU");
}

export function EditorialMedia({ content, specialty, compact = false, fallback = false }: {
  content: ContentObject;
  specialty: SpecialtyId;
  compact?: boolean;
  fallback?: boolean;
}) {
  // The document's own asset and the prototype bank are source material: only an approved derivative is drawn.
  const derivative = contentDerivative(content, specialty);

  if (!derivative?.src) {
    if (!fallback) return null;

    const context = content.topics[0] ?? content.tags[0] ?? null;

    return (
      <figure
        className={compact ? "editorial-media compact editorial-art-typographic" : "editorial-media editorial-art-typographic"}
        data-kind={content.kind}
        data-media-treatment="editorial"
        data-media-state="art-directed"
        aria-label={`${kindLabel[content.kind]} · ${content.source.name}`}
      >
        <span className="editorial-art-kicker">{kindLabel[content.kind]}</span>
        <strong className="editorial-art-monogram" aria-hidden="true">{contentMonogram(content)}</strong>
        {context && <span className="editorial-art-topic">{context}</span>}
        <span className="editorial-art-source">{content.source.name}</span>
      </figure>
    );
  }

  return (
    <figure
      className={compact ? "editorial-media compact has-image" : "editorial-media has-image"}
      data-media-treatment={mediaTreatment(content)}
      data-media-state="derivative"
      data-derivative-id={derivative.id}
    >
      <img src={derivative.src} alt={derivative.alt} loading="lazy" decoding="async" width={derivative.width} height={derivative.height} />
      <figcaption>{derivative.label}</figcaption>
    </figure>
  );
}
