import manifestJson from "@/data/media-derivatives.json";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { MEDIUM_CAVEAT } from "@/lib/media/style";
import { subjectFor } from "@/lib/media/subjects";
import type { MediaDerivative, MediaManifest } from "@/lib/media/types";
import type { CardMedia } from "@/lib/portal/cards";
import { artAlt, type ArtKey } from "@/lib/ui/feed-art";

/**
 * The one media policy of physician-facing surfaces. A card shows, in order:
 *   1. an approved derivative of the card's clinical object (same specialty),
 *      not yet used by another card of the page;
 *   2. in-house art drawn for that object (or chosen by the editor);
 *   3. nothing.
 * A source image is never card media; a rejected transformation is never shown.
 */

// JSON arrays widen to number[]; the publish script writes the declared shape and tests verify it.
export const MEDIA_MANIFEST = manifestJson as unknown as MediaManifest;

function isApproved(derivative: MediaDerivative): boolean {
  return derivative.status === "approved"
    && derivative.validation.status === "passed"
    && derivative.src !== null
    && derivative.src.startsWith("/media/derived/")
    && Boolean(derivative.transformation.version)
    && Boolean(derivative.source.id && derivative.document.id);
}

export function approvedDerivatives(manifest: MediaManifest = MEDIA_MANIFEST): MediaDerivative[] {
  return manifest.derivatives.filter(isApproved);
}

/** The manifest record behind card media, or null when it is not an approved derivative of this specialty. */
export function publishableDerivative(media: CardMedia | null, specialty?: SpecialtyId, manifest: MediaManifest = MEDIA_MANIFEST): MediaDerivative | null {
  if (media?.kind !== "derivative") return null;
  const derivative = manifest.derivatives.find(item => item.id === media.derivativeId);
  if (!derivative || !isApproved(derivative) || derivative.src !== media.src) return null;
  if (specialty && derivative.specialty !== specialty) return null;
  return derivative;
}

export function derivativeMedia(derivative: MediaDerivative, caveat: boolean): CardMedia {
  return {
    kind: "derivative",
    derivativeId: derivative.id,
    src: derivative.src as string,
    alt: derivative.alt,
    credit: derivative.label,
    caveat: caveat || derivative.match.grade === "MEDIUM" ? MEDIUM_CAVEAT : null,
  };
}

export interface MediaRequest {
  specialty: SpecialtyId;
  /** Title, summary and tags of the card. */
  text: string;
  kind?: string | null;
  /** Editorial art for the item, used before the subject's own art. */
  art?: ArtKey | null;
  /** Media already used on the page (derivative ids and art keys): neighbours never repeat a picture. */
  used?: Set<string>;
}

export function selectCardMedia(request: MediaRequest, manifest: MediaManifest = MEDIA_MANIFEST): CardMedia | null {
  const used = request.used ?? new Set<string>();
  const match = subjectFor(request.specialty, request.text, request.kind);
  if (match) {
    const fresh = approvedDerivatives(manifest).find(item => item.specialty === request.specialty && item.subject === match.subject && !used.has(item.id));
    if (fresh) {
      used.add(fresh.id);
      return derivativeMedia(fresh, match.grade === "MEDIUM");
    }
  }
  const art = request.art ?? match?.art ?? null;
  if (art && !used.has(art)) {
    used.add(art);
    return { kind: "art", art, alt: artAlt(art), animated: false };
  }
  return null;
}

/** Picture of a catalog document page: an approved derivative of its clinical object, never its own source asset. */
export function contentDerivative(content: Pick<ContentObject, "specialty" | "title" | "summary" | "tags" | "topics" | "kind">, specialty: SpecialtyId, manifest: MediaManifest = MEDIA_MANIFEST): MediaDerivative | null {
  if (content.specialty !== specialty) return null;
  const media = selectCardMedia({ specialty, text: [content.title, content.summary, ...content.tags, ...content.topics].join(" "), kind: content.kind }, manifest);
  return publishableDerivative(media, specialty, manifest);
}

export function mediaKey(media: CardMedia | null): string | null {
  return !media ? null : media.kind === "derivative" ? media.derivativeId : media.art;
}
