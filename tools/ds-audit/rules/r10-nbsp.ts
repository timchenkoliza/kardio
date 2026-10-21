import type { RawFinding, Rule } from "../types";
import { quote, readableTexts } from "./util";

/** A one-to-three-letter word, or a number before a unit, followed by an ordinary space. */
const HANGING = /(?:^|[\s«(„])([А-Яа-яЁёA-Za-z]{1,3}) (?=\S)|\d (?=(?:%|кг|мг|мкг|мл|мм|см|мин|ч|сек|лет|года?|дн(?:ей|я)?|мес)(?![А-Яа-яЁё]))/u;

export const r10: Rule = {
  id: "R-10",
  title: "Неразрывные пробелы",
  identityVersion: 1,
  priority: "P2",
  blocking: false,
  rule: "Content fundamentals → Typography: неразрывный пробел после слов из 1–3 букв и между числом и единицей",
  fix: "Прогонять заголовки и резюме через типограф: U+00A0 после коротких слов, перед тире, между числом и единицей",
  check: "R-10: 0 предупреждений в заголовках и резюме",
  run: ({ snapshots }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      for (const item of readableTexts(s, ["text"])) {
        if (item.role === "other") continue;
        const match = item.raw.match(HANGING);
        if (!match) continue;
        out.push({ id: "R-10", route: s.route, viewport: s.viewport, locator: item.component, evidenceKey: "", fact: `Обычный пробел после «${match[0].trim()}» в ${quote(item.text)}`, where: item.component, example: item.text });
      }
    }
    return out;
  },
};
