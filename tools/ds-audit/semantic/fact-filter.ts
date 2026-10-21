import type { PageSnapshot } from "../types";
import type { SemanticRawFinding } from "./schema";

const squash = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * A semantic finding survives only if it points at a fact on the audited pages:
 * its selector is a component locator seen there and its quote occurs verbatim in visible text.
 * Findings without a fact are dropped, not shown.
 */
export function filterFacts(findings: SemanticRawFinding[], snapshots: PageSnapshot[]): { kept: SemanticRawFinding[]; dropped: SemanticRawFinding[] } {
  const kept: SemanticRawFinding[] = [];
  const dropped: SemanticRawFinding[] = [];
  for (const finding of findings) {
    const pages = snapshots.filter(s => finding.pages.includes(s.route));
    const components = new Set(pages.flatMap(s => [...s.texts.map(t => t.component), ...s.targets.map(t => t.component), ...s.headings.map(h => h.component)]));
    const text = pages.map(s => squash(`${s.bodyText} ${s.texts.map(t => t.text).join(" ")}`)).join(" ");
    const quote = squash(finding.quote);
    const ok = pages.length > 0 && components.has(finding.selector) && quote.length >= 2 && text.includes(quote);
    (ok ? kept : dropped).push(finding);
  }
  return { kept, dropped };
}
