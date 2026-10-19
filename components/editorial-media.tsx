/* eslint-disable @next/next/no-img-element */
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { kindLabel } from "@/lib/ui/labels";
import { prototypeMediaForContent } from "@/lib/ui/prototype-media-bank";
import { approvedEditorialMediaForContent } from "@/lib/ui/approved-medical-media";
import { readyArticleMotionForContent } from "@/lib/ui/article-motion-media";

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
  const prototypeAsset = content.specialty === specialty && !content.asset?.url ? prototypeMediaForContent(content) : null;
  const motionAsset = content.specialty === specialty && !content.asset?.url && !prototypeAsset
    ? readyArticleMotionForContent(content)
    : null;
  const approvedAsset = content.specialty === specialty && !content.asset?.url && !prototypeAsset && !motionAsset
    ? approvedEditorialMediaForContent(content)
    : null;
  const mediaUrl = content.asset?.url ?? prototypeAsset?.src ?? motionAsset?.output_url ?? approvedAsset?.src ?? null;

  if (!mediaUrl) {
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

  const mediaState = content.asset?.url
    ? "real"
    : prototypeAsset
      ? "prototype"
      : motionAsset
        ? "generated-motion"
        : "approved-fallback";
  const alt = content.asset?.caption
    ?? prototypeAsset?.alt
    ?? (motionAsset ? `Анимированная иллюстрация к материалу «${content.title}» на основе исходного изображения` : null)
    ?? approvedAsset?.alt
    ?? "";
  const credit = content.asset?.credit
    ?? (motionAsset ? motionAsset.provenance_note : null)
    ?? approvedAsset?.credit
    ?? null;

  return (
    <figure
      className={compact ? "editorial-media compact has-image" : "editorial-media has-image"}
      data-media-treatment={mediaTreatment(content)}
      data-media-state={mediaState}
    >
      <img
        src={mediaUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={content.asset?.width ?? motionAsset?.width ?? undefined}
        height={content.asset?.height ?? motionAsset?.height ?? undefined}
      />
      {credit && <figcaption>{credit}</figcaption>}
    </figure>
  );
}
