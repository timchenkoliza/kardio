import { describe, expect, it } from "vitest";
import { evidenceFromQuote, unavailableEvidence } from "@/server/agents/services/evidence";
import { factCheck, numericConsistency } from "@/server/agents/services/fact-check";
import { guidelineDiff, societyGuidelineChanges } from "@/server/agents/services/guideline-diff";
import { GUIDELINE_UPDATES } from "@/server/agents/snapshots/guideline-updates";
import { DRUG_CHANGES } from "@/server/agents/snapshots/drug-changes";
import { EVENT_RECORDS } from "@/server/agents/snapshots/events";
import { listContent } from "@/server/repositories/catalog";
import { testContext } from "./agent-test-utils";

function quote(claim: string, text: string, secondary = false) {
  return evidenceFromQuote({ connectorId: "esc-guidelines", sourceName: "AJMC", sourceUrl: "https://example.org/a", publisher: "ESC", retrievedAt: "2026-10-19T00:00:00.000Z", publishedAt: "2026-09-14", claim, quote: text, quoteLanguage: "en", quoteKind: "page_extract", level: "guideline", secondary });
}

describe("fact-check gate", () => {
  it("supports a translated quote whose numbers match", () => {
    const checked = factCheck(quote("Целевое САД ниже 130 мм рт. ст.", "The systolic blood pressure target drops to below 130 mm Hg"));
    expect(checked.verificationStatus).toBe("SUPPORTED");
  });

  it("rejects a claim whose numbers are not in the source", () => {
    const checked = factCheck(quote("Целевое САД ниже 120 мм рт. ст.", "The systolic blood pressure target drops to below 130 mm Hg"));
    expect(checked.verificationStatus).toBe("UNSUPPORTED");
    expect(numericConsistency("9,8 мм рт. ст.", "9.8 mm Hg")).toBe(true);
  });

  it("downgrades secondary sources and never upgrades unavailable connectors", () => {
    expect(factCheck(quote("Целевое САД ниже 130 мм рт. ст.", "below 130 mm Hg", true)).verificationStatus).toBe("PARTIALLY_SUPPORTED");
    expect(factCheck(unavailableEvidence("Отличия версий", "catalog", "нет текста", "2026-10-19T00:00:00.000Z")).verificationStatus).toBe("UNSUPPORTED");
    expect(factCheck(quote("x", "y"), { connectorAvailable: false }).verificationStatus).toBe("UNKNOWN");
  });

  it("marks prototype editorial drafts as unsupported", () => {
    expect(factCheck(quote("Что-то", "Что-то"), { unverifiedDraft: true }).verificationStatus).toBe("UNSUPPORTED");
  });

  it("every curated snapshot claim passes numeric consistency against its quote", () => {
    for (const record of GUIDELINE_UPDATES) for (const assertion of record.assertions) expect(numericConsistency(assertion.claim, assertion.quote)).toBe(true);
    for (const record of DRUG_CHANGES) for (const claim of record.claims) expect(numericConsistency(claim.claim, claim.quote)).toBe(true);
    for (const record of EVENT_RECORDS) expect(record.listingUrl).toMatch(/^https:\/\//);
  });
});

describe("guideline diff", () => {
  it("compares real catalog version chains by metadata and ICD coverage", async () => {
    const content = await listContent("cardiology");
    const previous = content.find(item => item.id === "gl-ph-2020");
    const next = content.find(item => item.id === "gl-ph-2024");
    expect(previous && next).toBeTruthy();
    const deltas = guidelineDiff(previous!, next!);
    expect(deltas.map(delta => delta.field)).toContain("year");
    expect(deltas.find(delta => delta.field === "icd_added")?.label).toContain("I27.0");
  });

  it("returns ESC 2026 heart failure deltas with provenance for HF topics", async () => {
    const ctx = await testContext({ agentId: "guidelines", topics: ["hf"] });
    const drafts = societyGuidelineChanges(ctx);
    const hf = drafts.find(draft => draft.key.includes("guideline"));
    expect(hf).toBeDefined();
    const record = drafts.find(draft => draft.title.includes("сердечная недостаточность"));
    expect(record?.evidence.length).toBe(5);
    expect(record?.evidence.every(item => item.sourceUrl && item.retrievedAt && item.verificationStatus !== "UNSUPPORTED")).toBe(true);
    expect(record?.source.sourceUrl).toBe("https://doi.org/10.1093/eurheartj/ehag100");
  });
});
