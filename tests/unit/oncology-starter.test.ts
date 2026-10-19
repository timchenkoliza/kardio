import { describe, expect, it } from "vitest";
import { curatedSourcesForSpecialty, curatedSourcesForSurface } from "@/lib/ui/curated-external-tools";
import { oncologyStarterItems } from "@/lib/ui/oncology-starter";

describe("oncology starter layer", () => {
  it("covers the minimum professional destinations without synthetic cardiology reuse", () => {
    const kinds = new Set(oncologyStarterItems.map(item => item.kind));
    expect(kinds).toEqual(new Set(["guideline", "clinical", "evidence", "learning", "event"]));
    expect(oncologyStarterItems.every(item => item.url.startsWith("https://"))).toBe(true);
    expect(oncologyStarterItems.some(item => /кардиолог/i.test(`${item.title} ${item.summary}`))).toBe(false);
  });

  it("keeps starter identities unique", () => {
    const ids = oncologyStarterItems.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("adds oncology sources without leaking cardiology-only sources", () => {
    const sourceIds = curatedSourcesForSpecialty("oncology").map(source => source.id);
    expect(sourceIds).toContain("russco");
    expect(sourceIds).toContain("aor-guidelines");
    expect(sourceIds).toContain("esmo-guidelines");
    expect(sourceIds).not.toContain("rko");
    expect(sourceIds).not.toContain("bikbov");
  });

  it("has source-backed oncology education and event routes", () => {
    expect(curatedSourcesForSurface("oncology", "education").length).toBeGreaterThan(0);
    expect(curatedSourcesForSurface("oncology", "events").length).toBeGreaterThan(0);
  });
});
