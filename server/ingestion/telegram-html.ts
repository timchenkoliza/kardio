import { createHash } from "node:crypto";
import type { SpecialtyId } from "@/lib/domain/types";

export interface TelegramLinkCandidate {
  href: string;
  label: string;
}

export type TelegramMediaKind = "photo" | "video" | "file" | "gif" | "round_video" | "voice" | "sticker" | "webpage_thumb" | "other";

export interface TelegramMediaCandidate {
  href: string;
  kind: TelegramMediaKind;
}

export interface TelegramPostCandidate {
  sourceRegistryId: string;
  specialty: SpecialtyId;
  messageId: string;
  stableId: string;
  kind: "post" | "service";
  publishedAt: string | null;
  publishedAtRaw: string | null;
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
];

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

function parseTelegramTimestamp(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2}) UTC([+-])(\d{2}):?(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute, second, sign, offsetHour, offsetMinute] = match;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
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
    links.push({ href, label });
  }
  return links;
}

function mediaKind(href: string): TelegramMediaKind | null {
  const normalized = href.replace(/^\.\//, "");
  for (const [prefix, kind] of MEDIA_PREFIXES) if (normalized.startsWith(prefix)) return kind;
  return null;
}

function collectMedia(links: readonly TelegramLinkCandidate[]): TelegramMediaCandidate[] {
  const media: TelegramMediaCandidate[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const kind = mediaKind(link.href);
    if (!kind || seen.has(link.href)) continue;
    seen.add(link.href);
    media.push({ href: link.href, kind });
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
      publishedAt: parseTelegramTimestamp(publishedAtRaw),
      publishedAtRaw,
      authorName: fromName ? plainText(fromName) || null : null,
      text,
      hashtags: collectHashtags(text),
      links,
      media: collectMedia(links),
      rawFragmentSha256: createHash("sha256").update(fragment).digest("hex"),
    });
  }

  return posts;
}
