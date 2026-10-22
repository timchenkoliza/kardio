import { beforeEach, describe, expect, it } from "vitest";
import { SOURCE_OPTIONS } from "@/lib/agents/vocabulary";
import { compileExperience, PRIORITY_SIGNAL, type CompileInput } from "@/lib/mesh/compiler";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { EXCLUDED_BY_PHYSICIAN, excludedByPhysician, planSources } from "@/lib/mesh/planner";
import { matchesJournal, meshSourcePreference } from "@/lib/mesh/source-preferences";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { executePlan } from "@/server/mesh/execute";
import { evidenceAnswer } from "@/server/mesh/executor";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { fakeAbstracts, fakeArticle, fakePubmed, profileWith, testContext } from "./agent-test-utils";
import { ACCEPTANCE_QUESTION, FixtureDriver, HFPEF_ABSTRACT, HFPEF_REVIEW, registryStatuses } from "./mesh-test-utils";

beforeEach(() => resetBrowserToolState());

async function plan(question: string, excludedOptions: string[], options: { job?: "drug" | "answer" | "guidelines" } = {}) {
  const registry = createSourceRegistry({ browserDriver: new FixtureDriver() });
  const intent = compileIntent(question, "cardiology", options.job ? { job: options.job } : {});
  return planSources({ intent, sources: descriptors(registry), statuses: await registryStatuses(registry), excludedSources: meshSourcePreference(excludedOptions).sources });
}

const planned = (result: Awaited<ReturnType<typeof plan>>) => result.steps.map(step => `${step.requirement}:${step.role}:${step.sourceId}`);

describe("profile source options → source mesh: one explicit mapping", () => {
  it("every option either names mesh sources / a PubMed journal or is known to have no answer-path effect", () => {
    const registryIds = new Set(Object.keys(createSourceRegistry({ browserDriver: null })));
    for (const option of SOURCE_OPTIONS) for (const sourceId of option.meshSources) expect(registryIds.has(sourceId)).toBe(true);
    // A new option must be classified here on purpose, never silently ignored by answers.
    expect(SOURCE_OPTIONS.filter(option => !option.meshSources.length && !option.pubmedJournal).map(option => option.id)).toEqual(["nmo", "telegram"]);
  });

  it("resolves the ids the profile actually stores", () => {
    expect(meshSourcePreference(["esc"])).toEqual({ sources: ["esc_guidelines_snapshot"], journals: ["Eur Heart J"] });
    expect(meshSourcePreference(["regulators"])).toEqual({ sources: ["regulatory_snapshot"], journals: [] });
    expect(meshSourcePreference(["rko"]).sources).toEqual(["goldenset_catalog"]);
    expect(meshSourcePreference(["pubmed"]).sources).toEqual(["pubmed"]);
    expect(meshSourcePreference(["nejm", "lancet", "aha", "rkj"])).toEqual({ sources: [], journals: ["Russ J Cardiol", "N Engl J Med", "Lancet", "Circulation"] });
    expect(meshSourcePreference(["nmo", "telegram", "unknown-id"])).toEqual({ sources: [], journals: [] });
  });

  it("compares NLM journal abbreviations, not substrings", () => {
    expect(matchesJournal("Lancet.", ["Lancet"])).toBe(true);
    expect(matchesJournal("n engl j med", ["N Engl J Med"])).toBe(true);
    expect(matchesJournal("Lancet Oncol", ["Lancet"])).toBe(false);
    expect(matchesJournal(null, ["Lancet"])).toBe(false);
  });
});

