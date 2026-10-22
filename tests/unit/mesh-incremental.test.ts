import { beforeEach, describe, expect, it } from "vitest";
import { compileExperience } from "@/lib/mesh/compiler";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { planSources } from "@/lib/mesh/planner";
import type { PortalJob } from "@/lib/portal/jobs";
import type { SpecialtyId } from "@/lib/domain/types";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { createSourceDeltaChange, evaluateChange, samplesFor, sourcePolicyVersion } from "@/server/mesh/changes";
import { executePlan } from "@/server/mesh/execute";
import { KnowledgeStore, refreshDocument } from "@/server/mesh/knowledge";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { fakeAbstracts, fakeArticle, fakePubmed, FIXED_NOW, testContext } from "./agent-test-utils";
import { ACCEPTANCE_QUESTION, FixtureDriver, HFPEF_ABSTRACT, HFPEF_REVIEW, registryStatuses } from "./mesh-test-utils";

const HF_GUIDELINE = "https://medi.ru/klinicheskie-rekomendatsii/khronicheskaya-serdechnaya-nedostatochnost_14015/";
const HF_DOC = "medi:/klinicheskie-rekomendatsii/khronicheskaya-serdechnaya-nedostatochnost_14015/";
const MIGRAINE = { ...fakeArticle("39000002", "Migraine prophylaxis in adults: a network meta-analysis"), journal: "Cochrane Database Syst Rev", publicationTypes: ["Meta-Analysis"], sortDate: "2025-02-01" };
const MIGRAINE_ABSTRACT = { pmid: "39000002", sections: [{ label: "CONCLUSIONS", text: "Several preventive drugs reduced monthly migraine days compared with placebo." }], conclusion: "Several preventive drugs reduced monthly migraine days compared with placebo.", conclusionLabel: "CONCLUSIONS" };

async function experience(store: KnowledgeStore, driver: FixtureDriver, args: { text: string; specialty: SpecialtyId; job?: PortalJob }) {
  const registry = createSourceRegistry({ browserDriver: driver, site: { minIntervalMs: 0 } });
  const ctx = await testContext({ agentId: "reference", topics: [], specialty: args.specialty, text: args.text, job: args.job ?? "answer", pubmed: fakePubmed([HFPEF_REVIEW, MIGRAINE]), abstracts: fakeAbstracts([HFPEF_ABSTRACT, MIGRAINE_ABSTRACT]) });
  const intent = compileIntent(args.text, args.specialty, { job: args.job ?? null });
  const statuses = await registryStatuses(registry);
  const sources = descriptors(registry);
  const plan = planSources({ intent, sources, statuses });
  const { results } = await executePlan({ plan, intent, registry, ctx, sessionId: "incremental" });
  const graph = buildEvidenceGraph({ id: `graph-${intent.id}`, intent, plan, results, descriptors: sources, statuses, now: ctx.nowIso });
  const compile = { user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: sources }, scenario: intent.context.scenario };
  const { manifest } = compileExperience({ ...compile, graph });
  return { record: store.registerExperience({ key: intent.id, scenario: intent.context.scenario, intent, plan, results, statuses, descriptors: sources, compile, graph, manifest }), registry, sources };
}

async function corpus() {
  const store = new KnowledgeStore();
  const driver = new FixtureDriver();
  const a = await experience(store, driver, { text: ACCEPTANCE_QUESTION, specialty: "cardiology" });
  const b = await experience(store, driver, { text: "Клинические рекомендации по артериальной гипертензии", specialty: "cardiology", job: "guidelines" });
  const c = await experience(store, driver, { text: ACCEPTANCE_QUESTION, specialty: "therapy" });
  const d = await experience(store, driver, { text: "Профилактика мигрени: обзоры", specialty: "neurology" });
  return { store, driver, a, b, c, d, registry: a.registry, sources: a.sources };
}

beforeEach(() => resetBrowserToolState());

