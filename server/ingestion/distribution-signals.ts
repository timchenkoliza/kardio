export const EXPLICIT_FORMAT_RULES = {
  "#рко_вебинар": "webinar",
  "#рко_лекция": "lecture",
  "#рко_мероприятия": "event",
  "#рко_новости": "news",
  "#рко_полезныйматериал": "useful_material",
} as const;

export type ExplicitDistributionFormat = (typeof EXPLICIT_FORMAT_RULES)[keyof typeof EXPLICIT_FORMAT_RULES];

export interface DistributionSignalInput {
  hashtags: readonly string[];
  bodyText: string;
  externalLinks: readonly string[];
}

export interface DistributionSignals {
  explicitFormats: readonly ExplicitDistributionFormat[];
  matchedFormatHashtags: readonly string[];
  externalDomains: readonly string[];
  scardioEventPageLinks: readonly string[];
}

function normalizeHashtag(tag: string): string {
  return tag.trim().toLocaleLowerCase("ru-RU");
}

function safeUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizedHostname(url: URL): string {
  return url.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
}

export function deriveDistributionSignals(input: DistributionSignalInput): DistributionSignals {
  const explicitFormats: ExplicitDistributionFormat[] = [];
  const matchedFormatHashtags: string[] = [];
  const seenFormats = new Set<ExplicitDistributionFormat>();

  for (const originalTag of input.hashtags) {
    const tag = normalizeHashtag(originalTag);
    const format = EXPLICIT_FORMAT_RULES[tag as keyof typeof EXPLICIT_FORMAT_RULES];
    if (!format) continue;
    matchedFormatHashtags.push(tag);
    if (!seenFormats.has(format)) {
      seenFormats.add(format);
      explicitFormats.push(format);
    }
  }

  const externalDomains: string[] = [];
  const scardioEventPageLinks: string[] = [];
  const seenDomains = new Set<string>();
  const seenEventLinks = new Set<string>();

  for (const href of input.externalLinks) {
    const parsed = safeUrl(href);
    if (!parsed) continue;
    const hostname = normalizedHostname(parsed);
    if (!seenDomains.has(hostname)) {
      seenDomains.add(hostname);
      externalDomains.push(hostname);
    }

    if (hostname === "scardio.ru" && /^\/events(?:\/|$)/i.test(parsed.pathname) && !seenEventLinks.has(href)) {
      seenEventLinks.add(href);
      scardioEventPageLinks.push(href);
    }
  }

  return {
    explicitFormats,
    matchedFormatHashtags,
    externalDomains,
    scardioEventPageLinks,
  };
}
