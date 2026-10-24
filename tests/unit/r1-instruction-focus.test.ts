import { describe, expect, it } from "vitest";
import { compileIntent } from "@/lib/mesh/intent";
import type { InstructionPage } from "@/server/mesh/sources/medi";
import { compileExperience } from "@/lib/mesh/compiler";
import { POPULATION_PASSAGE } from "@/lib/mesh/evidence";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { planSources } from "@/lib/mesh/planner";
import { validateManifest } from "@/lib/mesh/policies";
import { executePlan } from "@/server/mesh/execute";
import { instructionFocus, MEDI_DESCRIPTOR, normalizeInstruction, populationsNamed } from "@/server/mesh/sources/medi";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { fakeAbstracts, fakePubmed, testContext } from "./agent-test-utils";
import { acceptanceGraph, FixtureDriver, registryStatuses } from "./mesh-test-utils";
import type { EvidenceGraph } from "@/lib/mesh/evidence";
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

function claimsFor(question: string) {
  const intent = compileIntent(question, "cardiology");
  const document = normalizeInstruction(raw, page, { drug: intent.entities.drugs[0], listingDate: null, nosology: null, safety: intent.safety, job: intent.job.primary, sections: intent.sections, populations: populationsNamed(intent), focus: instructionFocus(intent) });
  return document.claims;
}

function quotes(question: string) {
  const claims = claimsFor(question);
  const of = (kind: string) => claims.filter(claim => claim.kind === kind);
  return {
    contraindications: of("contraindication").map(claim => claim.quote ?? ""),
    dosing: of("dosing").map(claim => claim.quote ?? ""),
    passages: claims.filter(claim => claim.covers.includes(POPULATION_PASSAGE)).map(claim => claim.quote ?? ""),
  };
}

const LIMIT = MEDI_DESCRIPTOR.usagePolicy.maxExcerptChars!;

describe("an instruction excerpt for a population question (R1 C-4)", () => {
  it("the fixture's renal contraindication is past the plain excerpt, as in the real instruction", () => {
    expect(CONTRAINDICATIONS.indexOf("клиренсом креатинина менее 15")).toBeGreaterThan(LIMIT);
  });

  it("«пожилые с ХБП: противопоказания»: the opening of the list and, as its own passage, the renal contraindication", () => {
    const { contraindications, passages } = quotes("Апиксабан у пожилых с ХБП: противопоказания");
    expect(contraindications[0]).toMatch(/^Гиперчувствительность/u);
    expect(contraindications.some(quote => quote.startsWith("Тяжёлая почечная недостаточность с клиренсом креатинина менее 15 мл/мин и применение у пациентов на диализе."))).toBe(true);
    expect(passages.some(quote => quote.includes("менее 15 мл/мин"))).toBe(true);
  });

  it("dosing: the age rule and every renal passage, the severe one included, never the next indication", () => {
    const { dosing } = quotes("Апиксабан у пожилых с ХБП: противопоказания");
    const all = dosing.join(" | ");
    expect(all).toContain("возраст 80 лет и старше");
    expect(all).toContain("клиренс креатинина 15-29 мл/мин): при фибрилляции предсердий применяют дозу 2,5 мг два раза в сутки");
    expect(all).not.toContain("Лечение тромбоза глубоких вен");
    expect(all).not.toMatch(/печёночной/u);
  });

  it("every quote is verbatim and within the source's excerpt limit (policy SP-03): the answer never falls back", () => {
    const { contraindications, dosing } = quotes("Апиксабан у пожилых с ХБП: противопоказания");
    for (const quote of contraindications) { expect(quote.length).toBeLessThanOrEqual(LIMIT); expect(CONTRAINDICATIONS).toContain(quote.replace(/…$/u, "")); }
    for (const quote of dosing) { expect(quote.length).toBeLessThanOrEqual(LIMIT); expect(DOSING).toContain(quote.replace(/…$/u, "")); }
  });

  it("a question without a population keeps the plain opening excerpt and no passages", () => {
    const { contraindications, passages } = quotes("Апиксабан: противопоказания");
    expect(contraindications).toHaveLength(1);
    expect(contraindications[0]).toMatch(/^Гиперчувствительность/u);
    expect(passages).toEqual([]);
  });
});

