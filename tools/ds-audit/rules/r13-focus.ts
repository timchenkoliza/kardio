import type { RawFinding, Rule } from "../types";

/**
 * Not in the TASK.md table: added so the deterministic layer reproduces reference DS-08.
 * Visits tab stops on desktop and checks for a solid outline ≥ 2 px on the element or a :focus-within ancestor.
 */
export const r13: Rule = {
  id: "R-13",
  title: "Видимый фокус с клавиатуры",
  identityVersion: 1,
  priority: "P1",
  blocking: true,
  rule: "Accessibility → Focus: 2 px solid `focus-ring`, offset 2 px; ореол `shadow-focus` — только дополнение",
  fix: "`outline: 2px solid var(--ws-focus-ring); outline-offset: 2px` на элементе или `:focus-within` у контейнера",
  check: "Tab по странице: у каждой остановки видна сплошная рамка",
  run: ({ snapshots }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      if (s.viewport !== "desktop") continue;
      for (const f of s.focus) {
        if (f.excluded || f.indicator) continue;
        out.push({ id: "R-13", route: s.route, viewport: s.viewport, locator: f.component, evidenceKey: "", fact: `Нет сплошной рамки фокуса: outline ${f.outlineStyle} ${f.outlineWidth} px${f.boxShadow !== "none" ? ", только box-shadow" : ""}`, where: f.component, example: f.tag });
      }
    }
    return out;
  },
};
