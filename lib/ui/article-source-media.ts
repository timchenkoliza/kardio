import type { ContentObject, SpecialtyId } from "@/lib/domain/types";

export interface ArticleSourceArtifact {
  id: string;
  provider: string;
  providerItemId: string;
  sourceRegistryId: string | null;
  specialty: SpecialtyId | null;
  name: string;
  mimeType: string;
}

const TELEGRAM_MESSAGE_URL = /(?:https?:\/\/)?t\.me\/[^/]+\/(\d+)(?:[/?#]|$)/iu;
const MEDIA_FILENAME_MESSAGE = /^(?:photo|video|file|animation|document)_(\d+)(?:_|\.)/iu;
const LOCATION_MESSAGE = /(?:message|msg|post|сообщение)[_\s-]*(?:id)?\s*[:=#-]?\s*(\d+)/iu;

export function telegramMessageIdFromMediaFilename(filename: string): string | null {
  return MEDIA_FILENAME_MESSAGE.exec(filename.trim())?.[1] ?? null;
}

export function telegramMessageIdFromContent(
  content: Pick<ContentObject, "canonicalUrl" | "provenance">,
): string | null {
  const canonical = content.canonicalUrl ? TELEGRAM_MESSAGE_URL.exec(content.canonicalUrl)?.[1] : null;
  if (canonical) return canonical;

  const asset = content.provenance.asset?.trim() ?? "";
  const fromAsset = asset ? telegramMessageIdFromMediaFilename(asset) : null;
  if (fromAsset) return fromAsset;

  const location = content.provenance.location?.trim() ?? "";
  return location ? LOCATION_MESSAGE.exec(location)?.[1] ?? null : null;
}

function imageOrdinal(name: string): number {
  const match = /_(\d+)\.[^.]+$/u.exec(name);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function resolveOriginalArticleImage(
  content: Pick<ContentObject, "specialty" | "canonicalUrl" | "provenance">,
  artifacts: readonly ArticleSourceArtifact[],
): ArticleSourceArtifact | null {
  const explicitAsset = content.provenance.asset?.trim();
  if (explicitAsset) {
    const exact = artifacts.find(artifact =>
      artifact.specialty === content.specialty
      && artifact.mimeType.startsWith("image/")
      && artifact.name === explicitAsset,
    );
    if (exact) return exact;
  }

  const messageId = telegramMessageIdFromContent(content);
  if (!messageId) return null;

  const candidates = artifacts
    .filter(artifact =>
      artifact.specialty === content.specialty
      && artifact.mimeType.startsWith("image/")
      && telegramMessageIdFromMediaFilename(artifact.name) === messageId,
    )
    .sort((a, b) => imageOrdinal(a.name) - imageOrdinal(b.name) || a.name.localeCompare(b.name));

  return candidates[0] ?? null;
}
