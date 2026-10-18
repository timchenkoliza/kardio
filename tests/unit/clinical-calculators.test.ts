import { describe, expect, it } from "vitest";
import { scoreCha2Ds2Va, scoreHasBled } from "@/lib/ui/clinical-calculators";

describe("clinical calculators", () => {
  it("scores CHA2DS2-VA age bands and risk factors", () => {
    expect(scoreCha2Ds2Va({ heartFailure: false, hypertension: false, age: 64, diabetes: false, strokeTiaEmbolism: false, vascularDisease: false })).toBe(0);
    expect(scoreCha2Ds2Va({ heartFailure: false, hypertension: true, age: 70, diabetes: false, strokeTiaEmbolism: false, vascularDisease: false })).toBe(2);
    expect(scoreCha2Ds2Va({ heartFailure: true, hypertension: true, age: 78, diabetes: true, strokeTiaEmbolism: true, vascularDisease: true })).toBe(8);
  });

  it("scores HAS-BLED as one point per selected factor", () => {
    expect(scoreHasBled({ hypertension: true, abnormalRenal: true, abnormalLiver: false, stroke: false, bleedingHistory: true, labileInr: false, ageOver65: true, drugs: false, alcohol: false })).toBe(4);
    expect(scoreHasBled({ hypertension: false, abnormalRenal: false, abnormalLiver: false, stroke: false, bleedingHistory: false, labileInr: false, ageOver65: false, drugs: false, alcohol: false })).toBe(0);
  });
});
