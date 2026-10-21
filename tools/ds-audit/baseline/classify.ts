import { sortFindings } from "../findings";
import type { BaselineStatus, Finding, Gate, Viewport } from "../types";

export interface Classification {
  findings: Finding[];
  fixed: Finding[];
  notCompared: number;
  counts: { count_new: number; count_existing: number; count_fixed: number };
}

/** A baseline finding is comparable only if this run audited its page(s) in its viewport(s). */
function audited(finding: Finding, routes: Set<string>, viewports: Set<Viewport>): boolean {
  const pagesOk = finding.pages.every(page => page === "*" || routes.has(page));
  const viewportOk = finding.viewport === "both" ? viewports.size > 0 : viewports.has(finding.viewport);
  return pagesOk && viewportOk;
}

/**
 * NEW: in this run, not in the baseline. EXISTING: in both. FIXED: in the baseline,
 * not in this run, and the page/viewport was audited this time. Without a baseline every
 * finding stays NEW, and the gate becomes advisory (see computeGate).
 */
export function classify(current: Finding[], baseline: Finding[] | null, scope: { routes: string[]; viewports: Viewport[] }): Classification {
  if (!baseline) {
    const findings = sortFindings(current.map(f => ({ ...f, status: "NEW" as const })));
    return { findings, fixed: [], notCompared: 0, counts: { count_new: findings.length, count_existing: 0, count_fixed: 0 } };
  }
  const base = new Map(baseline.filter(f => f.layer === "deterministic").map(f => [f.fingerprint, f]));
  const now = new Set(current.map(f => f.fingerprint));
  const findings = sortFindings(current.map(f => ({ ...f, status: base.has(f.fingerprint) ? "EXISTING" as const : "NEW" as const })));
  const routes = new Set(scope.routes);
  const viewports = new Set(scope.viewports);
  const gone = [...base.values()].filter(f => !now.has(f.fingerprint));
  const fixed = sortFindings(gone.filter(f => audited(f, routes, viewports)).map(f => ({ ...f, status: "FIXED" as const })));
  return {
    findings,
    fixed,
    notCompared: gone.length - fixed.length,
    counts: {
      count_new: findings.filter(f => f.status === "NEW").length,
      count_existing: findings.filter(f => f.status === "EXISTING").length,
      count_fixed: fixed.length,
    },
  };
}

/**
 * Regression gate: only NEW deterministic findings with blocking=true fail.
 * EXISTING never blocks; R-10 and other warnings are blocking=false; semantic findings are advisory.
 * Without a baseline the audit is advisory and the status is success, never a false failure.
 */
export function computeGate(findings: Finding[], baselineStatus: BaselineStatus): Gate {
  const blockingNew = findings.filter(f => f.status === "NEW" && f.layer === "deterministic" && f.blocking).length;
  if (baselineStatus === "unavailable" || baselineStatus === "not_applicable") {
    return { state: "success", blocking_new: 0, advisory: true, description: "Базового отчёта нет — аудит рекомендательный" };
  }
  if (blockingNew > 0) return { state: "failure", blocking_new: blockingNew, advisory: false, description: `Новых блокирующих нарушений DS: ${blockingNew}` };
  return { state: "success", blocking_new: 0, advisory: false, description: "Новых блокирующих нарушений DS нет" };
}
