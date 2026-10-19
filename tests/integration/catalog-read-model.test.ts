import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@/db/client";
import { canonicalEventContent, educationContent } from "@/lib/ui/content-completeness";
import { listContent, listSources } from "@/server/repositories/catalog";

describe("seeded catalog integration", () => {
  it("reads the cardiology Golden Set and keeps oncology empty", async () => {
    const [cardiologyContent, cardiologySources, oncologyContent, oncologySources] = await Promise.all([
      listContent("cardiology"),
      listSources("cardiology"),
      listContent("oncology"),
      listSources("oncology"),
    ]);

    // The read model appends labelled prototype editorial cards (cardiology only);
    // the canonical Golden Set underneath must stay exactly 54 objects / 18 sources.
    const isEditorialDraft = (sourceId: string) => sourceId.startsWith("hardcoded-editorial");
    const canonicalContent = cardiologyContent.filter(item => !isEditorialDraft(item.sourceId));
    const drafts = cardiologyContent.filter(item => isEditorialDraft(item.sourceId));
    expect(canonicalContent).toHaveLength(54);
    expect(cardiologySources.filter(source => !isEditorialDraft(source.id))).toHaveLength(18);
    expect(drafts.every(item => item.source.trustStatus === "requires_review")).toBe(true);
    expect(cardiologyContent.every(item => item.specialty === "cardiology")).toBe(true);
    expect(cardiologySources.every(source => source.specialty === "cardiology")).toBe(true);
    expect(educationContent(cardiologyContent).length).toBeGreaterThan(0);
    expect(canonicalEventContent(cardiologyContent).length).toBeGreaterThan(0);
    expect(oncologyContent).toEqual([]);
    expect(oncologySources).toEqual([]);
  });

  afterAll(async () => {
    await pool.end();
  });
});