describe("a drug question with a population compiles through every policy gate (R1 A, round 2: P0 regression)", () => {
  it.each(["Эмпаглифлозин: противопоказания при сниженной функции почек", "Эмпаглифлозин у пожилых с ХБП: дозирование"])("%s", async question => {
    const driver = new FixtureDriver();
    const registry = createSourceRegistry({ browserDriver: driver, site: { minIntervalMs: 0 } });
    const intent = compileIntent(question, "cardiology");
    const ctx = await testContext({ agentId: "reference", topics: [], specialty: "cardiology", text: question, job: "drug", pubmed: fakePubmed([]), abstracts: fakeAbstracts([]) });
    const statuses = await registryStatuses(registry);
    const plan = planSources({ intent, sources: descriptors(registry), statuses });
    const execution = await executePlan({ plan, intent, registry, ctx, sessionId: `focus-${question}` });
    const graph = buildEvidenceGraph({ id: `graph-${question}`, intent, plan, results: execution.results, descriptors: descriptors(registry), statuses, now: ctx.nowIso });
    const policy = { descriptors: descriptors(registry) };
    const output = compileExperience({ graph, user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy, scenario: intent.context.scenario, resultKeys: {} });
    expect(graph.documents.some(document => document.kind === "drug_instruction")).toBe(true);
    expect(output.fallback).toBe(false);
    expect(validateManifest(output.manifest, graph, policy).findings.filter(finding => finding.rule === "SP-03-excerpt-limit")).toEqual([]);
    expect(output.manifest.modules.find(entry => entry.family === "key_takeaway")?.claimIds.length ?? 0).toBeGreaterThan(0);
  });
});

describe("the long instruction of the reviewer's question compiles: passages lead «Коротко», no fallback (R1 A round 2, P0)", () => {
  it("«Апиксабан у пожилых с ХБП: противопоказания» on the real-order fixture", async () => {
    const question = "Апиксабан у пожилых с ХБП: противопоказания";
    const intent = compileIntent(question, "cardiology");
    const document = normalizeInstruction(raw, page, { drug: intent.entities.drugs[0], listingDate: null, nosology: null, safety: intent.safety, job: intent.job.primary, sections: intent.sections, populations: populationsNamed(intent), focus: instructionFocus(intent) });
    const { graph: base, registry } = await acceptanceGraph();
    const { chunks, claims, entities, ...rest } = document;
    const graph: EvidenceGraph = {
      ...base, job: "drug_reference", family: "drug", context: { ...base.context, nosology: null, subtype: null, drugs: ["apixaban"], topics: [] },
      documents: [{ ...rest, chunkIds: chunks.map(chunk => chunk.id) }], chunks, claims, entities, conflicts: [], relations: [], gaps: [],
    };
    const policy = { descriptors: descriptors(registry) };
    const output = compileExperience({ graph, user: { signals: ["specialty"], topics: [] }, modules: ["key_takeaway", "drug_reference", "sources"], policy, scenario: null, resultKeys: {}, moduleProps: { drug_reference: { asked: ["contraindications", "populations"] } } });
    expect(output.fallback).toBe(false);
    expect(validateManifest(output.manifest, graph, policy).findings.filter(finding => finding.rule === "SP-03-excerpt-limit")).toEqual([]);
    const takeaway = (output.manifest.modules.find(entry => entry.family === "key_takeaway")?.claimIds ?? []).map(id => claims.find(claim => claim.id === id)!);
    expect(takeaway[0].covers).toContain(POPULATION_PASSAGE);
    const text = takeaway.map(claim => claim.statement).join(" | ");
    expect(text).toContain("клиренсом креатинина менее 15 мл/мин");
    expect(text).toContain("15-29 мл/мин): при фибрилляции предсердий применяют дозу 2,5 мг два раза в сутки");
  });
});

/**
 * R1 round 3 (C Р3-4): in the real dosing section the mild-to-moderate renal sentence comes right before the severe one,
 * and the severe one carries a list of rules with the atrial-fibrillation dose last. Joined, the two were cut at the span
 * before the AF rule. Written for the test, in the observed order and lengths; no MEDI text is stored.
 */
