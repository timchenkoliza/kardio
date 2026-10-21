import type { RawFinding, Rule } from "../types";
import { px, quote, readableTexts } from "./util";

export const r03: Rule = {
  id: "R-03",
  title: "Межстрочный интервал ≥ 1,2",
  identityVersion: 1,
  priority: "P1",
  blocking: true,
  rule: "Typography: line height is never below 1.2",
  fix: "Поднять `--ws-leading-*` до значений `tokens.json` (не ниже 1.2); убрать захардкоженный `line-height`",
  check: "Вычисленный `line-height / font-size` ≥ 1,2 на всех страницах",
  run: ({ snapshots }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      for (const item of readableTexts(s, ["text"])) {
        // 0.005 absorbs sub-pixel rounding of computed line-height.
        if (item.inSvg || item.lineHeightRatio === null || item.lineHeightRatio >= 1.195) continue;
        out.push({ id: "R-03", route: s.route, viewport: s.viewport, locator: item.component, evidenceKey: "", fact: `Интервал ${String(item.lineHeightRatio).replace(".", ",")} (${px(item.fontSize)} / ${px(item.lineHeight)}): ${quote(item.text)}`, where: item.component, example: item.text });
      }
    }
    return out;
  },
};
