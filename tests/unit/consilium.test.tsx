import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined }),
  usePathname: () => "/cardiology/ask",
  useSearchParams: () => new URLSearchParams(),
}));
import type { AgentRun } from "@/lib/agents/types";
import { compileExperience, consiliumSeats, CONSILIUM_SEATS } from "@/lib/mesh/compiler";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { validateManifest } from "@/lib/mesh/policies";
import { planSources } from "@/lib/mesh/planner";
import { decideStrategy } from "@/lib/mesh/strategy";
import { GALLERY, galleryHref } from "@/lib/portal/agents-gallery";
import { routePortalIntent } from "@/lib/portal/router";
import { unmatchedWords } from "@/lib/portal/unmatched";
import { ExperienceView } from "@/components/experience/experience-view";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { executePlan } from "@/server/mesh/execute";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { fakeAbstracts, fakePubmed, testContext } from "./agent-test-utils";
import { FixtureDriver, HFPEF_ABSTRACT, HFPEF_REVIEW, registryStatuses } from "./mesh-test-utils";

/**
 * «Консилиум» (owner's decision of 24.10, docs/CAPABILITY_COVERAGE_MATRIX.md, CF-03):
 * the position of each kind of source on one question, side by side — Russian and
 * international guidelines, systematic reviews, the instruction when a drug is named.
 * Seats are sources, never invented or real-person experts; disagreement is shown,
 * nothing is averaged into a verdict; a seat without a position is named as a gap.
 */

const QUESTION = "Консилиум: эмпаглифлозин при ХСН с сохранённой ФВ";

async function consilium(text = QUESTION, options: { reviews?: boolean } = {}) {
  const driver = new FixtureDriver();
  const registry = createSourceRegistry({ browserDriver: driver, site: { minIntervalMs: 0 } });
  const intent = compileIntent(text, "cardiology");
  const ctx = await testContext({ agentId: "reference", topics: [], specialty: "cardiology", text, job: "answer", pubmed: fakePubmed(options.reviews === false ? [] : [HFPEF_REVIEW]), abstracts: fakeAbstracts(options.reviews === false ? [] : [HFPEF_ABSTRACT]) });
  const statuses = await registryStatuses(registry);
  const plan = planSources({ intent, sources: descriptors(registry), statuses });
  const execution = await executePlan({ plan, intent, registry, ctx, sessionId: "consilium-test" });
  const graph = buildEvidenceGraph({ id: "graph-consilium", intent, plan, results: execution.results, descriptors: descriptors(registry), statuses, now: ctx.nowIso });
  const output = compileExperience({ graph, user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario, resultKeys: {} });
  return { intent, plan, graph, output };
}

function render(output: Awaited<ReturnType<typeof consilium>>["output"], graph: Awaited<ReturnType<typeof consilium>>["graph"]) {
  const run = { id: "run-consilium", agentId: "reference", specialty: "cardiology", trigger: "composer", startedAt: graph.createdAt, completedAt: graph.createdAt, status: "completed", input: { text: QUESTION, preferenceDigest: "" }, intent: "answer", plan: [], toolsUsed: [], resultIds: [], newResultCount: 0, error: null, durationMs: 1, riskNotices: [], synthesis: null } as unknown as AgentRun;
  return renderToStaticMarkup(<WorkspaceProvider specialty="cardiology"><ExperienceView run={run} experience={{ intentId: "i", manifest: output.manifest, graph, plan: { id: "p", steps: 1, invocations: 1, reused: false } }} results={[]} job="answer" /></WorkspaceProvider>).replace(/ /gu, " ");
}

