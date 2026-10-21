import { LEXICON_ALLOWED_COMPONENTS, SPECIALTY_LEXICON, specialtyOf } from "../specialty-lexicon";
import type { RawFinding, Rule } from "../types";
import { quote, readableTexts } from "./util";

export const r12: Rule = {
  id: "R-12",
  title: "Нет перетекания контента между специальностями",
  identityVersion: 1,
  priority: "P0",
  blocking: true,
  rule: "Content: «Не врать»; кардиология не служит запасным вариантом для онкологии и наоборот",
  fix: "Брать списки источников, примеры и плейсхолдеры из конфига специальности",
  check: "R-12: на странице специальности нет терминов другой специальности",
  run: ({ snapshots }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      const own = specialtyOf(s.route);
      if (!own) continue;
      for (const [other, terms] of Object.entries(SPECIALTY_LEXICON)) {
        if (other === own) continue;
        for (const item of readableTexts(s)) {
          if (LEXICON_ALLOWED_COMPONENTS.some(pattern => pattern.test(item.component))) continue;
          for (const term of terms) {
            if (!term.pattern.test(item.raw)) continue;
            out.push({ id: "R-12", route: s.route, viewport: s.viewport, locator: item.component, evidenceKey: `${other}:${term.id}`, fact: `На странице «${own}» термин из «${other}» (${term.id}): ${quote(item.text)}`, where: item.component, example: item.text });
          }
        }
      }
    }
    return out;
  },
};
