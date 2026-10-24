import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined }),
  usePathname: () => "/cardiology/ask",
  useSearchParams: () => new URLSearchParams(),
}));
import { RISK_COPY, detectRiskSignals } from "@/lib/agents/risk-rules";
import { topicsFor } from "@/lib/agents/vocabulary";
import { buildResearchAnswer, trialNameIn } from "@/lib/agents/research-answer";
import { isFragment } from "@/lib/agents/research-study-normalization";
import type { AgentResultView, AgentRun } from "@/lib/agents/types";
import { compileExperience } from "@/lib/mesh/compiler";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { planSources } from "@/lib/mesh/planner";
import { compileWithSkill } from "@/lib/mesh/skill-compile";
import { skillById } from "@/lib/mesh/skills/registry";
import { flowById } from "@/lib/mesh/flows/registry";
import { runOutcome } from "@/lib/portal/run-outcome";
import { ExperienceView } from "@/components/experience/experience-view";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { sentencesOf } from "@/server/agents/adapters/pubmed-abstracts";
import { executeAgentCommand } from "@/server/agents/commands";
import { workspaceStore } from "@/server/agents/store";
import * as tools from "@/server/agents/tools";
import { findDrugChanges } from "@/server/agents/services/drug-change";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { evidenceAnswer } from "@/server/mesh/executor";
import { executePlan } from "@/server/mesh/execute";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { fakeAbstracts, fakeArticle, fakePubmed, testContext } from "./agent-test-utils";
import { acceptanceGraph, FixtureDriver, HFPEF_ABSTRACT, HFPEF_REVIEW, registryStatuses } from "./mesh-test-utils";
import { profileWith } from "./agent-test-utils";

beforeEach(() => resetBrowserToolState());

function view(run: AgentRun, experience: NonNullable<AgentRun["experience"]>, results: AgentResultView[] = []) {
  return renderToStaticMarkup(<WorkspaceProvider specialty="cardiology"><ExperienceView run={run} experience={experience} results={results} /></WorkspaceProvider>).replace(/\u00a0/gu, " ");
}

function runOf(text: string, extra: Partial<AgentRun> = {}): AgentRun {
  return { id: "run-r1", agentId: "reference", specialty: "cardiology", trigger: "composer", startedAt: "2026-10-24T00:00:00.000Z", completedAt: "2026-10-24T00:00:01.000Z", status: "completed", input: { text, preferenceDigest: "" }, intent: "answer", plan: [], toolsUsed: [], resultIds: [], newResultCount: 0, error: null, durationMs: 1, riskNotices: [], synthesis: null, ...extra } as unknown as AgentRun;
}

describe("B-1: «Не использовать» for a journal holds on the research and feed paths", () => {
  const lancet = { ...fakeArticle("41936368", "PCI versus CABG for left main disease: 10-year outcomes"), journal: "Lancet" };
  const eurHeartJ = { ...fakeArticle("41936369", "PCI versus CABG for left main disease: a pooled analysis"), journal: "Eur Heart J" };

  it("excluded journals are never searched first and their publications are withheld, with a note naming them", async () => {
    const profile = profileWith("cardiology", []);
    profile.interests.excludedSources = ["lancet"];
    const ctx = await testContext({ agentId: "research", topics: [], profile, text: "ЧКВ или АКШ при поражении ствола левой коронарной артерии", pubmed: fakePubmed([lancet, eurHeartJ]) });
    expect(tools.trustedJournals(ctx).some(journal => /^lancet$/iu.test(journal))).toBe(false);
    const found = await tools.searchPubmed(ctx, { term: "left main", journals: ["Lancet", "Eur Heart J"] });
    expect(found.items.map(article => article.pmid)).toEqual(["41936369"]);
    expect(found.use.note).toMatch(/скрыты публикации журналов, исключённых в ваших источниках \(The Lancet\): 1/u);
  });

  it("a publication named by its PMID is shown and said to be from an excluded journal", async () => {
    const profile = profileWith("cardiology", []);
    profile.interests.excludedSources = ["lancet"];
    const ctx = await testContext({ agentId: "research", topics: [], profile, text: "PMID 41936368", pubmed: fakePubmed([lancet]) });
    const found = await tools.searchPubmed(ctx, { term: "41936368[uid]", named: true });
    expect(found.items).toHaveLength(1);
    expect(found.use.note).toMatch(/журнал исключён в вашем профиле \(The Lancet\)/u);
  });
});

