import { beforeEach, describe, expect, it } from "vitest";
import { SOURCE_OPTIONS } from "@/lib/agents/vocabulary";
import { compileIntent } from "@/lib/mesh/intent";
import { EXCLUDED_BY_PHYSICIAN, excludedByPhysician, planSources } from "@/lib/mesh/planner";
import { matchesJournal, meshSourcePreference } from "@/lib/mesh/source-preferences";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
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