describe("incremental invalidation: MEDI-like document v1 → v2 with one changed section", () => {
  it("one document, one chunk, dependent claims and scenarios — and nothing else — move", async () => {
    const { store, driver, a, b, c, d, registry, sources } = await corpus();
    expect(store.experiences.size).toBe(4);
    const corpusDocuments = store.documents.size;
    expect(corpusDocuments).toBeGreaterThanOrEqual(6);
    expect(a.record.manifest.modules.some(entry => entry.family === "conflict")).toBe(true);
    const before = { a: a.record.manifest, b: b.record.manifest, c: c.record.manifest, d: d.record.manifest };
    const oldStatement = a.record.graph.claims.find(claim => claim.kind === "guideline_statement" && claim.documentId === HF_DOC)!;
    const oldAbsence = a.record.graph.claims.find(claim => claim.kind === "drug_not_mentioned")!;

    // The source publishes v2: only section 3.1.11 is different.
    driver.routes[HF_GUIDELINE] = "guideline-hsn-v2.html";
    const now = new Date(FIXED_NOW.getTime() + 86_400_000);
    const delta = (await refreshDocument({ store, registry, documentId: HF_DOC, ctx: { now, nowIso: now.toISOString() }, sessionId: "incremental" }))!;

    // 1 document changed, 1 of N chunks.
    expect(delta.status).toBe("changed");
    expect(delta.chunksChanged).toHaveLength(1);
    expect(store.documents.get(HF_DOC)!.chunks.get(delta.chunksChanged[0])!.path.at(-1)).toMatch(/^3\.1\.11/u);
    expect(delta.chunksTotal).toBe(4); // 1.1, 3.1.2, 3.1.11, 4 — three are unchanged
    expect(delta.chunksAdded).toEqual([]);
    expect(delta.chunksRemoved).toEqual([]);
    // Dependent claims recomputed: the HFpEF statement is replaced; the «not mentioned» observation no longer holds.
    expect(delta.claimsRemoved).toEqual(expect.arrayContaining([oldStatement.id, oldAbsence.id]));
    expect(delta.claimKinds).toContain("guideline_statement");
    // Dependent scenarios stale (cardiology and therapy ask the same question); unrelated ones untouched.
    expect(delta.scenariosStale.sort()).toEqual([a.record.key, c.record.key].sort());
    expect(delta.scenariosUntouched.sort()).toEqual([b.record.key, d.record.key].sort());
    expect(delta.experiencesInvalidated.sort()).toEqual([before.a.id, before.c.id].sort());

    const regeneration = store.regenerateStale(now.toISOString());
    expect(regeneration.regenerated.map(item => item.key).sort()).toEqual([a.record.key, c.record.key].sort());
    const regeneratedA = store.experiences.get(a.record.key)!;
    const newStatement = regeneratedA.graph.claims.find(claim => claim.kind === "guideline_statement" && claim.documentId === HF_DOC && claim.covers.includes("cardiology/heart_failure/hfpef"))!;
    expect(newStatement.polarity).toBe("positive");
    expect(newStatement.quote).toMatch(/Эмпаглифлозин рекомендуется/u);
    expect(regeneratedA.manifest.id).not.toBe(before.a.id);
    // With the guideline now agreeing, the conflict module is gone — a module-family change.
    expect(regeneratedA.manifest.modules.some(entry => entry.family === "conflict")).toBe(false);
    expect(store.experiences.get(b.record.key)!.manifest).toBe(before.b);
    expect(store.experiences.get(d.record.key)!.manifest).toBe(before.d);
    expect(store.experiences.get(b.record.key)!.generation).toBe(1);

    // The entire corpus is NOT rebuilt.
    expect(store.counters.documentsFetched).toBe(1);
    expect(store.counters.claimExtractions).toBe(2);
    expect(store.counters.experiencesCompiled).toBe(2);
    expect(store.documents.size).toBe(corpusDocuments);
    expect(store.documents.get(HF_DOC)!.history).toHaveLength(2);

    // The delta becomes a Change on both risk axes, with negative obligations checked.
    const change = await createSourceDeltaChange({ delta, regeneration, sourceId: "medi", now: now.toISOString(), sessionId: "incremental" });
    expect(change.contract.cause).toBe("source_delta");
    expect(change.contract.knowledge_delta?.documents[0].chunks_changed).toHaveLength(1);
    expect(change.contract.does_not_change).toMatchObject({ module_family: true, navigation: true, user_job: true, source_policy: true, onboarding: true });
    const policy = sourcePolicyVersion(sources);
    const evaluation = await evaluateChange(change, {
      before: samplesFor([{ key: a.record.key, manifest: before.a }, { key: c.record.key, manifest: before.c }], policy),
      after: samplesFor(regeneration.regenerated.map(item => ({ key: item.key, manifest: item.after })), policy),
      afterManifests: regeneration.regenerated.map(item => item.after),
      candidate: `knowledge:${delta.toVersion}`,
      baseline: `knowledge:${delta.fromVersion}`,
      now: now.toISOString(),
    });
    expect(evaluation.assessment.risk_class).toBe("R4");
    expect(evaluation.assessment.experience_impact).toBe("E2");
    expect(evaluation.assessment.required_gates).toEqual(expect.arrayContaining(["human_domain_review", "negative_obligations", "task_fit_eval"]));
    expect(evaluation.obligations.violations.map(item => item.obligation)).toContain("module_family");
    expect(evaluation.obligations.violations.every(item => item.obligation === "module_family")).toBe(true);
    expect(evaluation.decision.status).toBe("BLOCK");
    expect(evaluation.decision.missing_or_failed_gates).toContain("negative_obligations");
  });

  it("a change in a section no scenario depends on updates the version but invalidates nothing", async () => {
    const { store, driver, a, registry } = await corpus();
    driver.routes[HF_GUIDELINE] = "guideline-hsn-v3.html";
    const now = new Date(FIXED_NOW.getTime() + 86_400_000);
    const delta = (await refreshDocument({ store, registry, documentId: HF_DOC, ctx: { now, nowIso: now.toISOString() } }))!;
    expect(delta.status).toBe("changed");
    expect(delta.chunksChanged).toHaveLength(1);
    expect(delta.claimsAdded).toEqual([]);
    expect(delta.claimsRemoved).toEqual([]);
    expect(delta.scenariosStale).toEqual([]);
    expect(delta.experiencesInvalidated).toEqual([]);
    expect(store.regenerateStale(now.toISOString()).regenerated).toEqual([]);
    expect(store.counters.experiencesCompiled).toBe(0);
    expect(store.experiences.get(a.record.key)!.results.flatMap(result => result.documents).find(document => document.id === HF_DOC)!.version.fingerprint).toBe(delta.toVersion);
  });

  it("TTL expiry means «re-check», not «changed»: an unchanged page invalidates nothing", async () => {
    const { store, registry, sources } = await corpus();
    const later = new Date(FIXED_NOW.getTime() + 8 * 86_400_000);
    const due = store.dueForReverification(later, sources).map(record => record.sourceId);
    expect(due).toContain("medi");
    expect(due).not.toContain("esc_guidelines_snapshot");
    const delta = (await refreshDocument({ store, registry, documentId: HF_DOC, ctx: { now: later, nowIso: later.toISOString() } }))!;
    expect(delta.status).toBe("unchanged");
    expect(delta.scenariosStale).toEqual([]);
    expect(store.documents.get(HF_DOC)!.verifiedAt).toBe(later.toISOString());
    expect(store.counters.claimExtractions).toBe(0);
  });
});
