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