describe("«Не использовать» removes the source from the plan and says so", () => {
  it("excluding ESC removes the ESC snapshot and nothing else", async () => {
    const baseline = await plan(ACCEPTANCE_QUESTION, []);
    const excluded = await plan(ACCEPTANCE_QUESTION, ["esc"]);
    expect(planned(baseline)).toContain("specialty_society_guideline:primary:esc_guidelines_snapshot");
    expect(excluded.steps.some(step => step.sourceId === "esc_guidelines_snapshot")).toBe(false);
    expect(planned(excluded)).toEqual(planned(baseline).filter(step => !step.endsWith(":esc_guidelines_snapshot")));
    expect(excluded.rejected.find(item => item.sourceId === "esc_guidelines_snapshot")?.reason).toBe(EXCLUDED_BY_PHYSICIAN);
    expect(excludedByPhysician(excluded)).toEqual(["esc_guidelines_snapshot"]);
  });

  it("excluding regulators removes the regulatory snapshot from a drug question; FDA labels and ГРЛС stay", async () => {
    const question = "Эмпаглифлозин: противопоказания";
    const baseline = await plan(question, [], { job: "drug" });
    const excluded = await plan(question, ["regulators"], { job: "drug" });
    expect(baseline.steps.some(step => step.sourceId === "regulatory_snapshot")).toBe(true);
    expect(excluded.steps.some(step => step.sourceId === "regulatory_snapshot")).toBe(false);
    expect(excludedByPhysician(excluded)).toEqual(["regulatory_snapshot"]);
    expect(planned(excluded)).toEqual(planned(baseline).filter(step => !step.endsWith(":regulatory_snapshot")));
  });

  it("excluding RKO removes the RKO catalog; the Russian guideline still comes from another source", async () => {
    const excluded = await plan(ACCEPTANCE_QUESTION, ["rko"]);
    expect(excluded.steps.some(step => step.sourceId === "goldenset_catalog")).toBe(false);
    expect(excluded.steps.find(step => step.requirement === "russian_guideline" && step.role === "primary")?.sourceId).toBe("medi");
  });

  it("a required need whose only source is excluded is reported as the physician's exclusion, not a missing integration", async () => {
    const excluded = await plan("Что нового в лечении фибрилляции предсердий?", ["pubmed"], { job: "answer" });
    expect(excluded.unmet.find(item => item.requirement === "current_research")?.reason).toBe(`источник ${EXCLUDED_BY_PHYSICIAN}`);
  });

  it("the run trace names the excluded source instead of leaving it out", async () => {
    const profile = profileWith("cardiology", []);
    profile.interests.excludedSources = ["esc"];
    profile.interests.trustedSources = profile.interests.trustedSources.filter(id => id !== "esc");
    const ctx = await testContext({ agentId: "reference", topics: [], profile, text: ACCEPTANCE_QUESTION, job: "guidelines", browserDriver: new FixtureDriver(), pubmed: fakePubmed([HFPEF_REVIEW]), abstracts: fakeAbstracts([HFPEF_ABSTRACT]) });
    const out = await evidenceAnswer(ctx);
    const step = out.plan.find(item => item.id === "excluded-esc_guidelines_snapshot");
    expect(step).toMatchObject({ label: "Рекомендации ESC (снимок редакции)", status: "skipped", connectorIds: ["esc-guidelines"] });
    expect(step?.detail).toMatch(/исключён в ваших источниках/u);
    expect(out.drafts.some(draft => draft.source.connectorId === "esc-guidelines")).toBe(false);
    expect(out.experience?.graph.documents.some(document => document.sourceId === "esc_guidelines_snapshot")).toBe(false);
  });

  it("excluding a journal drops its PubMed publications and says how many were hidden", async () => {
    const nejm = { ...fakeArticle("38000002", "Empagliflozin in heart failure with preserved ejection fraction: a randomised trial"), publicationTypes: ["Randomized Controlled Trial"] };
    const profile = profileWith("cardiology", []);
    profile.interests.excludedSources = ["nejm"];
    const ctx = await testContext({ agentId: "reference", topics: [], profile, text: ACCEPTANCE_QUESTION, job: "guidelines", browserDriver: new FixtureDriver(), pubmed: fakePubmed([HFPEF_REVIEW, nejm]), abstracts: fakeAbstracts([HFPEF_ABSTRACT]) });
    const out = await evidenceAnswer(ctx);
    const pubmedDocs = out.experience!.graph.documents.filter(document => document.sourceId === "pubmed");
    expect(pubmedDocs.map(document => document.attributes.pmid)).toEqual([HFPEF_REVIEW.pmid]);
    expect(out.plan.find(item => item.connectorIds.includes("pubmed"))?.detail).toMatch(/скрыты публикации журналов, исключённых в ваших источниках: 1/u);
  });
});

