import type { RawFinding, Rule } from "../types";
import { px, quote, readableTexts } from "./util";

/** WCAG large text: 24 px+, or 18.66 px+ bold. */
const isLarge = (fontSize: number, weight: number) => fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);

export const r02: Rule = {
  id: "R-02",
  title: "Контраст текста",
  identityVersion: 1,
  priority: "P1",
  blocking: true,
  rule: "Accessibility: контраст ≥ 4,5:1, для крупного текста ≥ 3:1",
  fix: "Взять пару из «Guaranteed text/background pairings» DS: `text-secondary` вместо `text-tertiary`, `accent-ink` на `canvas`/`accent-wash`",
  check: "R-02 и axe `color-contrast` на странице: 0",
  run: ({ snapshots, ds }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      for (const item of readableTexts(s, ["text"])) {
        if (item.inSvg || item.disabled || item.bgImage || item.contrast === null || item.fontSize === null) continue;
        const weight = item.fontWeight ?? 400;
        const threshold = isLarge(item.fontSize, weight) ? 3 : 4.5;
        if (item.contrast >= threshold) continue;
        // DS known gap: the white label of the primary button on accent, 14 px / 600, is a warning.
        const exception = item.primaryButton && item.fg === ds.inverseText && item.bgLayers[0] === ds.accent && Math.round(item.fontSize) === 14 && weight >= 600;
        out.push({
          id: "R-02", route: s.route, viewport: s.viewport, locator: item.component, evidenceKey: `${item.fg}/${item.bg}`,
          fact: `Контраст ${item.contrast.toFixed(2).replace(".", ",")}:1 < ${String(threshold).replace(".", ",")}:1 — ${item.fg} на ${item.bg}, ${px(item.fontSize)}/${weight}: ${quote(item.text)}${exception ? " (известное исключение DS: подпись основной кнопки)" : ""}`,
          where: item.component, example: item.text,
          ...(exception ? { blocking: false, priority: "P3" as const } : {}),
        });
      }
    }
    return out;
  },
};
