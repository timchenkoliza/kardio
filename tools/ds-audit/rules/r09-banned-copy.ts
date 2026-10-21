import { BANNED_COPY } from "../banned-copy";
import type { RawFinding, Rule } from "../types";
import { quote, readableTexts } from "./util";

export const r09: Rule = {
  id: "R-09",
  title: "Запрещённые строки в видимом тексте",
  identityVersion: 1,
  priority: "P1",
  blocking: true,
  rule: "Content fundamentals (`tools/ds-audit/banned-copy.ts`)",
  fix: "См. факт: замена для каждого паттерна указана в `banned-copy.ts`",
  check: "R-09: 0 совпадений в видимом тексте",
  run: ({ snapshots }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      for (const item of readableTexts(s)) {
        for (const banned of BANNED_COPY) {
          for (const match of item.raw.matchAll(banned.pattern)) {
            out.push({
              id: "R-09", route: s.route, viewport: s.viewport, locator: item.component,
              evidenceKey: `${banned.id}:${match[0].toLowerCase()}`,
              fact: `${banned.why}: «${match[0]}» в ${quote(item.text)}. ${banned.fix}`,
              where: item.component, example: item.text, priority: banned.priority,
            });
          }
        }
      }
    }
    return out;
  },
};
