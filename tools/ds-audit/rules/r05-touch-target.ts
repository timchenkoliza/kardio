import type { RawFinding, Rule } from "../types";
import { quote } from "./util";

export const r05: Rule = {
  id: "R-05",
  title: "Зона нажатия ≥ 44×44 на 390 px",
  identityVersion: 1,
  priority: "P1",
  blocking: true,
  rule: "Accessibility → Interaction targets: `touch-target` 44 × 44 px",
  fix: "Визуальный размер оставить; на `@media (pointer: coarse)` расширить хит-зону до 44×44 (`min-height: var(--ws-touch-target)` или `::before` с `position: absolute`)",
  check: "R-05 на мобильном вьюпорте: 0 для этого элемента",
  run: ({ snapshots }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      if (s.viewport !== "mobile") continue;
      for (const t of s.targets) {
        if (t.excluded || t.inText || (t.width >= 43.5 && t.height >= 43.5)) continue;
        out.push({ id: "R-05", route: s.route, viewport: s.viewport, locator: t.component, evidenceKey: "", fact: `Зона нажатия ${t.width}×${t.height}${t.name ? `: ${quote(t.name, 40)}` : ""}`, where: t.component, example: t.name || t.tag });
      }
    }
    return out;
  },
};