describe("B-2 / A-3: a source excluded in the profile is named as the reason, with the way to the profile", () => {
  it("PubMed excluded: the final step names it, the outcome is «Проверка не выполнялась» with a link, never «не распознаны»", async () => {
    const profile = profileWith("cardiology", []);
    profile.interests.excludedSources = ["pubmed"];
    const text = "ЧКВ или АКШ при поражении ствола левой коронарной артерии";
    const ctx = await testContext({ agentId: "reference", topics: [], profile, text, job: "answer", browserDriver: new FixtureDriver(), pubmed: fakePubmed([]) });
    const out = await evidenceAnswer(ctx);
    const final = out.plan.at(-1)!;
    // The reviewer's case: PubMed is the only source this question has, so nothing was searched.
    expect(out.experience?.graph.documents ?? []).toEqual([]);
    expect(`${final.label} ${final.detail}`).not.toMatch(/не распознаны/u);
    expect(final.detail).toMatch(/Подходящие источники исключены в вашем профиле: PubMed/u);
    const outcome = runOutcome({ status: "completed", plan: out.plan, toolsUsed: out.toolsUsed, resultIds: [], experience: out.experience ?? null, error: null } as never);
    expect(outcome).toMatchObject({ kind: "not_run", label: "Проверка не выполнялась", sourcesLink: true });
  });

  it("a PMID with PubMed excluded: «Проверка не выполнялась», not «Проверено: ничего не найдено»; no «в настройках разбора»", () => {
    const run = runOf("PMID 31535829", {
      agentId: "research",
      toolsUsed: [{ tool: "riskCheck", status: "ok", note: null, durationMs: 1, connectorIds: [] }, { tool: "searchPubmed", status: "unavailable", note: "PubMed исключён в вашем профиле", durationMs: 1, connectorIds: ["pubmed"] }, { tool: "rankEvidence", status: "ok", note: null, durationMs: 1, connectorIds: [] }],
    } as Partial<AgentRun>);
    const outcome = runOutcome(run);
    expect(outcome.kind).toBe("not_run");
    expect(outcome.label).not.toMatch(/Проверено/u);
    expect(outcome.sourcesLink).toBe(true);
    const answer = buildResearchAnswer(run, []);
    expect(answer.headline).not.toMatch(/в настройках разбора/u);
    expect(answer.headline).toMatch(/Включите его в источниках профиля/u);
    expect(answer.sourcesLink).toBe(true);
  });
});

describe("A-4: «Сравнили» only after a comparison", () => {
  it("a guideline-change Skill whose versions module found no previous version does not say it compared", async () => {
    const { graph, registry, intent } = await acceptanceGraph();
    const base = { user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario, resultKeys: {} };
    const skill = skillById("cardiology.guideline_change")!;
    const shaped = compileWithSkill(base, graph, skill, flowById(skill.flowId));
    const manifest = { ...shaped.output.manifest, view: { ...(shaped.output.manifest.view ?? { jurisdiction: null, since: null, focus: [], expandedDocumentId: null }), comparison: "previous_version" as const }, modules: shaped.output.manifest.modules.map(entry => entry.family === "recommendation_delta" ? { ...entry, props: { ...entry.props, comparison: "current_state" } } : entry) };
    const html = view(runOf("Что изменилось в рекомендациях по ФП?"), { intentId: "i", manifest: manifest as never, graph: shaped.graph, plan: { id: "p", steps: 1, invocations: 1, reused: false } });
    expect(html).not.toMatch(/Сравнили|сравнение с предыдущей версией/u);
    expect(html).toMatch(/Предыдущую версию не нашли/u);
    const compared = view(runOf("Что изменилось в рекомендациях по ХСН?"), { intentId: "i", manifest: shaped.output.manifest, graph: shaped.graph, plan: { id: "p", steps: 1, invocations: 1, reused: false } });
    expect(compared).toMatch(/Сравнили текущую и предыдущую версии/u);
  });
});

