import { describe, expect, it } from "vitest";
import { procedureBenchmarksForSpecialty } from "@/lib/ui/procedure-benchmarks";
import { professionalConsultationRoutesForSpecialty } from "@/lib/ui/professional-consultation";

for (const specialty of ["cardiology", "oncology"] as const) {
  describe(`${specialty} professional workspace`, () => {
    it("has Russian and international procedure context with explicit source metadata", () => {
      const benchmarks = procedureBenchmarksForSpecialty(specialty);
      expect(benchmarks.some(item => item.scope === "russia")).toBe(true);
      expect(benchmarks.some(item => item.scope === "international")).toBe(true);
      expect(benchmarks.every(item => item.period.length > 0 && item.source.length > 0 && item.sourceUrl.startsWith("https://"))).toBe(true);
    });

    it("keeps modelled or treatment-mix metrics semantically explicit", () => {
      const benchmarks = procedureBenchmarksForSpecialty(specialty);
      for (const item of benchmarks.filter(entry => entry.evidence === "modelled" || entry.evidence === "treatment_mix")) {
        expect(item.context.length).toBeGreaterThan(20);
        expect(/не |модел|структур|потребност|дол/i.test(item.context)).toBe(true);
      }
    });

    it("offers professional expert routes and an external formal-consilium boundary", () => {
      const routes = professionalConsultationRoutesForSpecialty(specialty);
      expect(routes.some(route => route.kind === "expert_group" || route.kind === "professional_discussion")).toBe(true);
      const formal = routes.find(route => route.kind === "formal_consilium");
      expect(formal).toBeDefined();
      expect(formal?.description).toMatch(/не принимает медицинские данные пациента/i);
      expect(routes.every(route => route.url.startsWith("https://"))).toBe(true);
    });
  });
}
