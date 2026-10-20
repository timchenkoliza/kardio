import { describe, expect, it } from "vitest";
import { guidelineChangesFromAttributes } from "@/lib/agents/guideline-version-diff";
import { societyGuidelineChanges } from "@/server/agents/services/guideline-diff";
import { testContext } from "./agent-test-utils";

describe("guidelines v2 runtime", () => {
  it("keeps curated ESC changes distinct from a full-text pair comparison", async () => {
    const ctx = await testContext({ agentId: "guidelines", topics: ["hf"] });
    const drafts = societyGuidelineChanges(ctx);
    const hf = drafts.find(draft => draft.title.includes("сердечная недостаточность"));
    expect(hf).toBeDefined();
    const diff = guidelineChangesFromAttributes(hf!.attributes);
    expect(diff?.basis).toBe("curated_delta");
    expect(diff?.changes.length).toBeGreaterThanOrEqual(5);
    expect(hf?.attributes.textCompared).toBe(false);
    expect(String(hf?.attributes.deltas)).toContain("не построчный full-text diff");
  });

  it("exposes only source-supported class, patient scope and practice impact", async () => {
    const ctx = await testContext({ agentId: "guidelines", topics: ["hf"] });
    const hf = societyGuidelineChanges(ctx).find(draft => draft.title.includes("сердечная недостаточность"));
    const diff = hf ? guidelineChangesFromAttributes(hf.attributes) : null;
    const obesity = diff?.changes.find(change => change.recommendationClassAfter === "IIa");
    expect(obesity?.patientScope).toContain("ФВ ЛЖ ≥45%");
    expect(obesity?.patientScope).toContain("ИМТ ≥30");
    expect(obesity?.practiceImpact).toContain("семаглутид");
    expect(obesity?.previousText).toBeNull();
  });
});
