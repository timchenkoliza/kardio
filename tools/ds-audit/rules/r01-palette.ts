import type { RawFinding, Rule } from "../types";
import { quote, readableTexts } from "./util";

export const r01: Rule = {
  id: "R-01",
  title: "Цвета текста и фона — из палитры",
  identityVersion: 1,
  priority: "P2",
  blocking: true,
  rule: "Color: только токены (`design-system/tokens.json`)",
  fix: "Заменить цвет на семантический токен `--ws-*` из палитры DS",
  check: "R-01 в отчёте аудита: 0 находок для этого элемента",
  run: ({ snapshots, ds }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      for (const item of readableTexts(s, ["text"])) {
        if (item.inSvg || !item.colorRaw || ds.palette.has(item.colorRaw)) continue;
        out.push({ id: "R-01", route: s.route, viewport: s.viewport, locator: item.component, evidenceKey: `text:${item.colorRaw}`, fact: `Цвет текста ${item.colorRaw} не из палитры DS: ${quote(item.text)}`, where: item.component, example: item.text });
      }
      for (const item of readableTexts(s, ["text"])) {
        if (item.inSvg) continue;
        for (const layer of item.bgLayers) {
          if (ds.palette.has(layer)) continue;
          out.push({ id: "R-01", route: s.route, viewport: s.viewport, locator: item.component, evidenceKey: `background:${layer}`, fact: `Фон текста ${layer} не из палитры DS: ${quote(item.text)}`, where: item.component, example: item.text });
        }
      }
    }
    return out;
  },
};
