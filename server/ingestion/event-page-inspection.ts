export interface StructuredEventSignal {
  types: readonly string[];
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  url: string | null;
  locationName: string | null;
}

export interface EventPageSignals {
  sourceUrl: string;
  htmlTitle: string | null;
  canonicalHref: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  jsonLdTypes: readonly string[];
  structuredEvents: readonly StructuredEventSignal[];
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    lt: "<",
    nbsp: " ",
    quot: '"',
    raquo: "»",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      const point = Number.parseInt(code.slice(2), 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    if (code.startsWith("#")) {
      const point = Number.parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function plainText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function attribute(tag: string, name: string): string | null {
  const quoted = tag.match(new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  if (quoted) return decodeHtml(quoted[2]);
  const unquoted = tag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return unquoted ? decodeHtml(unquoted[1]) : null;
}

function firstMetaContent(html: string, key: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const property = attribute(tag, "property") ?? attribute(tag, "name");
    if (property?.toLocaleLowerCase("en-US") !== key.toLocaleLowerCase("en-US")) continue;
    return attribute(tag, "content");
  }
  return null;
}

function firstCanonicalHref(html: string): string | null {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = attribute(tag, "rel")?.toLocaleLowerCase("en-US").split(/\s+/) ?? [];
    if (!rel.includes("canonical")) continue;
    return attribute(tag, "href");
  }
  return null;
}

function normalizeTypes(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function locationName(value: unknown): string | null {
  if (typeof value === "string") return stringField(value);
  if (!value || typeof value !== "object") return null;
  return stringField((value as Record<string, unknown>).name);
}

function jsonLdObjects(html: string): Record<string, unknown>[] {
  const roots: Record<string, unknown>[] = [];
  const expression = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(expression)) {
    const type = attribute(match[1], "type")?.toLocaleLowerCase("en-US");
    if (type !== "application/ld+json") continue;
    try {
      const parsed = JSON.parse(match[2].trim()) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) if (item && typeof item === "object") roots.push(item as Record<string, unknown>);
      } else if (parsed && typeof parsed === "object") {
        roots.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Malformed source JSON-LD is ignored rather than repaired/inferred.
    }
  }
  return roots;
}

function flattenJsonLd(roots: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    result.push(object);
    if (Array.isArray(object["@graph"])) visit(object["@graph"]);
  };
  for (const root of roots) visit(root);
  return result;
}

function isStructuredEventType(type: string): boolean {
  return type === "Event" || type.endsWith("Event");
}

export function parseEventPageSignals(html: string, sourceUrl: string): EventPageSignals {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const objects = flattenJsonLd(jsonLdObjects(html));
  const allTypes = [...new Set(objects.flatMap((object) => normalizeTypes(object["@type"])))];
  const structuredEvents = objects.flatMap((object): StructuredEventSignal[] => {
    const types = normalizeTypes(object["@type"]);
    if (!types.some(isStructuredEventType)) return [];
    return [{
      types,
      name: stringField(object.name),
      startDate: stringField(object.startDate),
      endDate: stringField(object.endDate),
      url: stringField(object.url),
      locationName: locationName(object.location),
    }];
  });

  return {
    sourceUrl,
    htmlTitle: titleMatch ? plainText(titleMatch[1]) || null : null,
    canonicalHref: firstCanonicalHref(html),
    ogTitle: firstMetaContent(html, "og:title"),
    ogDescription: firstMetaContent(html, "og:description"),
    jsonLdTypes: allTypes,
    structuredEvents,
  };
}
