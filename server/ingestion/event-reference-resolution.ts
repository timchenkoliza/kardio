import { createHash } from "node:crypto";

export type EventReferenceResolutionBasis = "explicit_scardio_event_url";

export interface EventReferenceResolution {
  id: string;
  normalizedUrl: string;
  host: "scardio.ru";
  basis: EventReferenceResolutionBasis;
}

function safeHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeScardioEventUrl(parsed: URL): string {
  const normalized = new URL(parsed.toString());
  normalized.hostname = "scardio.ru";
  normalized.hash = "";
  if ((normalized.protocol === "http:" && normalized.port === "80") || (normalized.protocol === "https:" && normalized.port === "443")) {
    normalized.port = "";
  }
  return normalized.toString();
}

export function resolveExplicitScardioEventReference(href: string): EventReferenceResolution | null {
  const parsed = safeHttpUrl(href);
  if (!parsed) return null;
  const host = parsed.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
  if (host !== "scardio.ru") return null;
  if (!/^\/events(?:\/|$)/i.test(parsed.pathname)) return null;

  const normalizedUrl = normalizeScardioEventUrl(parsed);
  const digest = createHash("sha256").update(normalizedUrl).digest("hex");
  return {
    id: `event-ref:${digest}`,
    normalizedUrl,
    host: "scardio.ru",
    basis: "explicit_scardio_event_url",
  };
}

export function eventReferenceMentionId(args: {
  distributionCandidateId: string;
  linkOrdinal: number;
  eventCandidateId: string;
}): string {
  const digest = createHash("sha256")
    .update(`${args.distributionCandidateId}\u0000${args.linkOrdinal}\u0000${args.eventCandidateId}`)
    .digest("hex");
  return `event-ref-mention:${digest}`;
}
