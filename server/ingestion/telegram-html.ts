import { createHash } from "node:crypto";
import type { SpecialtyId } from "@/lib/domain/types";

export type TelegramLinkKind = "external" | "internal_navigation" | "local_artifact" | "other";

export interface TelegramLinkCandidate {
  href: string;
  label: string;
  kind: TelegramLinkKind;
}

export type TelegramMediaKind =
  | "photo"
  | "video"
  | "file"
  | "gif"
  | "round_video"
  | "voice"
  | "sticker"
  | "webpage_thumb"
  | "thumbnail"
  | "other";

export interface TelegramMediaCandidate {
  href: string;
  kind: TelegramMediaKind;
}

export type TelegramTimestampBasis = "offset_explicit" | "source_local" | "unknown";

export interface TelegramPostCandidate {
  sourceRegistryId: string;
  specialty: SpecialtyId;
  messageId: string;
  stableId: string;
  kind: "post" | "service";
  /**
   * ISO instant when the export contains an explicit UTC offset, otherwise a
   * normalized source-local wall-clock value without an invented timezone.
   */
  publishedAt: string | null;
  publishedAtRaw: string | null;
  publishedAtBasis: TelegramTimestampBasis;
  authorName: string | null;
  text: string;
  hashtags: readonly string[];
  links: readonly TelegramLinkCandidate[];
  media: readonly TelegramMediaCandidate[];
  rawFragmentSha256: string;
}

const MEDIA_PREFIXES: ReadonlyArray<[string, TelegramMediaKind]> = [
  ["photos/", "photo"],
  ["video_files/", "video"],
  ["files/", "file"],
  ["gifs/", "gif"],
  ["round_video_messages/", "round_video"],
  ["voice_messages/", "voice"],
  ["stickers/", "sticker"],
  ["webpage_thumbs/", "webpage_thumb"],
  ["thumbs/", "thumbnail"],
];

const ENGLISH_MONTHS: Readonly<Record<string, number>> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

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

function plainText(fragment: string): string {
  return decodeHtml(
    fragment
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function attribute(value: string, name: string): string | null {
  const match = value.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? decodeHtml(match[1]) : null;
}

function divInnerByClass(fragment: string, className: string): string | null {
  const expression = new RegExp(`<div[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, "i");
  return fragment.match(expression)?.[1] ?? null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function validWallClock(year: number, month: number, day: number, hour: number, minute: number, second: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
}

function parseTelegramTimestamp(raw: string | null): { value: string | null; basis: TelegramTimestampBasis } {
  if (!raw) return { value: null, basis: "unknown" };

  const explicitOffset = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2}) UTC([+-])(\d{2}):?(\d{2})$/);
  if (explicitOffset) {
    const [, day, month, year, hour, minute, second, sign, offsetHour, offsetMinute] = explicitOffset;
    const parsed = new Date(`${year}-${pad2(Number(month))}-${pad2(Number(day))}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`);
    return Number.isNaN(parsed.valueOf())
      ? { value: null, basis: "unknown" }
      : { value: parsed.toISOString(), basis: "offset_explicit" };
  }

  // Observed in the real Telegram Desktop export connected for cardiology_channel_01:
  // "11 March 2022, 15:28:27". The export does not state a timezone, so keep
  // it as a normalized wall-clock value instead of silently inventing UTC/MSK.
  const sourceLocal = raw.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4}), (\d{2}):(\d{2}):(\d{2})$/);
  if (sourceLocal) {
    const [, dayRaw, monthName, yearRaw, hourRaw, minuteRaw, secondRaw] = sourceLocal;
    const month = ENGLISH_MONTHS[monthName.toLowerCase()];
    const day = Number(dayRaw);
    const year = Number(yearRaw);
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const second = Number(secondRaw);
    if (month && validWallClock(year, month, day, hour, minute, second)) {
      return {
        value: `${yearRaw}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`,
        basis: "source_local",
      };
    }
  }

  return { value: null, basis: "unknown" };
}

function mediaKind(href: string): TelegramMediaKind | null {
  const normalized = href.replace(/^\.\//, "");
  for (const [prefix, kind] of MEDIA_PREFIXES) if (normalized.startsWith(prefix)) return kind;
  return null;
}

function linkKind(href: string): TelegramLinkKind {
  if (href === "#" || href.startsWith("javascript:")) return "internal_navigation";
  if (mediaKind(href)) return "local_artifact";
  if (/^https?:\/\//i.test(href) || /^(?:mailto|tel):/i.test(href)) return "external";
  return "other";
}

function collectLinks(fragment: string): TelegramLinkCandidate[] {
  const links: TelegramLinkCandidate[] = [];
  const seen = new Set<string>();
  const expression = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of fragment.matchAll(expression)) {
    const href = attribute(match[1], "href");
    if (!href) continue;
    const label = plainText(match[2]);
    const key = `${href}\u0000${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ href, label, kind: linkKind(href) });
  }
  return links;
}

function collectMedia(fragment: string, links: readonly TelegramLinkCandidate[]): TelegramMediaCandidate[] {
  const media: TelegramMediaCandidate[] = [];
  const seen = new Set<string>();
  const add = (href: string) => {
    const kind = mediaKind(href);
    if (!kind || seen.has(href)) return;
    seen.add(href);
    media.push({ href, kind });
  };

  for (const link of links) add(link.href);

  // Telegram webpage/video previews often expose their local image only via
  // <img src>, not via an anchor href. Capture those references while excluding
  // sender avatars so transport metadata does not masquerade as post media.
  const imageExpression = /<img\b([^>]*)>/gi;
  for (const match of fragment.matchAll(imageExpression)) {
    const attributes = match[1];
    const classNames = attribute(attributes, "class") ?? "";
    if (/\buserpic\b/i.test(classNames)) continue;
    const src = attribute(attributes, "src");
    if (src) add(src);
  }

  return media;
}

function collectHashtags(text: string): string[] {
  const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(tags.map((tag) => tag.toLocaleLowerCase("ru-RU")))];
}

