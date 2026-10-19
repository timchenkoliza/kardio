export type TelegramMediaKind = "photo" | "video" | "file" | "gif" | "round_video" | "voice" | "sticker" | "webpage_thumb" | "thumbnail" | "other";

export type MediaSemanticRole =
  | "image_candidate"
  | "cine_candidate"
  | "document_candidate"
  | "audio_candidate"
  | "thumbnail_candidate"
  | "unsupported";

export type MediaTransportResolution = "resolved" | "missing" | "ambiguous" | "invalid_href";
export type MediaProductEligibility = "blocked_rights_unknown" | "blocked_missing_transport" | "blocked_ambiguous_transport" | "blocked_unsupported";

export interface RawMediaArtifactLike {
  id: string;
  providerItemId: string;
  parentProviderItemId: string | null;
  sourceRegistryId: string | null;
  name: string;
  mimeType: string;
  promotedNodeId?: string | null;
}

export interface TelegramMediaReferenceLike {
  candidateId: string;
  sourceRegistryId: string;
  ordinal: number;
  href: string;
  kind: TelegramMediaKind;
}

export interface ResolvedTelegramMediaReference {
  candidateId: string;
  sourceRegistryId: string;
  ordinal: number;
  href: string;
  normalizedPath: string | null;
  filename: string | null;
  kind: TelegramMediaKind;
  semanticRole: MediaSemanticRole;
  transportResolution: MediaTransportResolution;
  rawArtifactId: string | null;
  productEligibility: MediaProductEligibility;
  rightsState: "unknown";
}

const REMOTE_SCHEME = /^[a-z][a-z0-9+.-]*:/iu;

export function normalizeTelegramLocalMediaHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#") || REMOTE_SCHEME.test(trimmed)) return null;

  const withoutFragment = trimmed.split("#", 1)[0] ?? "";
  const withoutQuery = withoutFragment.split("?", 1)[0] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }

  const normalized = decoded
    .replaceAll("\\", "/")
    .replace(/^\.\//u, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/gu, "/");

  if (!normalized) return null;
  const parts = normalized.split("/");
  if (parts.some(part => part === ".." || part === "." || part === "")) return null;
  return normalized;
}

export function semanticRoleForTelegramMedia(kind: TelegramMediaKind): MediaSemanticRole {
  if (kind === "photo") return "image_candidate";
  if (kind === "video" || kind === "gif" || kind === "round_video") return "cine_candidate";
  if (kind === "file") return "document_candidate";
  if (kind === "voice") return "audio_candidate";
  if (kind === "webpage_thumb" || kind === "thumbnail") return "thumbnail_candidate";
  return "unsupported";
}

function buildArtifactPath(artifact: RawMediaArtifactLike, byProviderId: ReadonlyMap<string, RawMediaArtifactLike>): string {
  const names: string[] = [artifact.name];
  const seen = new Set<string>([artifact.providerItemId]);
  let parentId = artifact.parentProviderItemId;

  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byProviderId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentProviderItemId;
  }

  return names.join("/");
}

function suffixMatches(fullPath: string, relativePath: string): boolean {
  return fullPath === relativePath || fullPath.endsWith(`/${relativePath}`);
}

export function resolveTelegramMediaReference(
  reference: TelegramMediaReferenceLike,
  artifacts: readonly RawMediaArtifactLike[],
): ResolvedTelegramMediaReference {
  const semanticRole = semanticRoleForTelegramMedia(reference.kind);
  const normalizedPath = normalizeTelegramLocalMediaHref(reference.href);
  const filename = normalizedPath?.split("/").at(-1) ?? null;

  if (!normalizedPath || !filename) {
    return {
      ...reference,
      normalizedPath: null,
      filename: null,
      semanticRole,
      transportResolution: "invalid_href",
      rawArtifactId: null,
      productEligibility: semanticRole === "unsupported" ? "blocked_unsupported" : "blocked_missing_transport",
      rightsState: "unknown",
    };
  }

  const sourceArtifacts = artifacts.filter(artifact => artifact.sourceRegistryId === reference.sourceRegistryId);
  const byProviderId = new Map(sourceArtifacts.map(artifact => [artifact.providerItemId, artifact]));
  const pathMatches = sourceArtifacts.filter(artifact => suffixMatches(buildArtifactPath(artifact, byProviderId), normalizedPath));
  const fallbackMatches = pathMatches.length === 0
    ? sourceArtifacts.filter(artifact => artifact.name === filename)
    : [];
  const matches = pathMatches.length ? pathMatches : fallbackMatches;

  if (matches.length === 0) {
    return {
      ...reference,
      normalizedPath,
      filename,
      semanticRole,
      transportResolution: "missing",
      rawArtifactId: null,
      productEligibility: semanticRole === "unsupported" ? "blocked_unsupported" : "blocked_missing_transport",
      rightsState: "unknown",
    };
  }

  if (matches.length > 1) {
    return {
      ...reference,
      normalizedPath,
      filename,
      semanticRole,
      transportResolution: "ambiguous",
      rawArtifactId: null,
      productEligibility: "blocked_ambiguous_transport",
      rightsState: "unknown",
    };
  }

  return {
    ...reference,
    normalizedPath,
    filename,
    semanticRole,
    transportResolution: "resolved",
    rawArtifactId: matches[0]!.id,
    // Transport resolution is not rights approval. Unknown rights stays ineligible.
    productEligibility: semanticRole === "unsupported" ? "blocked_unsupported" : "blocked_rights_unknown",
    rightsState: "unknown",
  };
}
