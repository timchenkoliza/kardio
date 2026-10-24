import { describe, expect, it } from "vitest";
import type { SpecialtyId } from "@/lib/domain/types";
import { compileExperience } from "@/lib/mesh/compiler";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { planSources } from "@/lib/mesh/planner";
import type { PubmedArticle } from "@/server/agents/adapters/pubmed";
import type { PubmedAbstract } from "@/server/agents/adapters/pubmed-abstracts";
import { executePlan } from "@/server/mesh/execute";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { fakeAbstracts, fakeArticle, fakePubmed, testContext } from "./agent-test-utils";
import { FixtureDriver, registryStatuses } from "./mesh-test-utils";

/**
 * R1 review A-1 (P0): «Гипертрофическая кардиомиопатия: лечение» has no nosology in the Domain Graph, so the rule
 * «a review's conclusion names the disease» was skipped and «Коротко» showed conclusions about iron after childbirth
 * and dexrazoxane, marked «По условиям поиска». Without a nosology, the question's disease topic must be named in
 * the review's title or conclusion; otherwise there is no direct answer. One conclusion published twice is one point.
 */
function review(pmid: string, title: string, conclusion: string, sortDate = "2024-05-01"): { article: PubmedArticle; abstract: PubmedAbstract } {
  return {
    article: { ...fakeArticle(pmid, title), journal: "Cochrane Database Syst Rev", publicationTypes: ["Systematic Review"], sortDate },
    abstract: { pmid, sections: [{ label: "AUTHORS' CONCLUSIONS", text: conclusion }], conclusion, conclusionLabel: "AUTHORS' CONCLUSIONS" },
  };
}

const IRON = review("39000001", "Intravenous iron versus oral iron for postpartum anaemia", "Intravenous iron probably reduces fatigue at six weeks after childbirth compared with oral iron.");
const DEXRAZOXANE = review("39000002", "Dexrazoxane for preventing anthracycline cardiotoxicity", "Dexrazoxane probably prevents heart damage in people treated with anthracyclines.");
const HCM = review("39000003", "Mavacamten in obstructive hypertrophic cardiomyopathy: a systematic review", "In obstructive hypertrophic cardiomyopathy, mavacamten improved exercise capacity and symptoms.");
const MENOPAUSE = review("39000004", "Menopausal hormone therapy and cardiovascular risk", "Hormone therapy started after 60 years increases cardiovascular risk.");

async function answer(text: string, specialty: SpecialtyId, items: ReturnType<typeof review>[]) {
  const driver = new FixtureDriver();
  const registry = createSourceRegistry({ browserDriver: driver, site: { minIntervalMs: 0 } });
  const intent = compileIntent(text, specialty);
  const ctx = await testContext({ agentId: "reference", topics: [], specialty, text, job: "answer", pubmed: fakePubmed(items.map(item => item.article)), abstracts: fakeAbstracts(items.map(item => item.abstract)) });
  const statuses = await registryStatuses(registry);
  const plan = planSources({ intent, sources: descriptors(registry), statuses });
  const execution = await executePlan({ plan, intent, registry, ctx, sessionId: `topic-${text}` });
  const graph = buildEvidenceGraph({ id: `graph-${text}`, intent, plan, results: execution.results, descriptors: descriptors(registry), statuses, now: ctx.nowIso });
  const output = compileExperience({ graph, user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario, resultKeys: {} });
  const takeaway = output.manifest.modules.find(entry => entry.family === "key_takeaway");
  const statements = (takeaway?.claimIds ?? []).map(id => graph.claims.find(claim => claim.id === id)!.statement);
  return { graph, takeaway, statements };
}

describe("relevance of a review to a topic without a nosology (R1 A-1)", () => {
  it("the question's topic is named by what the question wrote: the key and its qualifier, never the topic's other disease", async () => {
    const { graph } = await answer("Гипертрофическая кардиомиопатия: лечение", "cardiology", []);
    expect(graph.context.nosology).toBeNull();
    expect(graph.context.topics).toEqual([["кардиомиопат", "cardiomyopath"], ["hypertrophic", "гипертрофическ"]]);
    expect(graph.context.topics?.flat()).not.toContain("myocarditis");
  });

  it("R1 round 2: a conclusion about ICI myocarditis is not the answer on hypertrophic or dilated cardiomyopathy", async () => {
    const ici = review("37884625", "Thymus alterations and susceptibility to immune checkpoint inhibitor myocarditis", "Thymic alterations are associated with ICI myotoxicities.", "2023-05-01");
    for (const question of ["Гипертрофическая кардиомиопатия: лечение", "Дилатационная кардиомиопатия: лечение"]) {
      const { takeaway } = await answer(question, "cardiology", [ici]);
      expect(takeaway?.props.noDirectAnswer, question).toBe(true);
    }
    const { statements } = await answer("Гипертрофическая кардиомиопатия: лечение", "cardiology", [ici, HCM]);
    expect(statements).toEqual([HCM.abstract.conclusion]);
  });

  it("only conclusions that name the topic are the answer", async () => {
    const { statements } = await answer("Гипертрофическая кардиомиопатия: лечение", "cardiology", [IRON, DEXRAZOXANE, HCM]);
    expect(statements).toEqual([HCM.abstract.conclusion]);
  });

  it("no conclusion names the topic: «Прямого ответа не нашлось», never a neighbour's conclusion", async () => {
    const { takeaway } = await answer("Дилатационная кардиомиопатия: лечение", "cardiology", [IRON, DEXRAZOXANE]);
    expect(takeaway?.props.noDirectAnswer).toBe(true);
    expect(takeaway?.claimIds).toEqual([]);
  });

  it("a generic topic («Профилактика») sets no condition: the disease topic decides", async () => {
    const { takeaway } = await answer("Профилактика инфекционного эндокардита", "cardiology", [MENOPAUSE]);
    expect(takeaway?.claimIds ?? []).toEqual([]);
  });

  it("the same conclusion published twice is said once", async () => {
    const text = "Levodopa remains the most effective symptomatic treatment for Parkinson's disease.";
    const { statements } = await answer("Лечение болезни Паркинсона", "neurology", [review("39000011", "Treatment of Parkinson's disease: a Cochrane review", text, "2024-01-01"), review("39000012", "Treatment of Parkinson's disease: a Cochrane review (update)", text, "2023-01-01")]);
    expect(statements).toEqual([text]);
  });
});
