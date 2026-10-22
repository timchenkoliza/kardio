import { beforeEach, describe, expect, it } from "vitest";
import { compileIntent } from "@/lib/mesh/intent";
import { planSources } from "@/lib/mesh/planner";
import type { SourceId, SourceStatusReport } from "@/lib/mesh/sources";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { meshMemoryEvents } from "@/server/mesh/telemetry";
import { acceptanceGraph, FixtureDriver } from "./mesh-test-utils";

const ACCEPTANCE = "Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?";

async function statusesOf(registry: ReturnType<typeof createSourceRegistry>) {
  const entries = await Promise.all(Object.values(registry).map(async adapter => [adapter.id, await adapter.status()] as const));
  return Object.fromEntries(entries) as Record<SourceId, SourceStatusReport>;
}

beforeEach(() => resetBrowserToolState());

describe("SourcePlanner — minimal source set per requirement", () => {
  it("plans the acceptance example without calling every source", async () => {
    const registry = createSourceRegistry({ browserDriver: new FixtureDriver() });
    const intent = compileIntent(ACCEPTANCE, "cardiology");
    const plan = planSources({ intent, sources: descriptors(registry), statuses: await statusesOf(registry) });
    const by = (requirement: string) => plan.steps.filter(step => step.requirement === requirement).map(step => `${step.role}:${step.sourceId}`);

    expect(by("russian_guideline")).toEqual(["primary:goldenset_catalog", "fallback:medi"]);
    expect(by("russian_drug_reference")).toEqual(["primary:medi"]);
    expect(by("drug_label")).toEqual(["fallback:openfda"]);
    expect(by("current_research")).toEqual(["primary:pubmed"]);
    expect(by("specialty_society_guideline")).toEqual(["primary:esc_guidelines_snapshot"]);
    expect(by("official_guideline_status")).toEqual(["handoff:minzdrav_rubricator"]);
    expect(plan.budget.planned).toBeLessThanOrEqual(plan.budget.maxInvocations);
    // Not every source: the regulatory snapshot and ГРЛС are not needed for this job.
    expect(plan.steps.some(step => step.sourceId === "regulatory_snapshot")).toBe(false);
    expect(plan.rejected.find(item => item.sourceId === "regulatory_snapshot")?.reason).toBeTruthy();
    // International guidelines are covered by the same PubMed search and the ESC snapshot — no second call.
    expect(plan.steps.filter(step => step.sourceId === "pubmed")).toHaveLength(1);
    expect(plan.steps.find(step => step.sourceId === "esc_guidelines_snapshot")?.alsoCovers).toContain("international_guideline");
  });

  it("a non-cardiology physician never gets cardiology-only snapshots or catalog", async () => {
    const registry = createSourceRegistry({ browserDriver: new FixtureDriver() });
    const intent = compileIntent(ACCEPTANCE, "therapy");
    const plan = planSources({ intent, sources: descriptors(registry), statuses: await statusesOf(registry) });
    const used = new Set(plan.steps.map(step => step.sourceId));
    expect(used.has("goldenset_catalog")).toBe(false);
    expect(used.has("esc_guidelines_snapshot")).toBe(false);
    expect(plan.steps.find(step => step.requirement === "russian_guideline")?.sourceId).toBe("medi");
    expect(plan.rejected.some(item => item.sourceId === "esc_guidelines_snapshot" && /специальности/u.test(item.reason))).toBe(true);
  });

  it("when MEDI is unavailable the US label stands in and the gap is reported", async () => {
    const registry = createSourceRegistry({ browserDriver: null });
    const intent = compileIntent("Дапаглифлозин: противопоказания", "endocrinology");
    const plan = planSources({ intent, sources: descriptors(registry), statuses: await statusesOf(registry) });
    expect(plan.steps.some(step => step.sourceId === "medi")).toBe(false);
    expect(plan.steps.find(step => step.role === "primary")?.sourceId).toBe("openfda");
    expect(plan.unmet.map(item => item.requirement)).toContain("russian_drug_reference");
  });

  it("does not call sources that cannot answer: no drug → no drug sources; no disease → guideline requirement unmet", async () => {
    const registry = createSourceRegistry({ browserDriver: new FixtureDriver() });
    const plan = planSources({ intent: compileIntent("Клинические рекомендации", "therapy", { job: "guidelines" }), sources: descriptors(registry), statuses: await statusesOf(registry) });
    expect(plan.steps.some(step => step.sourceId === "openfda" || step.requirement === "russian_drug_reference")).toBe(false);
    expect(plan.unmet.find(item => item.requirement === "russian_guideline")?.reason).toMatch(/не распознано/u);
  });

  it("respects the physician's excluded sources", async () => {
    const registry = createSourceRegistry({ browserDriver: new FixtureDriver() });
    const plan = planSources({ intent: compileIntent(ACCEPTANCE, "cardiology"), sources: descriptors(registry), statuses: await statusesOf(registry), excludedSources: ["pubmed"] });
    expect(plan.steps.some(step => step.sourceId === "pubmed")).toBe(false);
    expect(plan.rejected.find(item => item.sourceId === "pubmed")?.reason).toMatch(/исключён/u);
  });
});

