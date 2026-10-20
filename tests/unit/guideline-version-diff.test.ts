import { describe, expect, it } from "vitest";
import {
  diffGuidelineDocuments,
  guidelineChangeStats,
  guidelineChangesFromAttributes,
  guidelineChangesToAttributes,
  type GuidelineVersionDocument,
} from "@/lib/agents/guideline-version-diff";

function document(version: string, recommendations: GuidelineVersionDocument["recommendations"]): GuidelineVersionDocument {
  return {
    id: `g-${version}`,
    title: "Guideline",
    version,
    publishedAt: `${version}-01-01`,
    sourceUrl: `https://example.org/${version}`,
    recommendations,
  };
}

const base = {
  recommendationClass: null,
  evidenceLevel: null,
  patientScope: null,
  practiceImpact: null,
  sourceUrl: "https://example.org/guideline",
};

describe("guideline version diff", () => {
  it("classifies new, changed, removed and unchanged recommendations", () => {
    const previous = document("2024", [
      { id: "same", text: "Continue therapy A.", ...base },
      { id: "changed", text: "Therapy B may be considered.", recommendationClass: "IIb", evidenceLevel: "B", patientScope: null, practiceImpact: null, sourceUrl: base.sourceUrl },
      { id: "removed", text: "Use therapy C.", ...base },
    ]);
    const next = document("2026", [
      { id: "same", text: "Continue therapy A.", ...base },
      { id: "changed", text: "Therapy B is recommended.", recommendationClass: "I", evidenceLevel: "A", patientScope: "Adults with condition X", practiceImpact: "Use therapy B as recommended treatment.", sourceUrl: base.sourceUrl },
      { id: "new", text: "Consider therapy D.", ...base },
    ]);

    const changes = diffGuidelineDocuments(previous, next);
    expect(Object.fromEntries(changes.map(change => [change.id, change.changeKind]))).toEqual({
      changed: "CHANGED",
      new: "NEW",
      removed: "REMOVED",
      same: "UNCHANGED",
    });
    const changed = changes.find(change => change.id === "changed");
    expect(changed?.recommendationClassBefore).toBe("IIb");
    expect(changed?.recommendationClassAfter).toBe("I");
    expect(changed?.evidenceLevelBefore).toBe("B");
    expect(changed?.evidenceLevelAfter).toBe("A");
    expect(changed?.patientScope).toBe("Adults with condition X");
    expect(changed?.practiceImpact).toContain("therapy B");
    expect(guidelineChangeStats(changes)).toEqual({ NEW: 1, CHANGED: 1, REMOVED: 1, UNCHANGED: 1, actionable: 1 });
  });

  it("persists comparison basis and changes without losing provenance fields", () => {
    const changes = diffGuidelineDocuments(
      document("2024", [{ id: "r1", text: "Old recommendation", ...base }]),
      document("2026", [{ id: "r1", text: "New recommendation", recommendationClass: "IIa", evidenceLevel: "B", patientScope: "Population", practiceImpact: "Change practice", sourceUrl: base.sourceUrl }]),
    );
    const attributes = guidelineChangesToAttributes({
      basis: "available_text_pair",
      previousVersion: "2024",
      newVersion: "2026",
      changes,
      metadataDeltas: ["Версия 2026 заменяет 2024"],
    });
    const restored = guidelineChangesFromAttributes(attributes);
    expect(restored?.basis).toBe("available_text_pair");
    expect(restored?.previousVersion).toBe("2024");
    expect(restored?.newVersion).toBe("2026");
    expect(restored?.changes[0]?.recommendationClassAfter).toBe("IIa");
    expect(restored?.changes[0]?.supportText).toBe("New recommendation");
    expect(restored?.metadataDeltas).toEqual(["Версия 2026 заменяет 2024"]);
  });

  it("does not manufacture clinical change when texts and grades are identical", () => {
    const previous = document("2024", [{ id: "r1", text: "Same recommendation", recommendationClass: "I", evidenceLevel: "A", patientScope: null, practiceImpact: null, sourceUrl: base.sourceUrl }]);
    const next = document("2026", [{ id: "r1", text: "Same recommendation", recommendationClass: "I", evidenceLevel: "A", patientScope: null, practiceImpact: null, sourceUrl: base.sourceUrl }]);
    expect(diffGuidelineDocuments(previous, next)[0]?.changeKind).toBe("UNCHANGED");
  });
});