const LIST_FILLER = "описанный для этой тестовой фикстуры режим с условием, которое здесь только занимает место";
const RENAL_DOSING = [
  "Внутрь, вне зависимости от приёма пищи.",
  "У пациентов с нарушением функции почек лёгкой или средней степени тяжести при отсутствии соответствия другим критериям снижения дозы коррекция дозы не требуется; это правило в фикстуре сопровождается пояснением о массе тела и возрасте пациентов.",
  `У пациентов с нарушением функции почек тяжёлой степени (клиренс креатинина 15-29 мл/мин) следует соблюдать следующие рекомендации: - для профилактики после плановой операции ${LIST_FILLER}; - для лечения тромбоза глубоких вен и ТЭЛА ${LIST_FILLER}; - у пациентов с фибрилляцией предсердий следует применять дозу 2,5 мг два раза в сутки.`,
  "У пациентов с клиренсом креатинина менее 15 мл/мин и у пациентов на диализе препарат применять не рекомендуется.",
].join(" ");
const renalRaw: InstructionPage = { ...raw, sections: [{ id: "contraindications", heading: "Противопоказания", text: CONTRAINDICATIONS, html: "" }, { id: "dosing", heading: "Способ применения и дозы", text: RENAL_DOSING, html: "" }] };

describe("«КК 25»: the severe renal rule keeps its AF dose (R1 round 3, C Р3-4)", () => {
  it("the fixture's mild sentence and the severe rule together are longer than the source's excerpt limit", () => {
    const start = RENAL_DOSING.indexOf("У пациентов с нарушением функции почек лёгкой");
    const end = RENAL_DOSING.indexOf("два раза в сутки.") + "два раза в сутки.".length;
    expect(end - start).toBeGreaterThan(LIMIT);
  });

  it.each(["Апиксабан при КК 25 мл/мин: дозирование", "Апиксабан у пожилых при КК 25 мл/мин: дозирование", "Пожилой пациент с КК 25: сколько апиксабана давать?"])("%s", question => {
    const intent = compileIntent(question, "cardiology");
    expect(instructionFocus(intent)).toContain("renal");
    const document = normalizeInstruction(renalRaw, page, { drug: intent.entities.drugs[0], listingDate: null, nosology: null, safety: intent.safety, job: intent.job.primary, sections: intent.sections, populations: populationsNamed(intent), focus: instructionFocus(intent) });
    const passages = document.claims.filter(claim => claim.covers.includes(POPULATION_PASSAGE)).map(claim => claim.quote ?? "");
    // One passage holds the threshold and its AF dose; another holds «менее 15 мл/мин».
    expect(passages.some(quote => quote.includes("15-29 мл/мин") && quote.includes("2,5 мг два раза в сутки"))).toBe(true);
    expect(passages.some(quote => quote.includes("менее 15 мл/мин"))).toBe(true);
    for (const quote of passages) {
      expect(quote.length).toBeLessThanOrEqual(LIMIT);
      expect(`${CONTRAINDICATIONS} ${RENAL_DOSING}`).toContain(quote.replace(/…$/u, ""));
    }
  });
});

describe("«а при беременности?»: the pregnancy sentence, not the first population sentence (R1 round 3, A №1)", () => {
  const PREGNANCY_CONTRAINDICATIONS = [
    "Повышенная чувствительность к компонентам препарата.",
    "Заболевания печени в активной фазе и повышение активности печёночных ферментов неясного генеза.",
    "Беременность и период грудного вскармливания; применение у женщин детородного возраста без надёжной контрацепции.",
    "Возраст до 18 лет.",
  ].join(" ");
  const PREGNANCY_SECTION = "Применение препарата во время беременности противопоказано; в тестовой фикстуре это предложение заменяет текст раздела.";
  const statinRaw: InstructionPage = { ...raw, title: "Аторвастатин 20 мг (Аторвастатин)", inn: "аторвастатин", sections: [{ id: "contraindications", heading: "Противопоказания", text: PREGNANCY_CONTRAINDICATIONS, html: "" }, { id: "pregnancy", heading: "Применение при беременности и в период грудного вскармливания", text: PREGNANCY_SECTION, html: "" }] };

  it("the pregnancy section is the population passage; the liver sentence is not", () => {
    const intent = compileIntent("Аторвастатин: противопоказания при беременности", "cardiology");
    expect(instructionFocus(intent)).toEqual(["pregnancy"]);
    const document = normalizeInstruction(statinRaw, page, { drug: intent.entities.drugs[0], listingDate: null, nosology: null, safety: intent.safety, job: intent.job.primary, sections: intent.sections, populations: populationsNamed(intent), focus: instructionFocus(intent) });
    const passages = document.claims.filter(claim => claim.covers.includes(POPULATION_PASSAGE)).map(claim => claim.quote ?? "");
    expect(passages.length).toBeGreaterThan(0);
    expect(passages[0]).toBe(PREGNANCY_SECTION);
    expect(passages.join(" ")).not.toMatch(/Заболевания печени/u);
  });
});
