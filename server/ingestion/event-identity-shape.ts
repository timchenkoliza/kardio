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
 * Diagnostic identity key only. It deliberately normalizes the two transport-level
 * differences already observed in the source archive: http -> https and a missing
 * trailing slash. Query parameters are preserved because we have not yet shown
 * empirically that they are non-identifying.
 */
export function diagnosticEventReferenceKey(value: string): string | null {
  const parsed = safeScardioUrl(value);
  if (!parsed) return null;
  const segments = eventSegments(parsed);
  if (!segments) return null;
  return withNormalizedEventPath(parsed, segments);
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
