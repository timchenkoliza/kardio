import type { RawFinding, Rule } from "../types";
import { quote } from "./util";

export const r07: Rule = {
  id: "R-07",
  title: "Заголовки: один h1, уровни без пропусков",
  identityVersion: 1,
  priority: "P1",
  blocking: true,
  rule: "Accessibility: семантика заголовков (чек-лист №15)",
  fix: "Оставить ровно один `h1`; добавить промежуточный уровень (видимый или `.sr-only` `h2`) или понизить уровень",
  check: "R-07 и axe `heading-order`: 0",
  run: ({ snapshots }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      if (s.error) continue;
      if (s.h1Count !== 1) out.push({ id: "R-07", route: s.route, viewport: s.viewport, locator: "document", evidenceKey: s.h1Count === 0 ? "h1-missing" : "h1-multiple", fact: `На странице ${s.h1Count} \`h1\` (нужен ровно один)`, where: "h1" });
      let previous: number | null = null;
      for (const heading of s.headings) {
        if (previous !== null && heading.level > previous + 1) {
          out.push({ id: "R-07", route: s.route, viewport: s.viewport, locator: heading.component, evidenceKey: `h${previous}->h${heading.level}`, fact: `Уровень заголовка прыгает с h${previous} на h${heading.level}: ${quote(heading.text)}`, where: heading.component, example: heading.text });
        }
        previous = heading.level;
      }
    }
    return out;
  },
};
