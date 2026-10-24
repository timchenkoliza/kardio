import { describe, expect, it } from "vitest";
import { CALCULATORS, calculatorsFor, SPECIALTY_CALCULATORS } from "@/lib/calculators/catalog";
import { bmiCategory, bodyMassIndex, bsaMosteller, ckdEpi2021, cockcroftGault, creatinineMgDl, gestationByLmp, gfrCategory, glasgowComaScale, homaIr, schwartzBedside } from "@/lib/calculators/formulas";
import { SPECIALTY_IDS } from "@/lib/domain/types";

/**
 * B15 «Нормы, шкалы и калькуляторы» (docs/CAPABILITY_COVERAGE_MATRIX.md,
 * reference.norms_calculators): every formula pinned by a worked example
 * computed by hand from the published equation; outside its range a
 * formula refuses instead of extrapolating.
 */

const value = (outcome: ReturnType<typeof ckdEpi2021>) => (outcome.ok ? outcome.value : null);

describe("CKD-EPI 2021 (Inker 2021, race-free)", () => {
  it("matches hand-computed values for both sexes and both creatinine units", () => {
    // 60-year-old man, Scr 1.0 mg/dL: 142 × (1.0/0.9)^−1.2 × 0.9938^60 = 86.2
    expect(value(ckdEpi2021({ age: 60, sex: "male", creatinine: 1.0, unit: "mg_dl" }))).toBe(86);
    // 50-year-old woman, Scr 0.7 mg/dL (= κ): 142 × 0.9938^50 × 1.012 = 105.3
    expect(value(ckdEpi2021({ age: 50, sex: "female", creatinine: 0.7, unit: "mg_dl" }))).toBe(105);
    // 70-year-old woman, Scr 0.5 mg/dL (below κ, α applies): 142 × (0.5/0.7)^−0.241 × 0.9938^70 × 1.012 = 100.8
    expect(value(ckdEpi2021({ age: 70, sex: "female", creatinine: 0.5, unit: "mg_dl" }))).toBe(101);
    // 88.4 µmol/L is 1.0 mg/dL.
    expect(value(ckdEpi2021({ age: 60, sex: "male", creatinine: 88.4, unit: "umol_l" }))).toBe(86);
  });

  it("names the KDIGO category, refuses children and implausible creatinine", () => {
    const outcome = ckdEpi2021({ age: 75, sex: "male", creatinine: 180, unit: "umol_l" });
    expect(outcome.ok && outcome.interpretation).toMatch(/G3b|G4/u);
    expect(gfrCategory(90)).toBe("G1 (≥90)");
    expect(gfrCategory(59.9)).toBe("G3a (45–59)");
    expect(gfrCategory(14)).toBe("G5 (<15)");
    expect(ckdEpi2021({ age: 12, sex: "male", creatinine: 50, unit: "umol_l" })).toMatchObject({ ok: false, reason: expect.stringMatching(/Шварца/u) });
    expect(ckdEpi2021({ age: 40, sex: "male", creatinine: 1.0, unit: "umol_l" }).ok).toBe(false);
    expect(ckdEpi2021({ age: Number.NaN, sex: "male", creatinine: 80, unit: "umol_l" }).ok).toBe(false);
    expect(creatinineMgDl(0, "mg_dl")).toBeNull();
  });
});