describe("Evidence Graph v0.1 — traceable, conflict-preserving", () => {
  it("executes the plan: fallbacks only when needed, hand-offs without network", async () => {
    const { execution, plan, driver } = await acceptanceGraph({ sessionId: "graph-test" });
    const outcome = (sourceId: string) => execution.results.filter(result => result.invocation.sourceId === sourceId).map(result => result.invocation.outcome);
    expect(outcome("goldenset_catalog")).toEqual(["empty"]); // no HF guideline in the Golden Set
    expect(outcome("medi")).toEqual(["ok", "ok"]); // fallback for the guideline + drug reference
    expect(outcome("openfda")).toEqual([]); // Russian instruction found → US label not needed
    expect(execution.skipped).toEqual([plan.steps.find(step => step.sourceId === "openfda")!.id]);
    expect(outcome("minzdrav_rubricator")).toEqual(["handoff"]);
    expect(driver.calls.some(url => url.includes("/search"))).toBe(false);
    const invoked = meshMemoryEvents({ sessionId: "graph-test", event: "source_invoked" });
    expect(invoked.length).toBe(execution.results.length);
    expect(JSON.stringify(invoked)).not.toMatch(/Эмпаглифлозин при ХСН/u);
  });

  it("every claim is traceable to a document and source; conflicts are preserved, not resolved", async () => {
    const { graph } = await acceptanceGraph();
    const documents = new Map(graph.documents.map(document => [document.id, document]));
    for (const claim of graph.claims) {
      expect(documents.has(claim.documentId)).toBe(true);
      expect(documents.get(claim.documentId)!.url).toMatch(/^https?:\/\//u);
      expect(graph.relations.some(relation => relation.type === "supported_by" && relation.from === claim.id)).toBe(true);
    }
    expect(graph.conflicts.length).toBeGreaterThan(0);
    const conflict = graph.conflicts.find(item => item.claimIds.some(id => graph.claims.find(claim => claim.id === id)?.kind === "guideline_statement"))!;
    expect(conflict.kind).toBe("temporal_divergence");
    expect(conflict.resolution).toBe("unresolved");
    expect(conflict.explanation).toMatch(/2016/u);
    const older = graph.claims.find(claim => claim.id === conflict.claimIds[0])!;
    expect(older.polarity).toBe("negative");
    expect(graph.relations.some(relation => relation.type === "conflicts_with" && relation.status === "candidate")).toBe(true);
    expect(graph.relations.some(relation => relation.type === "not_mentioned_in")).toBe(true);
  });

  it("freshness and coverage are explicit", async () => {
    const { graph } = await acceptanceGraph();
    const guideline = graph.documents.find(document => document.kind === "guideline" && document.sourceId === "medi")!;
    expect(graph.freshness.find(item => item.documentId === guideline.id)?.state).toBe("revision_overdue");
    expect(graph.confidence.coverage.russian_guideline).toBe("met");
    expect(graph.confidence.coverage.russian_drug_reference).toBe("met");
    expect(graph.confidence.coverage.current_research).toBe("met");
    expect(graph.confidence.coverage.official_guideline_status).toBe("handoff");
    expect(graph.sources.find(source => source.id === "minzdrav_rubricator")?.invoked).toBe(false);
  });
});
