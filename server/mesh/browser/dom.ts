import { parseHTML } from "linkedom";
import { SourceToolError } from "./errors";
import type { SemanticTarget } from "./drivers";

/**
 * DOM helpers for extraction. Extractors express what they need as semantic
 * targets (structure + visible text); a missing required target is a
 * `layout_changed` failure, never an empty success.
 */

export type DomDocument = ReturnType<typeof parseHTML>["document"];
export type DomElement = NonNullable<ReturnType<DomDocument["querySelector"]>>;

export function parseDocument(html: string): DomDocument {
  // Scripts and styles never carry content we extract; dropping them keeps text clean.
  const cleaned = html.replace(/<script\b[\s\S]*?<\/script>/giu, "").replace(/<style\b[\s\S]*?<\/style>/giu, "").replace(/<noscript\b[\s\S]*?<\/noscript>/giu, "");
  return parseHTML(cleaned).document;
}

/** Visible text with collapsed whitespace and non-breaking spaces normalised. */
export function textOf(node: { textContent: string | null } | null | undefined): string {
  return (node?.textContent ?? "").replace(/ /gu, " ").replace(/[ \t\r\n]+/gu, " ").trim();
}

export function findAll(root: DomDocument | DomElement, target: SemanticTarget): DomElement[] {
  const elements = [...root.querySelectorAll(target.css ?? "*")] as DomElement[];
  return target.text ? elements.filter(element => target.text!.test(textOf(element))) : elements;
}

export function requireOne(root: DomDocument | DomElement, target: SemanticTarget, extractor: string, url: string): DomElement {
  const found = findAll(root, target)[0];
  if (!found) throw new SourceToolError("layout_changed", `${extractor}: ${target.describe}`, url);
  return found;
}

export function absoluteUrl(href: string, base: string): string {
  return new URL(href, base).toString();
}

/**
 * Text of a section that starts at `heading` and runs until the next heading
 * of the same or higher level (h1–h3), in document order. With `ownTextOnly`
 * it stops at any heading, so a parent section never repeats the text of its
 * subsections (each subsection is its own chunk).
 */
export function sectionText(heading: DomElement, options: { ownTextOnly?: boolean } = {}): string {
  const level = options.ownTextOnly ? 3 : Number(heading.tagName.slice(1)) || 3;
  const parts: string[] = [];
  let node = heading.nextSibling as unknown as (DomElement & { nodeType: number; nextSibling: unknown }) | null;
  while (node) {
    const tag = node.nodeType === 1 ? node.tagName : "";
    if (/^H[1-6]$/u.test(tag) && Number(tag.slice(1)) <= level) break;
    if (node.nodeType === 1) {
      const nested = node.querySelector?.("h1, h2, h3");
      if (nested && Number(nested.tagName.slice(1)) <= level) {
        // Content before a nested heading still belongs to this section.
        const before: string[] = [];
        for (const child of [...node.childNodes] as Array<DomElement & { nodeType: number }>) {
          if (child.nodeType === 1 && /^H[1-3]$/u.test(child.tagName)) break;
          before.push(textOf(child));
        }
        parts.push(before.join(" "));
        break;
      }
    }
    parts.push(textOf(node as unknown as { textContent: string | null }));
    node = node.nextSibling as typeof node;
  }
  return parts.join(" ").replace(/\s+/gu, " ").trim();
}

/** First sentences of a text up to `max` characters, cut on a sentence boundary when possible. */
export function excerpt(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const slice = text.slice(0, max);
  const boundary = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "));
  const cut = boundary > max * 0.5 ? slice.slice(0, boundary + 1) : `${slice.replace(/\s+\S*$/u, "")}…`;
  return { text: cut.trim(), truncated: true };
}

/** Sentences of a text (Russian/English punctuation), keeping abbreviations like «т. д.» intact enough for quoting. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z«(])/u).map(sentence => sentence.trim()).filter(Boolean);
}