describe("routing: «Консилиум» is asked for explicitly", () => {
  it("cue words make the positions job, whatever else the question names; a plain question does not", () => {
    for (const text of [QUESTION, "Позиции рекомендаций по целевому АД у пожилых", "Что говорят разные рекомендации о дапаглифлозине при ХСН", "Где рекомендации расходятся по ДАТТ после ЧКВ"]) {
      expect(routePortalIntent(text, "cardiology").job, text).toBe("answer");
      const strategy = decideStrategy({ text, specialty: "cardiology" });
      expect(strategy.intent.job.primary, text).toBe("source_positions");
      // Never replaced by a Skill's job, never stopped for a plan.
      expect(strategy.executionClass, text).toBe("dynamic");
      expect(strategy.planPreview, text).toBeNull();
    }
    expect(compileIntent("Эмпаглифлозин при ХСН с сохранённой ФВ", "cardiology").job.primary).not.toBe("source_positions");
  });

  it("the cue is a kind of result, never «не учтено»", () => {
    const intent = compileIntent(QUESTION, "cardiology");
    const conditions = [...intent.entities.drugs.map(drug => drug.ru), ...(intent.context.nosology ? [intent.context.nosology.label] : []), ...intent.entities.concepts.map(concept => concept.label)];
    expect(unmatchedWords(QUESTION, conditions, "cardiology").join(" ")).not.toMatch(/консилиум/iu);
  });

  it("the gallery offers «Консилиум» again as its own result, in every specialty", () => {
    const entry = GALLERY.find(agent => agent.id === "consilium")!;
    expect(entry).toBeDefined();
    expect(galleryHref(entry, "neurology")).toBe("/neurology/ask?job=answer&view=consilium");
    expect(`${entry.can} ${entry.sources}`).not.toMatch(/персон|эксперт/iu);
  });
});

describe("the positions module", () => {
  it("one seat per kind of source, each position a supported statement of a document of that kind", async () => {
    const { intent, graph, output } = await consilium();
    expect(intent.modules[0]).toBe("positions");
    expect(intent.modules).not.toContain("key_takeaway");
    expect(output.fallback).toBe(false);
    expect(validateManifest(output.manifest, graph, { descriptors: [] }).blocking).toBe(0);
    const positions = output.manifest.modules.find(entry => entry.family === "positions")!;
    expect(positions).toBeDefined();
    expect(output.manifest.modules[0]?.family).toBe("positions");
    expect(output.manifest.representation.mode).toBe("source_positions");
    const seats = consiliumSeats(graph);
    const filled = seats.filter(seat => seat.entries.length).map(seat => seat.id);
    expect(filled).toEqual(expect.arrayContaining(["ru_guideline", "reviews"]));
    for (const seat of seats) for (const entry of seat.entries) {
      const claim = graph.claims.find(item => item.id === entry.claimId)!;
      const document = graph.documents.find(item => item.id === entry.documentId)!;
      expect(claim.documentId).toBe(document.id);
      expect(claim.verification).not.toBe("UNSUPPORTED");
      if (seat.id === "reviews") expect(document.kind).toBe("review");
      if (seat.id === "ru_guideline") expect(document.jurisdiction).toBe("RU");
      if (seat.id === "int_guideline") expect(document.jurisdiction).not.toBe("RU");
    }
    expect(seats.every(seat => seat.entries.length <= 2)).toBe(true);
  });

  it("a seat without a position is named as a gap of the search, never as agreement", async () => {
    const { graph, output } = await consilium(QUESTION, { reviews: false });
    const positions = output.manifest.modules.find(entry => entry.family === "positions")!;
    expect(positions.props.missing).toContain("reviews");
    const html = render(output, graph);
    expect(html).toMatch(/Позиция не найдена: [^<]*систематические обзоры и метаанализы/u);
    expect(html).toContain("Это пробел поиска, а не согласие или отказ источника.");
    expect(consiliumSeats(graph).find(seat => seat.id === "reviews")?.entries).toEqual([]);
  });

  it("renders sources as seats with dates and links, says the decision stays with the physician, and names no person", async () => {
    const { graph, output } = await consilium();
    const html = render(output, graph);
    expect(html).toContain("Консилиум: позиции источников");
    expect(html).toContain("Места консилиума — источники, а не врачи");
    expect(html).toContain("Решение о тактике остаётся за вами.");
    for (const seat of consiliumSeats(graph).filter(item => item.entries.length)) expect(html).toContain(CONSILIUM_SEATS.find(item => item.id === seat.id)!.label);
    expect(html).toContain("Открыть первоисточник");
    // No synthetic doctors or digital twins of real people (the retired legacy consilium).
    expect(html).not.toMatch(/Морозова|Соколов|Белова|Орлова|Крылов|Шляхто|Арутюнов|Бойцов|модель эксперта/u);
    // No verdict: nothing says which source is right.
    // Whole words: «улучшения» in a quoted guideline is the source's own text.
    const verdict = html.match(/.{0,80}(?:(?<![\p{L}])лучше(?![\p{L}])|правильн(?:ая|ый) позиц|итог консилиума|консилиум рекомендует).{0,80}/iu)?.[0];
    expect(verdict ?? null).toBeNull();
  });
});
