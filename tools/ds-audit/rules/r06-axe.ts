import type { RawFinding, Rule } from "../types";

export const r06: Rule = {
  id: "R-06",
  title: "axe-core: 0 serious / critical",
  identityVersion: 1,
  priority: "P1",
  blocking: true,
  rule: "Accessibility: WCAG 2.2 A/AA (axe теги wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa)",
  fix: "Исправить по описанию правила axe (ссылка — в id правила)",
  check: "axe на странице: 0 нарушений уровня serious и critical",
  run: ({ snapshots }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      for (const v of s.axe) {
        if (v.impact !== "serious" && v.impact !== "critical") continue;
        for (const node of v.nodes) {
          const locator = node.component ?? node.target.replace(/:nth-(child|of-type)\(\d+\)/g, "");
          out.push({ id: "R-06", route: s.route, viewport: s.viewport, locator, evidenceKey: v.id, fact: `axe \`${v.id}\` (${v.impact}): ${v.help}`, where: node.target, example: node.html.slice(0, 120) });
        }
      }
    }
    return out;
  },
};
