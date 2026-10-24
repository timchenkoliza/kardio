import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined }),
  usePathname: () => "/endocrinology/ask",
  useSearchParams: () => new URLSearchParams(),
}));
import { compileExperience, comparedDrugs } from "@/lib/mesh/compiler";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { validateManifest } from "@/lib/mesh/policies";
import { planSources } from "@/lib/mesh/planner";
import { decideStrategy } from "@/lib/mesh/strategy";
import { drugsIn } from "@/lib/portal/lexicon";
import { routePortalIntent } from "@/lib/portal/router";
import type { AgentRun } from "@/lib/agents/types";
import { ExperienceView } from "@/components/experience/experience-view";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { executePlan } from "@/server/mesh/execute";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { fakePubmed, testContext } from "./agent-test-utils";
import { FixtureDriver, MEDI_FIXTURE_ROUTES, registryStatuses } from "./mesh-test-utils";

/**
 * A2 «Сравнение двух–четырёх препаратов» (docs/CAPABILITY_COVERAGE_MATRIX.md, drugs.compare):
 * the instruction of every named drug, the same sections side by side, empty
 * cells explained, forms flagged, the US label as a stand-in with its boundary.
 */

const ROUTES = {
  ...MEDI_FIXTURE_ROUTES,
  "https://medi.ru/analogi-mnn/dapagliflozin/": "inn-dapagliflozin.html",
  "https://medi.ru/instrukciya/test-forsiga_9001/": "instruction-test-dapagliflozin.html",
};

async function compare(text: string, options: { routes?: Record<string, string>; specialty?: "endocrinology" | "cardiology" } = {}) {
  const driver = new FixtureDriver(options.routes ?? ROUTES);
  const registry = createSourceRegistry({ browserDriver: driver, site: { minIntervalMs: 0 } });
  const specialty = options.specialty ?? "endocrinology";
  const intent = compileIntent(text, specialty);
  const ctx = await testContext({ agentId: "reference", topics: [], specialty, text, job: "drug", pubmed: fakePubmed([]) });
  ctx.drugLabel = async inn => ({ status: "not_found", label: null, retrievedAt: ctx.nowIso, error: `no label for ${inn}` }) as never;
  const statuses = await registryStatuses(registry);
  const plan = planSources({ intent, sources: descriptors(registry), statuses });
  const execution = await executePlan({ plan, intent, registry, ctx, sessionId: "comparison-test" });
  const graph = buildEvidenceGraph({ id: "graph-cmp", intent, plan, results: execution.results, descriptors: descriptors(registry), statuses, now: ctx.nowIso });
  const output = compileExperience({ graph, user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario, resultKeys: {} });
  return { intent, plan, graph, output, driver, registry };
}

describe("routing: a comparison of drugs by their instructions", () => {
  it("«сравни X и Y» without outcome words is a drug comparison", () => {
    for (const text of ["Сравни эмпаглифлозин и дапаглифлозин", "Чем отличаются апиксабан и ривароксабан?", "Апиксабан или дабигатран: противопоказания"]) {
      const route = routePortalIntent(text, "cardiology");
      expect(route.job, text).toBe("drug");
      expect(compileIntent(text, "cardiology").job.primary, text).toBe("drug_comparison");
    }
  });

  it("outcome and study questions stay evidence questions", () => {
    expect(routePortalIntent("сравни апиксабан и ривароксабан по кровотечениям", "cardiology").job).toBe("research");
    expect(routePortalIntent("Сравни эффективность эмпаглифлозина и дапаглифлозина по исследованиям", "endocrinology").job).toBe("research");
  });

  it("reads up to four drugs and plans the instruction of each, then the official registry by link", () => {
    expect(drugsIn("Сравни апиксабан, ривароксабан, дабигатран, эдоксабан и варфарин").map(drug => drug.inn)).toEqual(["apixaban", "rivaroxaban", "dabigatran", "edoxaban"]);
    const intent = compileIntent("Сравни апиксабан, ривароксабан, дабигатран и эдоксабан", "cardiology");
    expect(intent.job.primary).toBe("drug_comparison");
    expect(intent.requirements).toContain("russian_drug_reference");
    expect(intent.modules).toEqual(expect.arrayContaining(["comparison", "drug_reference"]));
  });

  it("the plan shown before a three-drug comparison is what runs: Russian instructions first", () => {
    const strategy = decideStrategy({ text: "Сравни апиксабан, ривароксабан и дабигатран при ФП", specialty: "cardiology" });
    expect(strategy.planPreview?.steps[0]).toMatch(/российские инструкции: апиксабан, ривароксабан, дабигатран/u);
    expect(strategy.intent.job.primary).toBe("drug_comparison");
  });
});

