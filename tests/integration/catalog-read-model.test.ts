import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@/db/client";
import { canonicalEventContent, educationContent } from "@/lib/ui/content-completeness";
import { listContent, listSources } from "@/server/repositories/catalog";

describe("seeded catalog integration", () => {
  it("reads the canonical cardiology Golden Set plus explicit prototype expansion and keeps oncology empty", async () => {
    const [cardiologyContent, cardiologySources, oncologyContent, oncologySources] = await Promise.all([
      listContent("cardiology"),
      listSources("cardiology"),
      listContent("oncology"),
      listSources("oncology"),
    ]);

    const canonicalContent = cardiologyContent.filter(item => !item.tags.includes("hardcoded-copy"));
    const prototypeContent = cardiologyContent.filter(item => item.tags.includes("hardcoded-copy"));
    const canonicalSources = cardiologySources.filter(source => !source.id.startsWith("hardcoded-editorial-"));
    const prototypeSources = cardiologySources.filter(source => source.id.startsWith("hardcoded-editorial-"));

    expect(canonicalContent).toHaveLength(54);
    expect(prototypeContent.length).toBeGreaterThan(0);
    expect(canonicalSources).toHaveLength(18);
    expect(prototypeSources).toHaveLength(1);
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