function messageStarts(html: string): Array<{ index: number; classNames: string; messageId: string }> {
  const starts: Array<{ index: number; classNames: string; messageId: string }> = [];
  const expression = /<div\s+class="([^"]*\bmessage\b[^"]*)"\s+id="message(-?\d+)"/gi;
  for (const match of html.matchAll(expression)) {
    if (match.index === undefined) continue;
    starts.push({ index: match.index, classNames: match[1], messageId: match[2] });
  }
  return starts;
}

export function parseTelegramDesktopHtml(
  html: string,
  context: { sourceRegistryId: string; specialty: SpecialtyId },
): readonly TelegramPostCandidate[] {
  const starts = messageStarts(html);
  const posts: TelegramPostCandidate[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = starts[index + 1]?.index ?? html.length;
    const fragment = html.slice(start.index, end);
    const dateTag = fragment.match(/<div[^>]*class="[^"]*\bdate\b[^"]*\bdetails\b[^"]*"[^>]*>/i)?.[0] ?? null;
    const publishedAtRaw = dateTag ? attribute(dateTag, "title") : null;
    const parsedTimestamp = parseTelegramTimestamp(publishedAtRaw);
    const fromName = divInnerByClass(fragment, "from_name");
    const textInner = divInnerByClass(fragment, "text");
    const text = textInner ? plainText(textInner) : "";
    const links = collectLinks(fragment);

    posts.push({
      sourceRegistryId: context.sourceRegistryId,
      specialty: context.specialty,
      messageId: start.messageId,
      stableId: `${context.sourceRegistryId}:message:${start.messageId}`,
      kind: /\bservice\b/i.test(start.classNames) ? "service" : "post",
      publishedAt: parsedTimestamp.value,
      publishedAtRaw,
      publishedAtBasis: parsedTimestamp.basis,
      authorName: fromName ? plainText(fromName) || null : null,
      text,
      hashtags: collectHashtags(text),
      links,
      media: collectMedia(fragment, links),
      rawFragmentSha256: createHash("sha256").update(fragment).digest("hex"),
    });
  }

  return posts;
}
