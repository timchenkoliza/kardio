import { inspectEventReferenceShape } from "@/server/ingestion/event-identity-shape";

export type DiagnosticEventRole =
  | "page_surface_like"
  | "occurrence_like"
  | "series_like"
  | "unresolved";

export interface EventRoleDiagnosis {
  role: DiagnosticEventRole;
  evidence: readonly string[];
}

const PAGE_SURFACE_LEAF_PATTERNS: readonly RegExp[] = [
  /^registraciya$/i,
  /^tv_?studiya$/i,
  /^tv__studiya$/i,
  /^videotranslyaciya$/i,
  /^translyaciya$/i,
  /^programma(?:_|$)/i,
  /^programma_po_razdelam$/i,
  /^pravila(?:_|$)/i,
  /^trebovaniya(?:_|$)/i,
  /^nepreryvnoe_medicinskoe_obrazovanie$/i,
];

export function isDiagnosticPageSurfaceLeaf(leafSegment: string | null): boolean {
  if (!leafSegment) return false;
  return PAGE_SURFACE_LEAF_PATTERNS.some((pattern) => pattern.test(leafSegment));
}

/**
 * Diagnostic role only. This function does not create or approve a canonical event
 * identity. It uses bounded structural signals observed in the scardio archive:
 * exact page-surface leaf names, explicit year tokens, and long reuse spans.
 */
export function diagnoseEventReferenceRole(args: {
  canonicalReferenceUrl: string;
  mentionSpanDaysApprox: number | null;
}): EventRoleDiagnosis {
  const shape = inspectEventReferenceShape(args.canonicalReferenceUrl);
  if (!shape) return { role: "unresolved", evidence: ["unparseable_reference_shape"] };

  if (isDiagnosticPageSurfaceLeaf(shape.leafSegment)) {
    return {
      role: "page_surface_like",
      evidence: [`surface_leaf:${shape.leafSegment}`],
    };
  }

  if (shape.yearTokens.length > 0) {
    return {
      role: "occurrence_like",
      evidence: shape.yearTokens.map((year) => `year_token:${year}`),
    };
  }

  if (args.mentionSpanDaysApprox !== null && args.mentionSpanDaysApprox >= 180) {
    return {
      role: "series_like",
      evidence: [`mention_span_days>=180:${args.mentionSpanDaysApprox.toFixed(1)}`],
    };
  }

  return { role: "unresolved", evidence: [] };
}