describe("execution and the compiled comparison", () => {
  it("opens the instruction of every drug, each with its own page budget", async () => {
    const { driver, graph } = await compare("Сравни эмпаглифлозин и дапаглифлозин");
    expect(driver.calls).toEqual(expect.arrayContaining(["https://medi.ru/instrukciya/dzhardins_6916/", "https://medi.ru/instrukciya/test-forsiga_9001/"]));
    expect(comparedDrugs(graph).map(drug => Boolean(drug.documentId))).toEqual([true, true]);
  });

  it("puts the same sections side by side and says which cell is empty", async () => {
    const { output, graph } = await compare("Сравни эмпаглифлозин и дапаглифлозин");
    expect(output.fallback).toBe(false);
    const table = output.manifest.modules.find(entry => entry.family === "comparison")!;
    expect(table).toBeTruthy();
    expect(table.title).toBe("Сравнение: эмпаглифлозин, дапаглифлозин");
    expect(table.props.labels).toEqual(["эмпаглифлозин", "дапаглифлозин"]);
    const cells = table.props.cells as string[];
    const has = (row: string, column: number) => cells.some(cell => cell.startsWith(`${row}|${column}|`));
    for (const row of ["indications", "contraindications", "dosing"]) { expect(has(row, 0), row).toBe(true); expect(has(row, 1), row).toBe(true); }
    // Only the second instruction has pregnancy and interaction sections in the fixture.
    expect(has("populations", 1)).toBe(true);
    expect(has("interactions", 1)).toBe(true);
    expect(has("interactions", 0)).toBe(false);
    // Every cell points at a claim of the right drug's document.
    for (const cell of cells) {
      const [, column, ids] = cell.split("|");
      const documentId = (table.props.columns as string[])[Number(column)];
      for (const id of ids.split(",")) expect(graph.claims.find(claim => claim.id === id)?.documentId).toBe(documentId);
    }
    // The table replaces the per-drug cards; the takeaway gives one indication per drug, favouring none.
    expect(output.manifest.modules.some(entry => entry.family === "drug_reference")).toBe(false);
    const takeaway = output.manifest.modules.find(entry => entry.family === "key_takeaway")!;
    expect(new Set(takeaway.claimIds.map(id => graph.claims.find(claim => claim.id === id)!.documentId)).size).toBe(2);
    expect(output.manifest.representation.mode).toBe("drug_comparison");
    expect(validateManifest(output.manifest, graph, { descriptors: [] }).blocking).toBe(0);
  });

  it("a drug whose instruction is not found is named — the comparison is not faked", async () => {
    const { output, graph } = await compare("Сравни эмпаглифлозин и канаглифлозин");
    expect(graph.gaps.join(" ")).toMatch(/инструкция не найдена: канаглифлозин/u);
    expect(output.manifest.modules.some(entry => entry.family === "comparison")).toBe(false);
    // The one instruction that was read is shown as a drug card.
    expect(output.manifest.modules.some(entry => entry.family === "drug_reference")).toBe(true);
  });

  it("renders a table with row headers, column headers and an explanation instead of a verdict", async () => {
    const { output, graph } = await compare("Сравни эмпаглифлозин и дапаглифлозин");
    const run = { id: "run-cmp", agentId: "reference", specialty: "endocrinology", trigger: "composer", startedAt: graph.createdAt, completedAt: graph.createdAt, status: "completed", input: { text: "Сравни эмпаглифлозин и дапаглифлозин", preferenceDigest: "" }, intent: "drug", plan: [], toolsUsed: [], resultIds: [], newResultCount: 0, error: null, durationMs: 1, riskNotices: [], synthesis: null } as unknown as AgentRun;
    const html = renderToStaticMarkup(<WorkspaceProvider specialty="endocrinology"><ExperienceView run={run} experience={{ intentId: "i", manifest: output.manifest, graph, plan: { id: "p", steps: 1, invocations: 1, reused: false } }} results={[]} job="drug" /></WorkspaceProvider>).replace(/\u00a0/gu, " ");
    expect(html).toContain('<table class="pt-compare-table"');
    expect(html).toContain('<th scope="row">Противопоказания</th>');
    expect(html).toContain('<th scope="col"><span class="pt-compare-drug">дапаглифлозин</span>');
    expect(html).toContain("а не эффективности: продукт не выбирает препарат");
    expect(html).toContain("В прочитанной части инструкции раздела нет");
    // The product never ranks: no verdict words of its own (quotes from instructions may say «рекомендуемая доза»).
    expect(html.match(/[^.<>]*(?:лучше|предпочтительн|победител|выигрыва)[^.<>]*/giu) ?? []).toEqual([]);
  });
});
