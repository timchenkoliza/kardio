import { describe, expect, it } from "vitest";
import { compileIntent } from "@/lib/mesh/intent";
import type { InstructionPage } from "@/server/mesh/sources/medi";
import { instructionFocus, normalizeInstruction, populationsNamed } from "@/server/mesh/sources/medi";
import type { PageSnapshot } from "@/server/mesh/browser/drivers";

/**
 * R1 review C-4 (P1): on «Апиксабан у пожилых с ХБП: противопоказания» the renal contraindication (creatinine
 * clearance below 15 ml/min, dialysis) was cut from the excerpt, and of the dosing section only the age rule was
 * shown. The N7-2 fixture had the renal sentence first, so the test passed while the live answer did not.
 *
 * This fixture keeps the ORDER of the real instruction as observed on medi.ru on 24.10.2026 (a long list of
 * contraindications with the renal item after the first 700 characters; the dosing section with the age rule
 * first, a numbered indication, a mild-to-moderate renal paragraph, then the severe one). The wording is
 * written for the test, as the other MEDI fixtures (tests/fixtures/medi/README.md): no MEDI text is stored.
 */
const FILLER = "Состояние с высоким риском кровотечения, описанное для примера в этой тестовой фикстуре";
const CONTRAINDICATIONS = [
  "Гиперчувствительность к действующему веществу или вспомогательным веществам.",
  "Активное клинически значимое кровотечение.",
  "Болезнь печени с коагулопатией и клинически значимым риском кровотечения.",
  `Состояния со значимым риском большого кровотечения: ${Array.from({ length: 7 }, (_, index) => `${FILLER} ${index + 1}`).join("; ")}.`,
  "Тяжёлая почечная недостаточность с клиренсом креатинина менее 15 мл/мин и применение у пациентов на диализе.",
  "Возраст до 18 лет.",
].join(" ");
const DOSING = [
  "Внутрь, вне зависимости от приёма пищи.",
  "При фибрилляции предсердий доза снижается до 2,5 мг два раза в сутки, если есть два признака из трёх: возраст 80 лет и старше, масса тела 60 кг и менее, креатинин плазмы 133 мкмоль/л и выше.",
  "3. Лечение тромбоза глубоких вен: по 10 мг два раза в сутки первые семь дней, затем по 5 мг два раза в сутки.",
  "Пациенты с почечной недостаточностью. При лёгкой и средней степени коррекция дозы не требуется, кроме правила двух признаков при фибрилляции предсердий.",
  "Пациенты с тяжёлой почечной недостаточностью (клиренс креатинина 15-29 мл/мин): при фибрилляции предсердий применяют дозу 2,5 мг два раза в сутки.",
  "При клиренсе креатинина менее 15 мл/мин и на диализе препарат противопоказан.",
  "Пациенты с печёночной недостаточностью. При лёгкой и средней степени применяют с осторожностью.",
].join(" ");

const page = { requestedUrl: "https://medi.ru/instrukciya/eliquis/", finalUrl: "https://medi.ru/instrukciya/eliquis/", status: 200, html: "", fetchedAt: "2026-10-24T00:00:00.000Z", driver: "http", durationMs: 1 } as unknown as PageSnapshot;
const raw: InstructionPage = {
  title: "Эликвис 2,5 мг (Апиксабан)", inn: "апиксабан", registration: null, officialNote: null, prescription: null, indications: [],
  sections: [
    { id: "contraindications", heading: "Противопоказания", text: CONTRAINDICATIONS, html: "" },
    { id: "dosing", heading: "Способ применения и дозы", text: DOSING, html: "" },
  ],
};

function quotes(question: string) {
  const intent = compileIntent(question, "cardiology");
  const document = normalizeInstruction(raw, page, { drug: intent.entities.drugs[0], listingDate: null, nosology: null, safety: intent.safety, job: intent.job.primary, sections: intent.sections, populations: populationsNamed(intent), focus: instructionFocus(intent) });
  return { contraindication: document.claims.find(claim => claim.kind === "contraindication")?.quote ?? "", dosing: document.claims.find(claim => claim.kind === "dosing")?.quote ?? "" };
}

describe("an instruction excerpt for a population question (R1 C-4)", () => {
  it("the fixture's renal contraindication is past the plain excerpt, as in the real instruction", () => {
    expect(CONTRAINDICATIONS.indexOf("клиренсом креатинина менее 15")).toBeGreaterThan(700);
  });

  it("«пожилые с ХБП: противопоказания»: the opening of the list and the renal contraindication", () => {
    const { contraindication } = quotes("Апиксабан у пожилых с ХБП: противопоказания");
    expect(contraindication).toMatch(/^Гиперчувствительность/u);
    expect(contraindication).toContain("клиренсом креатинина менее 15 мл/мин и применение у пациентов на диализе");
    expect(contraindication).toContain(" … ");
  });

  it("dosing: the age rule and every renal passage, the severe one included, never the next indication", () => {
    const { dosing } = quotes("Апиксабан у пожилых с ХБП: противопоказания");
    expect(dosing).toContain("возраст 80 лет и старше");
    expect(dosing).toContain("клиренс креатинина 15-29 мл/мин): при фибрилляции предсердий применяют дозу 2,5 мг два раза в сутки");
    expect(dosing).not.toContain("Лечение тромбоза глубоких вен");
    expect(dosing).not.toMatch(/печёночной/u);
  });

  it("each passage is verbatim: the parts between «…» are the section's own text", () => {
    const { contraindication, dosing } = quotes("Апиксабан у пожилых с ХБП: противопоказания");
    for (const part of contraindication.split(" … ")) expect(CONTRAINDICATIONS).toContain(part.replace(/…$/u, ""));
    for (const part of dosing.split(" … ")) expect(DOSING).toContain(part.replace(/…$/u, ""));
  });

  it("a question without a population keeps the plain opening excerpt", () => {
    const { contraindication } = quotes("Апиксабан: противопоказания");
    expect(contraindication).toMatch(/^Гиперчувствительность/u);
    expect(contraindication).not.toContain(" … ");
  });
});
