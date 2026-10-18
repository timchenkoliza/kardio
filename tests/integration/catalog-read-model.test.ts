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

    expect(cardiologyContent).toHaveLength(54);
    expect(cardiologySources).toHaveLength(18);
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
