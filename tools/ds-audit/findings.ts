import { fingerprint, normalizeRoute } from "./identity/fingerprint";
import { RULES, ruleById } from "./rules";
import type { Finding, PageSnapshot, RawFinding, Rule } from "./types";
import type { DesignSystem } from "./tokens";

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;

/** Stable order: priority, rule, page, viewport, fingerprint. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) =>
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    || a.id.localeCompare(b.id)
    || a.pages.join().localeCompare(b.pages.join())
    || a.viewport.localeCompare(b.viewport)
    || a.fingerprint.localeCompare(b.fingerprint));
}

/** One finding per fingerprint; repeats on the same page become `occurrences` and examples. */
export function aggregate(raw: RawFinding[]): Finding[] {
  const byFp = new Map<string, Finding & { _examples: Set<string> }>();
  for (const item of raw) {
    const rule = ruleById(item.id) as Rule;
    const route = normalizeRoute(item.route);
    const fp = fingerprint({ ruleId: item.id, identityVersion: rule.identityVersion, route, viewport: item.viewport, locator: item.locator, evidenceKey: item.evidenceKey });
    const existing = byFp.get(fp);
    if (existing) {
      existing.occurrences += 1;
      if (item.example) existing._examples.add(item.example);
      continue;
    }
    byFp.set(fp, {
      id: item.id,
      priority: item.priority ?? rule.priority,
      pages: [route],
      viewport: item.viewport,
      fact: item.fact,
      rule: rule.rule,
      fix: rule.fix,
      where: item.where,
      check: rule.check,
      blocking: item.blocking ?? rule.blocking,
      fingerprint: fp,
      status: "NEW",
      layer: "deterministic",
      occurrences: 1,
      examples: [],
      _examples: new Set(item.example ? [item.example] : []),
    });
  }
  return sortFindings([...byFp.values()].map(({ _examples, ...finding }) => ({ ...finding, examples: [..._examples].sort().slice(0, 5) })));
}

export function runRules(snapshots: PageSnapshot[], ds: DesignSystem, year: number): Finding[] {
  const ordered = [...snapshots].sort((a, b) => a.route.localeCompare(b.route) || a.viewport.localeCompare(b.viewport));
  return aggregate(RULES.flatMap(rule => rule.run({ snapshots: ordered, ds, year })));
}
