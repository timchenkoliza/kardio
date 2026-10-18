import { describe, expect, it } from "vitest";
import { diagnoseEventReferenceRole, isDiagnosticPageSurfaceLeaf } from "@/server/ingestion/event-role-signals";

describe("event role signals", () => {
  it("marks exact observed event subpages as page-surface-like before considering year tokens", () => {
    const result = diagnoseEventReferenceRole({
      canonicalReferenceUrl: "https://scardio.ru/events/rossiyskiy_nacionalnyy_kongress_kardiologov/rossiyskiy_nacionalnyy_kongress_kardiologov_2024/registraciya/",
      mentionSpanDaysApprox: 61.1,
    });
    expect(result.role).toBe("page_surface_like");
    expect(result.evidence).toContain("surface_leaf:registraciya");
  });

  it("marks a year-bearing non-surface reference as occurrence-like", () => {
    const result = diagnoseEventReferenceRole({
      canonicalReferenceUrl: "https://scardio.ru/events/forum_molodyh_kardiologov/forum_molodyh_kardiologov_2025/",
      mentionSpanDaysApprox: 197.3,
    });
    expect(result.role).toBe("occurrence_like");
    expect(result.evidence).toContain("year_token:2025");
  });

  it("marks long-lived non-year references as series-like and leaves weak cases unresolved", () => {
    expect(diagnoseEventReferenceRole({
      canonicalReferenceUrl: "https://scardio.ru/events/cikly_vebinarov/kardioring/",
      mentionSpanDaysApprox: 508.1,
    }).role).toBe("series_like");

    expect(diagnoseEventReferenceRole({
      canonicalReferenceUrl: "https://scardio.ru/events/odnorazovoe_meropriyatie/",
      mentionSpanDaysApprox: 12,
    }).role).toBe("unresolved");
  });

  it("keeps the page-surface vocabulary bounded", () => {
    expect(isDiagnosticPageSurfaceLeaf("tvstudiya")).toBe(true);
    expect(isDiagnosticPageSurfaceLeaf("videotranslyaciya")).toBe(true);
    expect(isDiagnosticPageSurfaceLeaf("forum_molodyh_kardiologov_2025")).toBe(false);
  });
});