describe("«Приоритет» changes the order, never the set of evidence", () => {
  // Same claim wording, so only the source decides: Cochrane is newer and ranked first by the search; NEJM is older.
  const NEJM_TRIAL = { ...fakeArticle("38000003", "Empagliflozin in heart failure with preserved ejection fraction"), publicationTypes: ["Randomized Controlled Trial"], pubDate: "2023 Mar 1", sortDate: "2023-03-01" };
  const NEJM_ABSTRACT = { pmid: "38000003", sections: [{ label: "CONCLUSIONS", text: "In patients with HFpEF, SGLT2 inhibitors reduced the risk of hospitalisation for heart failure." }], conclusion: "In patients with HFpEF, SGLT2 inhibitors reduced the risk of hospitalisation for heart failure.", conclusionLabel: "CONCLUSIONS" };
  // An ESC guideline publication (Eur Heart J), older than the Russian guideline: a version, never reordered by priority.
  const ESC_GUIDELINE = { ...fakeArticle("38000004", "2021 ESC Guidelines for heart failure with preserved ejection fraction and empagliflozin"), journal: "Eur Heart J", journalFull: "European heart journal", publicationTypes: ["Practice Guideline"], pubDate: "2021 Sep 21", sortDate: "2021-09-21" };

  async function compiled(trusted: string[], question = ACCEPTANCE_QUESTION) {
    const driver = new FixtureDriver();
    const registry = createSourceRegistry({ browserDriver: driver, site: { minIntervalMs: 0 } });
    const ctx = await testContext({ agentId: "reference", topics: [], text: question, job: "guidelines", pubmed: fakePubmed([HFPEF_REVIEW, NEJM_TRIAL, ESC_GUIDELINE]), abstracts: fakeAbstracts([HFPEF_ABSTRACT, NEJM_ABSTRACT]) });
    const intent = compileIntent(question, "cardiology");
    const statuses = await registryStatuses(registry);
    const sourcePlan = planSources({ intent, sources: descriptors(registry), statuses });
    const execution = await executePlan({ plan: sourcePlan, intent, registry, ctx, sessionId: "priority-test" });
    const graph = buildEvidenceGraph({ id: "graph-priority", intent, plan: sourcePlan, results: execution.results, descriptors: descriptors(registry), statuses, now: ctx.nowIso });
    const input: CompileInput = { graph, user: { signals: ["specialty", ...trusted.map(id => `${PRIORITY_SIGNAL}${id}`)], topics: [], trustedSources: trusted }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario };
    return { graph, output: compileExperience(input) };
  }
  const moduleOf = (result: Awaited<ReturnType<typeof compiled>>, family: string) => result.output.manifest.modules.find(entry => entry.family === family);
  const shown = (result: Awaited<ReturnType<typeof compiled>>) => [...new Set(result.output.manifest.modules.flatMap(entry => entry.documentIds))].sort();
  const takeawayDocs = (result: Awaited<ReturnType<typeof compiled>>) => moduleOf(result, "key_takeaway")!.claimIds.map(id => result.graph.claims.find(claim => claim.id === id)!.documentId);

  it("a prioritised journal goes first; every document and claim is still there", async () => {
    const baseline = await compiled([]);
    const prioritised = await compiled(["nejm"]);
    expect(baseline.output.fallback).toBe(false);
    expect(prioritised.output.fallback).toBe(false);
    // The same evidence: graph, shown documents, provenance counts.
    expect(prioritised.graph.documents.map(document => document.id)).toEqual(baseline.graph.documents.map(document => document.id));
    expect(shown(prioritised)).toEqual(shown(baseline));
    expect(prioritised.output.manifest.provenance).toEqual(baseline.output.manifest.provenance);
    // A different order: the NEJM trial leads the publications and the summary.
    expect(moduleOf(baseline, "evidence")!.documentIds[0]).toBe(`pubmed:${HFPEF_REVIEW.pmid}`);
    expect(moduleOf(prioritised, "evidence")!.documentIds[0]).toBe(`pubmed:${NEJM_TRIAL.pmid}`);
    expect([...moduleOf(prioritised, "evidence")!.documentIds].sort()).toEqual([...moduleOf(baseline, "evidence")!.documentIds].sort());
    expect(takeawayDocs(baseline)).toContain(`pubmed:${HFPEF_REVIEW.pmid}`);
    expect(takeawayDocs(prioritised)).toContain(`pubmed:${NEJM_TRIAL.pmid}`);
    expect(prioritised.output.manifest.personalization.signals).toContain(`${PRIORITY_SIGNAL}nejm`);
  });

  it("never reorders guideline versions: the newest stays first", async () => {
    const baseline = await compiled([]);
    const prioritised = await compiled(["esc", "rko"]);
    const delta = moduleOf(baseline, "recommendation_delta")!;
    expect(delta.documentIds).toContain(`pubmed:${ESC_GUIDELINE.pmid}`);
    expect(moduleOf(prioritised, "recommendation_delta")!.documentIds).toEqual(delta.documentIds);
    expect(moduleOf(prioritised, "recommendation_delta")!.props.order).toBe("newest_first");
  });

  it("an evidence answer records the physician's priority so a refinement keeps the order", async () => {
    const profile = profileWith("cardiology", []);
    profile.interests.trustedSources = ["nejm"];
    const ctx = await testContext({ agentId: "reference", topics: [], profile, text: ACCEPTANCE_QUESTION, job: "guidelines", browserDriver: new FixtureDriver(), pubmed: fakePubmed([HFPEF_REVIEW, NEJM_TRIAL]), abstracts: fakeAbstracts([HFPEF_ABSTRACT, NEJM_ABSTRACT]) });
    const out = await evidenceAnswer(ctx);
    expect(out.experience?.manifest.personalization.signals).toEqual(["specialty", `${PRIORITY_SIGNAL}nejm`]);
    expect(out.experience?.manifest.modules.find(entry => entry.family === "evidence")?.documentIds[0]).toBe(`pubmed:${NEJM_TRIAL.pmid}`);
  });
});