describe("A-5 / C-6: the research review says when it has no direct answer", () => {
  function pubmedResult(id: string, title: string, conclusion: string, effect = "HR 0.74; 95% ДИ 0.56–0.97"): AgentResultView {
    return { id, key: id, agentId: "research", specialty: "cardiology", kind: "research_finding", category: "study", title, summary: "", reasonShown: [], observedAt: "2023-01-01", evidence: [], source: { connectorId: "pubmed", source: "PubMed", sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/` }, actions: [], attributes: { journal: "Eur Heart J", publicationTypes: "Randomized Controlled Trial", "authorsConclusion.text": conclusion, "authorsConclusion.label": "CONCLUSIONS", "evidenceText.access": "abstract", "researchStudy.effectEstimate.value": effect }, partner: null, rank: 1, createdAt: "2026-10-24T00:00:00.000Z", runId: "run-r1" } as unknown as AgentResultView;
  }
  const plan = [{ id: "s1", label: "Искали публикации в PubMed", tool: "searchPubmed", status: "done", detail: "6 публикаций · журналы поиска: BMJ, Cochrane Database Syst Rev, Lancet, Nat Med", connectorIds: ["pubmed"] }];
  const tools = [{ tool: "searchPubmed", status: "ok", note: null, durationMs: 1, connectorIds: ["pubmed"] }];

  it("trial names", () => {
    expect(trialNameIn("Исследование DAPA-HF: основной результат")).toBe("DAPA-HF");
    expect(trialNameIn("EMPEROR-Preserved: что показало")).toBe("EMPEROR-Preserved");
    expect(trialNameIn("Исследование DELIVER при ХСН")).toBe("DELIVER");
    expect(trialNameIn("ПОАК при ФП у пожилых")).toBeNull();
    expect(trialNameIn("Что показали исследования о SGLT2 при ХСН")).toBeNull();
  });

  it("the named trial is not among the found titles: said first, with PMID/DOI as the way, and no figures on top", () => {
    const run = runOf("Исследование DAPA-HF: основной результат", { agentId: "research", plan, toolsUsed: tools } as Partial<AgentRun>);
    const answer = buildResearchAnswer(run, [pubmedResult("1", "Dapagliflozin in heart failure with mildly reduced or preserved ejection fraction (DELIVER)", "Dapagliflozin reduced the combined risk of worsening heart failure or cardiovascular death.")]);
    expect(answer.headline).toMatch(/^Основную публикацию «DAPA-HF» не нашли/u);
    expect(answer.headline).toMatch(/PMID или DOI/u);
    expect(answer.broader).toBe(true);
  });

  it("no found work names the asked drugs: «Прямого ответа не нашлось», journals named", () => {
    const run = runOf("Апиксабан против варфарина у пациентов на гемодиализе: кровотечения", { agentId: "research", plan, toolsUsed: tools } as Partial<AgentRun>);
    const answer = buildResearchAnswer(run, [pubmedResult("2", "Rivaroxaban and cognitive outcomes in atrial fibrillation (BRAIN-AF)", "Rivaroxaban did not reduce cognitive decline.", "HR 1.10")]);
    expect(answer.headline).toMatch(/^Прямого ответа не нашлось/u);
    expect(answer.headline).toMatch(/Искали в журналах: BMJ, Cochrane Database Syst Rev, Lancet, Nat Med/u);
    expect(answer.broader).toBe(true);
  });

  it("a work naming the drugs is a direct answer, and the journals are still named", () => {
    const run = runOf("Апиксабан против варфарина у пациентов на гемодиализе: кровотечения", { agentId: "research", plan, toolsUsed: tools } as Partial<AgentRun>);
    const answer = buildResearchAnswer(run, [pubmedResult("3", "Apixaban versus warfarin in patients on haemodialysis", "Apixaban was associated with less bleeding than warfarin.")]);
    expect(answer.broader).toBeUndefined();
    expect(answer.headline).toMatch(/Искали в журналах:/u);
  });
});

describe("A-6: no pieces of sentences in study fields", () => {
  it.each([") by 17% versus placebo (hazard ratio (HR) 0", "94) to a similar extent in both groups", "of the trial was a composite of worsening heart failure", "s of the trial were met"])("«%s» is a fragment", value => {
    expect(isFragment(value)).toBe(true);
  });
  it("whole values are kept", () => {
    expect(isFragment("cardiovascular death or hospitalization for heart failure")).toBe(false);
    expect(isFragment("A composite of cardiovascular death or worsening heart failure (HR 0.82; 95% CI 0.73 to 0.92).")).toBe(false);
  });
  it("a point inside a number does not end a sentence", () => {
    expect(sentencesOf("Dapagliflozin reduced the risk (HR 0.82; P<0.001). It was well tolerated.")).toHaveLength(2);
    expect(sentencesOf("Effect 0.94) to a similar extent. Next.")[0]).toMatch(/^Effect 0\.94\)/u);
  });
});

describe("C-3: a dose asked for a described patient", () => {
  it("common wordings are recognised as patient-specific prescribing", () => {
    for (const text of ["Мужчина 58 лет, ФВ 30%, какая стартовая доза бисопролола?", "Женщина 78 лет, вес 55 кг, креатинин 140 мкмоль/л, ФП — апиксабан 2,5 или 5 мг?", "Стоит ли отменить аспирин пациенту 70 лет"]) {
      expect(detectRiskSignals(text), text).toMatchObject({ prescribing: true, patientSpecific: true });
    }
    expect(detectRiskSignals("Маммография у женщин 50 лет").patientSpecific).toBe(false);
    expect(detectRiskSignals("Аспирин у пациентов 75 лет и старше").patientSpecific).toBe(false);
  });

  it("«Коротко» says the dose is not chosen and shows no dosing section", async () => {
    const text = "Мой пациент 67 лет: какую дозу эмпаглифлозина назначить при ХСН?";
    const driver = new FixtureDriver();
    const registry = createSourceRegistry({ browserDriver: driver, site: { minIntervalMs: 0 } });
    const intent = compileIntent(text, "cardiology");
    const ctx = await testContext({ agentId: "reference", topics: [], specialty: "cardiology", text, job: "drugs", pubmed: fakePubmed([HFPEF_REVIEW]), abstracts: fakeAbstracts([HFPEF_ABSTRACT]) });
    const statuses = await registryStatuses(registry);
    const plan = planSources({ intent, sources: descriptors(registry), statuses });
    const execution = await executePlan({ plan, intent, registry, ctx, sessionId: "r1-dose" });
    const graph = buildEvidenceGraph({ id: "graph-r1-dose", intent, plan, results: execution.results, descriptors: descriptors(registry), statuses, now: ctx.nowIso });
    const output = compileExperience({ graph, user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario, resultKeys: {} });
    const html = view(runOf(text, { riskNotices: [RISK_COPY.patientSpecific, RISK_COPY.prescribing] }), { intentId: "i", manifest: output.manifest, graph, plan: { id: "p", steps: 1, invocations: 1, reused: false } });
    const takeaway = html.match(/data-module="key_takeaway"[\s\S]*?<\/section>/u)?.[0] ?? "";
    expect(takeaway).toContain("Дозу для описанного пациента не подбираем");
    expect(takeaway).not.toMatch(/Дозирование ·/u);
    // The same answer without the patient: the dosing section is in «Коротко», so the rule is what removed it.
    const plain = view(runOf(text), { intentId: "i", manifest: output.manifest, graph, plan: { id: "p", steps: 1, invocations: 1, reused: false } });
    expect(plain.match(/data-module="key_takeaway"[\s\S]*?<\/section>/u)?.[0] ?? "").toMatch(/Дозирование ·/u);
  });
});

describe("C-5: a guideline question about a drug no guideline speaks of", () => {
  it("no guideline states a position on empagliflozin (or SGLT2) for HFpEF: the gap is named in «Коротко»", async () => {
    // The fixtures hold the reviewer's case: КР 2016 «no specific treatment» for ХСН-сФВ, an ESC summary on SGLT2
    // started in hospital (decompensated HF, not HFpEF) and the HFpEF definition — no position on the drug for HFpEF.
    const { graph, registry, intent } = await acceptanceGraph();
    expect(graph.gaps.join(" | ")).toMatch(/позиции действующих рекомендаций по препарату «эмпаглифлозин» при /u);
    const output = compileExperience({ graph, user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario, resultKeys: {} });
    const html = view(runOf("Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?"), { intentId: "i", manifest: output.manifest, graph, plan: { id: "p", steps: 1, invocations: 1, reused: false } });
    expect(html.match(/data-module="key_takeaway"[\s\S]*?<\/section>/u)?.[0] ?? "").toMatch(/позиции действующих рекомендаций по препарату «эмпаглифлозин»/u);
  });

  it("a guideline statement on the class for the asked phenotype is a position: no gap", async () => {
    const { graph, plan, execution, registry, intent, ctx } = await acceptanceGraph();
    const guideline = graph.documents.find(document => document.kind === "guideline" || document.kind === "society_guideline_summary")!;
    const results = execution.results.map(result => ({ ...result, documents: result.documents.map(document => document.id !== guideline.id ? document : { ...document, claims: [...document.claims, { ...document.claims[0], id: "claim-sglt2-hfpef", kind: "guideline_statement" as const, statement: "иНГЛТ-2 рекомендованы при ХСН с сохранённой ФВ (класс I).", quote: "иНГЛТ-2 рекомендованы при ХСН с сохранённой ФВ (класс I).", entityIds: [], covers: intent.context.subtype ? [intent.context.subtype.id] : [] }] }) }));
    const statuses = await registryStatuses(registry);
    const withPosition = buildEvidenceGraph({ id: "graph-c5", intent, plan, results, descriptors: descriptors(registry), statuses, now: ctx.nowIso });
    expect(withPosition.gaps.join(" | ")).not.toMatch(/позиции действующих рекомендаций по препарату/u);
  });
});

describe("A-8: the feed honours an excluded source", () => {
  it("ESC set to «Не использовать»: no «ESC 2026: …» record in the drug feed", async () => {
    const profile = profileWith("cardiology", ["hf"]);
    const shown = findDrugChanges(await testContext({ agentId: "drugs", topics: ["hf"], profile }));
    expect(shown.some(draft => /ESC/u.test(draft.title))).toBe(true);
    profile.interests.excludedSources = ["esc"];
    const excluded = findDrugChanges(await testContext({ agentId: "drugs", topics: ["hf"], profile }));
    expect(excluded.some(draft => /ESC/u.test(draft.title))).toBe(false);
    // Only the excluded source's records go; the rest of the feed stays as it was.
    expect(excluded.map(draft => draft.key)).toEqual(shown.filter(draft => !/ESC|Eur Heart J|European Heart Journal/u.test(`${draft.title} ${JSON.stringify(draft.source)}`)).map(draft => draft.key));
  });
});

describe("B-7: the whole answer can be saved", () => {
  it("«Сохранить ответ» keeps the question, «Коротко» and the sources as one material that leads back to the result", async () => {
    const SESSION = "r1-save-answer";
    const { graph, registry, intent } = await acceptanceGraph();
    const output = compileExperience({ graph, user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario, resultKeys: {} });
    const run = { ...runOf("Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?"), id: "run-00000000-0000-4000-8000-000000000001", experience: { intentId: "i", manifest: output.manifest, graph, plan: { id: "p", steps: 1, invocations: 1, reused: false } } } as AgentRun;
    await workspaceStore().saveRun(SESSION, run);
    const saved = await executeAgentCommand(SESSION, { action: "saveAnswer", specialty: "cardiology", runId: run.id });
    expect(saved.material).toMatchObject({ format: "result", ownership: "GENERATED", origin: { runId: run.id } });
    expect(saved.material?.title).toMatch(/^Ответ: Эмпаглифлозин/u);
    expect(saved.material?.text).toMatch(/Коротко:/u);
    // Saved once: a second click returns the same material.
    const again = await executeAgentCommand(SESSION, { action: "saveAnswer", specialty: "cardiology", runId: run.id });
    expect(again.material?.id).toBe(saved.material?.id);
  });
});

describe("A-2 / B-8: the profile page sends only what changed", () => {
  const SESSION = "r1-profile-deltas";
  it("a source change keeps the topics; removing a topic keeps the sources", async () => {
    await executeAgentCommand(SESSION, { action: "setInterests", specialty: "pediatrics", topics: [], trustedSources: [], excludedSources: [], runAgents: false });
    // The home nudge adds a topic while the profile page, opened before, still shows none.
    await executeAgentCommand(SESSION, { action: "addTopic", specialty: "pediatrics", topic: topicsFor("pediatrics")[0].id });
    const before = (await workspaceStore().getProfile(SESSION, "pediatrics"))!.interests.topics;
    expect(before.length).toBe(1);
    await executeAgentCommand(SESSION, { action: "setSourceState", specialty: "pediatrics", source: "lancet", state: "priority" });
    let stored = (await workspaceStore().getProfile(SESSION, "pediatrics"))!.interests;
    expect(stored.topics).toEqual(before);
    expect(stored.trustedSources).toContain("lancet");
    await executeAgentCommand(SESSION, { action: "setSourceState", specialty: "pediatrics", source: "lancet", state: "excluded" });
    stored = (await workspaceStore().getProfile(SESSION, "pediatrics"))!.interests;
    expect(stored.trustedSources).not.toContain("lancet");
    expect(stored.excludedSources).toContain("lancet");
    await executeAgentCommand(SESSION, { action: "removeTopic", specialty: "pediatrics", topic: before[0] });
    stored = (await workspaceStore().getProfile(SESSION, "pediatrics"))!.interests;
    expect(stored.topics).toEqual([]);
    expect(stored.excludedSources).toContain("lancet");
  });
});