describe("Cockcroft–Gault, Schwartz, BMI, BSA, GCS, HOMA-IR, gestation", () => {
  it("Cockcroft–Gault: (140 − age) × weight / (72 × Scr), × 0.85 for women", () => {
    // (140 − 60) × 72 / (72 × 1.0) = 80; woman: 68
    expect(value(cockcroftGault({ age: 60, sex: "male", weightKg: 72, creatinine: 1.0, unit: "mg_dl" }))).toBe(80);
    expect(value(cockcroftGault({ age: 60, sex: "female", weightKg: 72, creatinine: 1.0, unit: "mg_dl" }))).toBe(68);
    expect(cockcroftGault({ age: 60, sex: "male", weightKg: 72, creatinine: 1.0, unit: "mg_dl" })).toMatchObject({ ok: true, unit: "мл/мин", interpretation: expect.stringMatching(/инструкции/u) });
    expect(cockcroftGault({ age: 60, sex: "male", weightKg: 10, creatinine: 1.0, unit: "mg_dl" }).ok).toBe(false);
  });

  it("bedside Schwartz: 0.413 × height / Scr, children 1–16 only", () => {
    // 0.413 × 120 / 0.5 = 99.1
    expect(value(schwartzBedside({ ageYears: 8, heightCm: 120, creatinine: 0.5, unit: "mg_dl" }))).toBe(99);
    expect(schwartzBedside({ ageYears: 17, heightCm: 170, creatinine: 0.8, unit: "mg_dl" }).ok).toBe(false);
    expect(schwartzBedside({ ageYears: 0.5, heightCm: 65, creatinine: 0.3, unit: "mg_dl" }).ok).toBe(false);
  });

  it("BMI with WHO adult bands at the boundaries; BSA by Mosteller", () => {
    expect(bodyMassIndex({ weightKg: 70, heightCm: 175 })).toMatchObject({ ok: true, value: 22.9, display: "22,9" });
    expect(bmiCategory(18.44)).toMatch(/недостаточная/u);
    expect(bmiCategory(18.46)).toMatch(/нормальная/u); // 18,5 when rounded, as shown
    expect(bmiCategory(24.96)).toMatch(/избыточная/u); // 25,0 when rounded to one decimal, as shown
    expect(bmiCategory(30)).toMatch(/ожирение I степени/u);
    expect(bmiCategory(40)).toMatch(/III/u);
    // √(180 × 80 / 3600) = 2.00
    expect(bsaMosteller({ weightKg: 80, heightCm: 180 })).toMatchObject({ ok: true, value: 2, display: "2,00" });
    expect(bsaMosteller({ weightKg: 20, heightCm: 115 })).toMatchObject({ ok: true, value: 0.8 });
    expect(bodyMassIndex({ weightKg: 70, heightCm: 1.75 }).ok).toBe(false);
  });

  it("GCS adds three components and keeps them in the record; HOMA-IR = insulin × glucose / 22.5", () => {
    expect(glasgowComaScale({ eye: 4, verbal: 5, motor: 6 })).toMatchObject({ ok: true, value: 15 });
    expect(glasgowComaScale({ eye: 2, verbal: 2, motor: 4 })).toMatchObject({ ok: true, value: 8, interpretation: expect.stringMatching(/^E2 V2 M4: тяжёлое/u) });
    expect(glasgowComaScale({ eye: 5, verbal: 5, motor: 6 }).ok).toBe(false);
    expect(glasgowComaScale({ eye: Number.NaN, verbal: 5, motor: 6 }).ok).toBe(false);
    // 10 × 5.4 / 22.5 = 2.40
    expect(homaIr({ insulinMicroUnits: 10, glucoseMmol: 5.4 })).toMatchObject({ ok: true, value: 2.4, display: "2,40" });
  });

  it("gestation by LMP: weeks + days and EDD = LMP + 280 days", () => {
    const outcome = gestationByLmp({ lmp: "2026-03-01", today: "2026-05-17" });
    expect(outcome).toMatchObject({ ok: true, value: 77, display: "11 нед. 0 дн.", edd: "2026-12-06" });
    expect(gestationByLmp({ lmp: "2026-06-01", today: "2026-05-17" }).ok).toBe(false);
    expect(gestationByLmp({ lmp: "", today: "2026-05-17" }).ok).toBe(false);
  });
});

describe("calculator catalog", () => {
  it("every specialty has calculators; every calculator has a formula, applicability and a web source", () => {
    for (const specialty of SPECIALTY_IDS) {
      expect(SPECIALTY_CALCULATORS[specialty].length).toBeGreaterThan(0);
      const { primary, other } = calculatorsFor(specialty);
      expect(primary.length + other.length).toBe(Object.keys(CALCULATORS).length);
    }
    for (const definition of Object.values(CALCULATORS)) {
      expect(definition.formula.length).toBeGreaterThan(5);
      expect(definition.applicability.length).toBeGreaterThan(5);
      expect(definition.sources.length).toBeGreaterThan(0);
      for (const source of definition.sources) expect(source.url).toMatch(/^https:\/\//u);
    }
  });
});
