import type { ResultAttributeValue } from "./types";

export type GuidelineChangeKind = "NEW" | "CHANGED" | "REMOVED" | "UNCHANGED";
export type GuidelineComparisonBasis = "available_text_pair" | "curated_delta" | "current_text_only" | "metadata_only";

export interface GuidelineRecommendationVersion {
  id: string;
  text: string;
  recommendationClass: string | null;
  evidenceLevel: string | null;
  patientScope: string | null;
  practiceImpact: string | null;
  sourceUrl: string | null;
}

export interface GuidelineVersionDocument {
  id: string;
  title: string;
  version: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  recommendations: GuidelineRecommendationVersion[];
}

export interface GuidelineRecommendationChange {
  id: string;
  changeKind: GuidelineChangeKind;
  basis: GuidelineComparisonBasis;
  previousText: string | null;
  currentText: string | null;
  recommendationClassBefore: string | null;
  recommendationClassAfter: string | null;
  evidenceLevelBefore: string | null;
  evidenceLevelAfter: string | null;
  patientScope: string | null;
  practiceImpact: string | null;
  supportText: string | null;
  sourceUrl: string | null;
}

export interface GuidelineChangeStats {
  NEW: number;
  CHANGED: number;
  REMOVED: number;
  UNCHANGED: number;
  actionable: number;
}

const ATTR_PREFIX = "guidelineDiff";

function normalizedText(value: string | null): string {
  return (value ?? "").replace(/\s+/gu, " ").trim().toLocaleLowerCase("ru-RU");
}

function equivalent(a: GuidelineRecommendationVersion, b: GuidelineRecommendationVersion): boolean {
  return normalizedText(a.text) === normalizedText(b.text)
    && normalizedText(a.recommendationClass) === normalizedText(b.recommendationClass)
    && normalizedText(a.evidenceLevel) === normalizedText(b.evidenceLevel);
}

export function diffGuidelineDocuments(
  previous: GuidelineVersionDocument,
  next: GuidelineVersionDocument,
  basis: GuidelineComparisonBasis = "available_text_pair",
): GuidelineRecommendationChange[] {
  const before = new Map(previous.recommendations.map(item => [item.id, item]));
  const after = new Map(next.recommendations.map(item => [item.id, item]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();

  return ids.map(id => {
    const oldItem = before.get(id) ?? null;
    const newItem = after.get(id) ?? null;
    const changeKind: GuidelineChangeKind = !oldItem ? "NEW" : !newItem ? "REMOVED" : equivalent(oldItem, newItem) ? "UNCHANGED" : "CHANGED";
    return {
      id,
      changeKind,
      basis,
      previousText: oldItem?.text ?? null,
      currentText: newItem?.text ?? null,
      recommendationClassBefore: oldItem?.recommendationClass ?? null,
      recommendationClassAfter: newItem?.recommendationClass ?? null,
      evidenceLevelBefore: oldItem?.evidenceLevel ?? null,
      evidenceLevelAfter: newItem?.evidenceLevel ?? null,
      patientScope: newItem?.patientScope ?? oldItem?.patientScope ?? null,
      practiceImpact: newItem?.practiceImpact ?? null,
      supportText: newItem?.text ?? oldItem?.text ?? null,
      sourceUrl: newItem?.sourceUrl ?? oldItem?.sourceUrl ?? next.sourceUrl ?? previous.sourceUrl,
    };
  });
}

export function guidelineChangeStats(changes: readonly GuidelineRecommendationChange[]): GuidelineChangeStats {
  const stats: GuidelineChangeStats = { NEW: 0, CHANGED: 0, REMOVED: 0, UNCHANGED: 0, actionable: 0 };
  for (const change of changes) {
    stats[change.changeKind] += 1;
    if (change.practiceImpact) stats.actionable += 1;
  }
  return stats;
}

export function meaningfulGuidelineChanges(changes: readonly GuidelineRecommendationChange[]): GuidelineRecommendationChange[] {
  return changes.filter(change => change.changeKind !== "UNCHANGED");
}

export function guidelineChangesToAttributes(args: {
  basis: GuidelineComparisonBasis;
  previousVersion: string | null;
  newVersion: string | null;
  changes: readonly GuidelineRecommendationChange[];
  metadataDeltas?: readonly string[];
}): Record<string, ResultAttributeValue> {
  const stats = guidelineChangeStats(args.changes);
  return {
    [`${ATTR_PREFIX}.basis`]: args.basis,
    [`${ATTR_PREFIX}.previousVersion`]: args.previousVersion,
    [`${ATTR_PREFIX}.newVersion`]: args.newVersion,
    [`${ATTR_PREFIX}.changes`]: JSON.stringify(args.changes),
    [`${ATTR_PREFIX}.metadataDeltas`]: JSON.stringify(args.metadataDeltas ?? []),
    [`${ATTR_PREFIX}.newCount`]: stats.NEW,
    [`${ATTR_PREFIX}.changedCount`]: stats.CHANGED,
    [`${ATTR_PREFIX}.removedCount`]: stats.REMOVED,
    [`${ATTR_PREFIX}.unchangedCount`]: stats.UNCHANGED,
    [`${ATTR_PREFIX}.actionableCount`]: stats.actionable,
  };
}

export function guidelineChangesFromAttributes(attributes: Record<string, ResultAttributeValue>): {
  basis: GuidelineComparisonBasis;
  previousVersion: string | null;
  newVersion: string | null;
  changes: GuidelineRecommendationChange[];
  metadataDeltas: string[];
} | null {
  const basis = attributes[`${ATTR_PREFIX}.basis`];
  if (basis !== "available_text_pair" && basis !== "curated_delta" && basis !== "current_text_only" && basis !== "metadata_only") return null;
  const raw = attributes[`${ATTR_PREFIX}.changes`];
  const metaRaw = attributes[`${ATTR_PREFIX}.metadataDeltas`];
  let changes: GuidelineRecommendationChange[] = [];
  let metadataDeltas: string[] = [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) changes = parsed.filter(item => item && typeof item === "object") as GuidelineRecommendationChange[];
  } catch { changes = []; }
  try {
    const parsed = typeof metaRaw === "string" ? JSON.parse(metaRaw) : [];
    if (Array.isArray(parsed)) metadataDeltas = parsed.filter((item): item is string => typeof item === "string");
  } catch { metadataDeltas = []; }
  const stringOrNull = (value: ResultAttributeValue | undefined) => typeof value === "string" && value.trim() ? value : null;
  return {
    basis,
    previousVersion: stringOrNull(attributes[`${ATTR_PREFIX}.previousVersion`]),
    newVersion: stringOrNull(attributes[`${ATTR_PREFIX}.newVersion`]),
    changes,
    metadataDeltas,
  };
}

export function guidelineBasisLabel(basis: GuidelineComparisonBasis): string {
  if (basis === "available_text_pair") return "Сравнены доступные тексты двух версий";
  if (basis === "curated_delta") return "Проверенный обзор изменений, без построчного сравнения текстов";
  if (basis === "current_text_only") return "Доступен только текст новой версии";
  return "Сравнены только метаданные версий";
}
