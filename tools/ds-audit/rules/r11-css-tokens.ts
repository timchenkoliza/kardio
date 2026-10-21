import { normalizeValue } from "../tokens";
import type { CssRuleItem, RawFinding, Rule } from "../types";

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\b(?:white|black|red|green|blue|gray|grey|yellow|orange|purple|pink)\b/;
const COLOR_PROPS = /(?:^|-)(?:color|background|border|outline|shadow|fill|stroke|caret|decoration|column-rule|accent)(?:-|$)|^background$|^border(?:-(?:top|right|bottom|left))?$/;
const ILLUSTRATION = /\.fa-[\w-]/;

/** Last compound of the first selector, without pseudo parts: `.ws-app .ws-feed-card:hover` → `.ws-feed-card`. */
export function selectorRoot(selector: string): string {
  const first = selector.split(",")[0].trim();
  const compounds = first.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = (compounds[compounds.length - 1] ?? first).replace(/::?[\w-]+(\([^)]*\))?/g, "");
  const cls = last.match(/\.[\w-]+/);
  const attrs = last.match(/\[[^\]]+\]/g) ?? [];
  const tag = last.match(/^[a-z][\w-]*/i);
  return (cls ? cls[0] : tag ? tag[0] : last) + attrs.join("") || first;
}

function uniqueRules(rules: CssRuleItem[]): CssRuleItem[] {
  const seen = new Map<string, CssRuleItem>();
  for (const rule of rules) {
    const key = JSON.stringify([rule.sheet, rule.media, rule.selector, rule.declarations]);
    if (!seen.has(key)) seen.set(key, rule);
  }
  return [...seen.values()];
}

const isRoot = (selector: string) => selector.split(",").map(part => part.trim()).every(part => part === ":root" || part === "html");

export const r11: Rule = {
  id: "R-11",
  title: "CSS совпадает с токенами DS",
  identityVersion: 1,
  priority: "P2",
  blocking: true,
  rule: "One source: каждое значение — из `tokens.json`; без старого слоя `--color-*` и литералов цвета вне файла токенов",
  fix: "Привести `:root` к `design-system/tokens.json`; заменить литерал или `var(--color-*)` на `var(--ws-*)`",
  check: "R-11: 0 расхождений; `grep \"var(--color-\"` пуст вне архива",
  run: ({ snapshots, ds }) => {
    const out: RawFinding[] = [];
    const rules = uniqueRules(snapshots.flatMap(s => s.css));
    if (!rules.length) return out;
    const site = { route: "*", viewport: "both" as const };

    const rootValues = new Map<string, string>();
    for (const rule of rules) {
      if (!isRoot(rule.selector) || rule.media) continue;
      for (const [prop, value] of rule.declarations) if (prop.startsWith("--")) rootValues.set(prop, value);
    }
    for (const [name, expected] of [...ds.cssTokens].sort(([a], [b]) => a.localeCompare(b))) {
      const actual = rootValues.get(name);
      if (actual === undefined) {
        out.push({ ...site, id: "R-11", locator: ":root", evidenceKey: `missing:${name}`, fact: `В \`:root\` нет токена \`${name}\` (по DS: ${expected})`, where: name });
      } else if (normalizeValue(actual) !== expected) {
        out.push({ ...site, id: "R-11", locator: ":root", evidenceKey: `mismatch:${name}`, fact: `\`${name}\`: в CSS ${actual.trim()}, по DS ${expected}`, where: name });
      }
    }
    for (const name of [...rootValues.keys()].sort()) {
      if (name.startsWith("--ws-") && !ds.cssTokens.has(name)) {
        out.push({ ...site, id: "R-11", locator: ":root", evidenceKey: `extra:${name}`, fact: `\`${name}\` нет в \`tokens.json\``, where: name, blocking: false, priority: "P3" });
      }
    }

    for (const rule of rules) {
      if (ILLUSTRATION.test(rule.selector)) continue;
      const root = selectorRoot(rule.selector);
      for (const [prop, value] of rule.declarations) {
        if (value.includes("var(--color-")) {
          out.push({ ...site, id: "R-11", locator: `css ${root}`, evidenceKey: "legacy-color-var", fact: `Старый слой токенов: \`${prop}: ${value.slice(0, 80)}\` в \`${rule.selector.slice(0, 80)}\``, where: rule.selector.slice(0, 120), example: `${prop}: ${value.slice(0, 60)}` });
          continue;
        }
        const custom = prop.startsWith("--");
        if (custom && isRoot(rule.selector) && !rule.media) continue;
        if (!custom && !COLOR_PROPS.test(prop)) continue;
        if (!COLOR_LITERAL.test(value)) continue;
        out.push({
          ...site, id: "R-11", locator: `css ${root}`, evidenceKey: custom ? "token-override" : "literal-color",
          fact: custom ? `Токен \`${prop}\` переопределён вне \`:root\`: \`${rule.selector.slice(0, 80)} { ${prop}: ${value.slice(0, 40)} }\`` : `Литерал цвета вне файла токенов: \`${prop}: ${value.slice(0, 60)}\` в \`${rule.selector.slice(0, 80)}\``,
          where: rule.selector.slice(0, 120), example: `${prop}: ${value.slice(0, 60)}`,
        });
      }
    }
    return out;
  },
};
