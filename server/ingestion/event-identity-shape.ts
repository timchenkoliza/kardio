export interface EventReferenceShape {
  sourceUrl: string;
  eventSegments: readonly string[];
  pathDepth: number;
  rootSegment: string | null;
  leafSegment: string | null;
  parentUrl: string | null;
  yearTokens: readonly string[];
  hasQuery: boolean;
  diagnosticStructuralKey: string;
}

function safeScardioUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || host !== "scardio.ru") return null;
    return parsed;
  } catch {
    return null;
  }
}

function eventSegments(parsed: URL): string[] | null {
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments[0]?.toLocaleLowerCase("en-US") !== "events") return null;
  return segments.slice(1);
}

function withNormalizedEventPath(parsed: URL, segments: readonly string[]): string {
  const normalized = new URL(parsed.toString());
  normalized.protocol = "https:";
  normalized.hostname = "scardio.ru";
  normalized.port = "";
  normalized.hash = "";
  normalized.pathname = `/events/${segments.map((segment) => encodeURIComponent(decodeURIComponent(segment))).join("/")}${segments.length ? "/" : ""}`;
  return normalized.toString();
}

/**
 * Transport-level reference identity only. Gate 10 showed that http/https and
 * missing trailing slashes create duplicate URL-reference candidates in the
 * observed archive. Those differences are now safe to collapse.
 *
 * Query parameters remain identifying because the source sample has not shown
 * that they are transport noise. This key must not be interpreted as a
 * ProfessionalEvent identity: registration pages, TV-studio pages, series and
 * event occurrences may still share structural ancestry while representing
 * different world objects.
 */
export function transportNormalizedEventReferenceKey(value: string): string | null {
  const parsed = safeScardioUrl(value);
  if (!parsed) return null;
  const segments = eventSegments(parsed);
  if (!segments) return null;
  return withNormalizedEventPath(parsed, segments);
}

/** @deprecated Use transportNormalizedEventReferenceKey for persisted transport grouping. */
export function diagnosticEventReferenceKey(value: string): string | null {
  return transportNormalizedEventReferenceKey(value);
}

export function inspectEventReferenceShape(value: string): EventReferenceShape | null {
  const parsed = safeScardioUrl(value);
  if (!parsed) return null;
  const segments = eventSegments(parsed);
  if (!segments) return null;

  const parentSegments = segments.length >= 2 ? segments.slice(0, -1) : null;
  const years = new Set<string>();
  for (const segment of segments) {
    for (const match of segment.matchAll(/(?:^|_)(20\d{2})(?=_|$)/g)) years.add(match[1]);
  }

  return {
    sourceUrl: value,
    eventSegments: segments,
    pathDepth: segments.length,
    rootSegment: segments[0] ?? null,
    leafSegment: segments.at(-1) ?? null,
    parentUrl: parentSegments ? withNormalizedEventPath(parsed, parentSegments) : null,
    yearTokens: [...years],
    hasQuery: parsed.search.length > 0,
    diagnosticStructuralKey: withNormalizedEventPath(parsed, segments),
  };
}
