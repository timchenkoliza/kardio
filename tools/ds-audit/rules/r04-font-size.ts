import type { RawFinding, Rule } from "../types";
import { px, quote, readableTexts } from "./util";

export const r04: Rule = {
  id: "R-04",
  title: "Кегль ≥ 11 px",
  identityVersion: 1,
  priority: "P1",
  blocking: true,
  rule: "Typography: no text is smaller than 11 px",
  fix: "Перевести на `--font-size-micro` (11 px) или крупнее",
  check: "Вычисленный `font-size` ≥ 11 px на всех страницах",
  run: ({ snapshots }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      for (const item of readableTexts(s, ["text"])) {
        if (item.inSvg || item.fontSize === null || item.fontSize >= 10.99) continue;
        out.push({ id: "R-04", route: s.route, viewport: s.viewport, locator: item.component, evidenceKey: "", fact: `Кегль ${px(item.fontSize)}: ${quote(item.text)}`, where: item.component, example: item.text });
      }
    }
    return out;
  },
};
