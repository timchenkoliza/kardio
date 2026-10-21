import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * design-system/tokens.json → palette for R-01 and the expected CSS custom
 * properties for R-11. tokens.json is the source of truth; CSS is checked against it.
 */

interface TokenEntry { name: string; value: unknown }
interface TypeStyle { name: string; fontSize: string; lineHeight: number; letterSpacing?: string }
interface TokensJson {
  name: string;
  version: number;
  color: { tokens: TokenEntry[] };
  type: { families: Record<string, string>; groups: Array<{ family: string; styles: TypeStyle[] }> };
  spacing: { tokens: TokenEntry[] };
  radius: { tokens: TokenEntry[] };
  shadow: { tokens: TokenEntry[] };
  layout: { tokens: TokenEntry[] };
}

export interface DesignSystem {
  version: number;
  /** Hash of README.md + tokens.json content. */
  contentHash: string;
  /** Canonical colours (#rrggbb, or #rrggbbaa when translucent) → token name. */
  palette: Map<string, string>;
  /** CSS custom property name → normalized expected value. */
  cssTokens: Map<string, string>;
  /** Hex of `accent` and `inverse-text`: the known white-on-accent exception of R-02. */
  accent: string;
  inverseText: string;
}

const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000", transparent: "#00000000" };

/** Any CSS colour literal → #rrggbb or #rrggbbaa (alpha only when < 1). */
export function canonicalColor(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (NAMED[value]) return NAMED[value];
  let m = value.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map(ch => ch + ch).join("");
    if (hex.length === 8 && hex.endsWith("ff")) hex = hex.slice(0, 6);
    return hex.length === 6 || hex.length === 8 ? `#${hex}` : null;
  }
  m = value.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    const channel = (part: string) => Math.round(part.endsWith("%") ? parseFloat(part) * 2.55 : Number(part));
    const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : Number(parts[3]);
    const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
    const base = `#${hex(channel(parts[0]))}${hex(channel(parts[1]))}${hex(channel(parts[2]))}`;
    return alpha >= 1 ? base : base + hex(Math.round(alpha * 255));
  }
  return null;
}

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

/** Comparable form of a token value: lower case, canonical colours, single spaces, no trailing zeros. */
export function normalizeValue(input: string): string {
  return input
    .trim()
    .replace(/\{([\w-]+)\}/g, "var(--ws-$1)")
    .replace(COLOR_LITERAL, literal => canonicalColor(literal) ?? literal.toLowerCase())
    .replace(/\s+/g, " ")
    .replace(/(^|[^\d.])\.(\d)/g, "$10.$2")
    .replace(/(\d+\.\d*?)0+(?!\d)/g, "$1")
    .replace(/(\d)\.(?!\d)/g, "$1")
    .toLowerCase();
}

/** CSS name for a type style's line height: both display sizes share one token in code. */
function leadingName(style: string): string {
  return style.startsWith("display-") ? "--ws-leading-display" : `--ws-leading-${style}`;
}

export function loadDesignSystem(tokensPath: string, readmePath: string): DesignSystem {
  const raw = readFileSync(tokensPath, "utf8");
  const readme = readFileSync(readmePath, "utf8");
  const json = JSON.parse(raw) as TokensJson;
  const contentHash = createHash("sha256").update(readme).update("\0").update(raw).digest("hex").slice(0, 12);

  const colorValues = new Map<string, string>();
  for (const token of json.color.tokens) {
    const value = (token.value as Record<string, string>).light;
    colorValues.set(token.name, value);
  }
  const resolve = (value: string): string => {
    const ref = value.match(/^\{([\w-]+)\}$/);
    return ref ? resolve(colorValues.get(ref[1]) ?? value) : value;
  };

  const palette = new Map<string, string>();
  const cssTokens = new Map<string, string>();
  for (const [name, value] of colorValues) {
    const color = canonicalColor(resolve(value));
    if (color && !palette.has(color)) palette.set(color, name);
    cssTokens.set(`--ws-${name}`, normalizeValue(value));
  }
  for (const group of json.type.groups) {
    for (const style of group.styles) {
      cssTokens.set(`--font-size-${style.name}`, normalizeValue(style.fontSize));
      const leading = leadingName(style.name);
      const existing = cssTokens.get(leading);
      // Both display sizes map to one code token; keep the stricter (larger) requirement.
      const next = normalizeValue(String(style.lineHeight));
      if (!existing || Number(next) > Number(existing)) cssTokens.set(leading, next);
      if (style.letterSpacing) cssTokens.set(`--ws-tracking-${style.name}`, normalizeValue(style.letterSpacing));
    }
  }
  if (json.type.families.sans) cssTokens.set("--font-sans", normalizeValue(json.type.families.sans));
  for (const section of [json.spacing, json.radius, json.shadow, json.layout]) {
    for (const token of section.tokens) cssTokens.set(`--ws-${token.name}`, normalizeValue(String(token.value)));
  }

  return {
    version: json.version,
    contentHash,
    palette,
    cssTokens,
    accent: canonicalColor(resolve(colorValues.get("accent") ?? "#7275ff")) ?? "#7275ff",
    inverseText: canonicalColor(resolve(colorValues.get("inverse-text") ?? "#ffffff")) ?? "#ffffff",
  };
}
