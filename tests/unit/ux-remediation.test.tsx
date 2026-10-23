import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { latinTermsIn } from "@/lib/portal/lexicon";
import { SUGGESTIONS } from "@/lib/portal/suggestions";
import { detectDomain } from "@/lib/mesh/domain-graph";
import { ResearchAnswerView } from "@/components/workspace/research-answer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined }),
  usePathname: () => "/cardiology",
  useSearchParams: () => new URLSearchParams(),
}));

import { AGENT_DEFINITIONS } from "@/lib/agents/definitions";
import { matchedSource, VERIFICATION_LABEL, verificationLabelFor } from "@/lib/agents/format";
import { defaultProfile, isRunDue } from "@/lib/agents/profile";
import type { AgentRun } from "@/lib/agents/types";
import { compileExperience } from "@/lib/mesh/compiler";
import { askedTerms, searchConditions } from "@/lib/mesh/evidence-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { askedSections, openingView, viewDirectives } from "@/lib/mesh/refine";
import { GALLERY, galleryHref } from "@/lib/portal/agents-gallery";
import { continuedQuestion, isDependentFollowup } from "@/lib/portal/continuation";
import { conceptsIn, pubmedCoreTermFor, pubmedTermFor } from "@/lib/portal/lexicon";
import { runOutcome } from "@/lib/portal/run-outcome";
import { drugSectionGroup, editorialVerification } from "@/lib/presentation/physician";
import { unmatchedWords } from "@/lib/portal/unmatched";
import { ExperienceView } from "@/components/experience/experience-view";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { workspaceStore } from "@/server/agents/store";
import { createRun } from "@/server/agents/supervisor";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { conceptsForIntent, createPubmedAdapter } from "@/server/mesh/sources/pubmed";
import { resultCard, scenariosFor } from "@/server/portal/for-you";
import { byQuestionInTitle, titleNamesTopic } from "@/server/agents/topic-match";
import { buildResearchAnswer, researchConditions } from "@/lib/agents/research-answer";
import { buildResearchExport, researchSourceBuckets } from "@/lib/agents/research-citations";
import { pubmedConceptsIn, specificTopicTerms, TOPICS, topicsMentioned } from "@/lib/agents/vocabulary";
import { ResearchResultsTable } from "@/components/workspace/research-report";
import { decideStrategy } from "@/lib/mesh/strategy";
import { eventsBridge, routePortalIntent } from "@/lib/portal/router";
import type { PortalJob } from "@/lib/portal/jobs";
import { recentQuestions } from "@/components/portal/recent-questions";
import { JobResult } from "@/components/portal/job-results";
import { ResearchComparison } from "@/components/workspace/research-comparison";
import { verificationSummary } from "@/server/agents/plan";
import { normalizeInstruction, populationsNamed, type InstructionPage } from "@/server/mesh/sources/medi";
import type { PageSnapshot } from "@/server/mesh/browser/drivers";
import { respondToAsk } from "@/server/portal/manager";
import { ensureSession } from "@/server/services/state";
import { fakeAbstracts, fakeArticle, testContext } from "./agent-test-utils";
import { acceptanceGraph, registryStatuses } from "./mesh-test-utils";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { planSources } from "@/lib/mesh/planner";
import { executePlan } from "@/server/mesh/execute";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";

/**
 * UX remediation matrix (docs/ux-remediation/ISSUE_LEDGER.md, UX-01…UX-10):
 * each test pins the runtime behaviour the physician-facing fix depends on.
 */

const CAP = "Какая длительность антибиотикотерапии при внебольничной пневмонии у взрослых?";
const SESSION = "d".repeat(64);

beforeEach(() => resetBrowserToolState());

describe("UX-01 no depth choice before the question", () => {
  it("the home page and the empty task page render the input without the answer-mode control", () => {
    const home = fs.readFileSync("app/[specialty]/(workspace)/page.tsx", "utf8");
    const ask = fs.readFileSync("app/[specialty]/(workspace)/ask/page.tsx", "utf8");
    expect(home).not.toMatch(/showModes/u);
    expect(ask).not.toMatch(/showModes/u);
  });
});

describe("UX-02 one name per function", () => {
  it("«Что нового» is one function: the background check and the catalogue card share the name and the page", () => {
    expect(AGENT_DEFINITIONS.whats_new.name).toBe("Что нового");
    expect(GALLERY.find(agent => agent.id === "updates")?.name).toBe("Что нового");
    expect(galleryHref(GALLERY.find(agent => agent.id === "updates")!, "cardiology")).toBe("/cardiology/agents/whats-new");
  });
  it("no catalogue entry is another name for the main answer", () => {
    expect(GALLERY.filter(agent => agent.job === "answer")).toEqual([]);
    expect(new Set(GALLERY.map(agent => agent.name)).size).toBe(GALLERY.length);
  });
});

describe("UX-03 the question's conditions reach the search", () => {
  it("adults, community-acquired, antibiotics and duration are all in the PubMed term; children are excluded by title", () => {
    const intent = compileIntent(CAP, "therapy");
    const term = pubmedTermFor(conceptsForIntent(intent), intent.entities.latin)!;
    expect(term).toMatch(/community-acquired/u);
    expect(term).toMatch(/antibiotic\*/u);
    expect(term).toMatch(/duration/u);
    expect(term).toMatch(/ NOT \(child\*\[ti\]/u);
  });
  it("what was asked is kept as whole phrases, so a generic word never stands for it", () => {
    const groups = askedTerms(compileIntent(CAP, "therapy"));
    expect(groups.some(group => ["duration", "short-course", "short course", "shorter"].every(word => group.includes(word)))).toBe(true);
    expect(groups.flat()).not.toContain("course");
  });
  it("a widened search drops what was asked, never the population", () => {
    const concepts = conceptsIn(CAP, "therapy");
    const core = pubmedCoreTermFor(concepts)!;
    expect(core).not.toMatch(/duration/u);
    expect(core).toMatch(/ NOT \(child\*\[ti\]/u);
    expect(core).toMatch(/community-acquired/u);
  });
  it("publications from the widened search are marked partial and never form the main conclusion", async () => {
    const strict = { ...fakeArticle("40000001", "Antibiotic duration in community-acquired pneumonia in adults: a meta-analysis"), journal: "BMJ Open", publicationTypes: ["Meta-Analysis"] };
    const wide = { ...fakeArticle("40000002", "Community-acquired pneumonia: corticosteroids, a systematic review"), journal: "Lancet", publicationTypes: ["Systematic Review"] };
    const pubmed = Object.assign(async (query: { term: string }) => ({ status: "ok" as const, query: query.term, total: 1, articles: /duration/u.test(query.term) ? [strict] : [wide], error: null, durationMs: 1 }), { calls: [] });
    const abstracts = fakeAbstracts([
      { pmid: "40000001", sections: [{ label: "CONCLUSIONS", text: "Short-course antibiotic treatment (3-5 days) is as effective as longer duration in adults with community-acquired pneumonia." }], conclusion: "Short-course antibiotic treatment (3-5 days) is as effective as longer duration in adults with community-acquired pneumonia.", conclusionLabel: "CONCLUSIONS" },
      { pmid: "40000002", sections: [{ label: "CONCLUSIONS", text: "Corticosteroids reduce mortality in severe community-acquired pneumonia." }], conclusion: "Corticosteroids reduce mortality in severe community-acquired pneumonia.", conclusionLabel: "CONCLUSIONS" },
    ]);
    const ctx = await testContext({ agentId: "reference", topics: [], specialty: "therapy", text: CAP, pubmed: pubmed as never, abstracts });
    const result = await createPubmedAdapter().execute({ stepId: "s", operation: "literature_search", requirement: "current_research", intent: compileIntent(CAP, "therapy"), ctx });
    const byPmid = Object.fromEntries(result.documents.map(document => [document.attributes.pmid, document.attributes.questionMatch]));
    expect(byPmid["40000001"]).toBe("all_conditions");
    expect(byPmid["40000002"]).toBe("partial");
    expect(result.documents[0].attributes.pmid).toBe("40000001");
  });
});

describe("UX-03 «Коротко» leads with what was asked", () => {
  it("a conclusion about duration comes before a newer one that only mentions antibiotics", async () => {
    const regimens = { ...fakeArticle("41000001", "Empiric antibiotic regimens for community-acquired pneumonia in adults: network meta-analysis"), journal: "Clin Microbiol Infect", publicationTypes: ["Meta-Analysis"], sortDate: "2025-11-01", pubDate: "2025 Nov" };
    const duration = { ...fakeArticle("41000002", "Antibiotic treatment duration for community-acquired pneumonia in adults: a meta-analysis"), journal: "BMJ Open", publicationTypes: ["Meta-Analysis"], sortDate: "2023-03-22", pubDate: "2023 Mar 22" };
    const conclusions = [
      { pmid: "41000001", text: "For empiric treatment of community-acquired pneumonia in adults, no antibiotic regimen showed important differences." },
      { pmid: "41000002", text: "Shorter treatment duration (3-5 days) probably offers the optimal balance for community-acquired pneumonia in adults." },
    ].map(item => ({ pmid: item.pmid, sections: [{ label: "CONCLUSIONS", text: item.text }], conclusion: item.text, conclusionLabel: "CONCLUSIONS" }));
    // (extended below with a guideline whose «conclusion» describes the panel's work)
    const panel = { ...fakeArticle("41000003", "Antibiotic duration in community-acquired pneumonia in adults: clinical practice guideline"), journal: "Am J Respir Crit Care Med", publicationTypes: ["Practice Guideline"], sortDate: "2026-01-01", pubDate: "2026 Jan" };
    conclusions.push({ pmid: "41000003", sections: [{ label: "CONCLUSIONS", text: "The panel formulated and provided the rationale for recommendations on antibiotic duration in community-acquired pneumonia in adults." }], conclusion: "The panel formulated and provided the rationale for recommendations on antibiotic duration in community-acquired pneumonia in adults.", conclusionLabel: "CONCLUSIONS" });
    const pubmed = Object.assign(async (query: { term: string }) => ({ status: "ok" as const, query: query.term, total: 3, articles: [regimens, duration, panel], error: null, durationMs: 1 }), { calls: [] });
    const ctx = await testContext({ agentId: "reference", topics: [], specialty: "therapy", text: CAP, pubmed: pubmed as never, abstracts: fakeAbstracts(conclusions) });
    const registry = createSourceRegistry({ browserDriver: null });
    const intent = { ...compileIntent(CAP, "therapy"), requirements: ["current_research" as const], optional: [] };
    const statuses = await registryStatuses(registry);
    const plan = planSources({ intent, sources: descriptors(registry), statuses });
    const execution = await executePlan({ plan, intent, registry, ctx, sessionId: "ux-takeaway" });
    const graph = buildEvidenceGraph({ id: "g", intent, plan, results: execution.results, descriptors: descriptors(registry), statuses, now: ctx.nowIso });
    const { manifest } = compileExperience({ graph, user: { signals: [], topics: [] }, modules: ["key_takeaway", "evidence"], policy: { descriptors: [] }, scenario: null, resultKeys: {} });
    const first = manifest.modules.find(entry => entry.family === "key_takeaway")!.claimIds[0];
    expect(graph.claims.find(claim => claim.id === first)?.documentId).toBe("pubmed:41000002");
    // A sentence about the panel's work is not an answer (R-A-07).
    const docs = manifest.modules.find(entry => entry.family === "key_takeaway")!.claimIds.map(id => graph.claims.find(claim => claim.id === id)?.documentId);
    expect(docs).not.toContain("pubmed:41000003");
  });
});

describe("R-A-01 a cached answer is never another question's answer", () => {
  it("questions that differ in what they ask, or in a follow-up condition, have different identities", () => {
    const base = compileIntent(CAP, "therapy").id;
    expect(compileIntent(CAP, "therapy").id).toBe(base);
    expect(compileIntent(continuedQuestion(CAP, "А если течение нетяжёлое?"), "therapy").id).not.toBe(base);
    expect(compileIntent("Диагностика внебольничной пневмонии у взрослых", "therapy").id).not.toBe(base);
  });
});

describe("R-A-03 a drug safety question in another task is answered from the asked sections", () => {
  it("with asked sections, «Коротко» has no indications and no document metadata", async () => {
    const { graph } = await acceptanceGraph();
    const { manifest } = compileExperience({ graph, user: { signals: [], topics: [] }, modules: ["key_takeaway", "drug_reference", "recommendation_delta"], policy: { descriptors: [] }, scenario: null, resultKeys: {}, moduleProps: { drug_reference: { asked: ["contraindications", "safety"] } } });
    const kinds = (manifest.modules.find(entry => entry.family === "key_takeaway")?.claimIds ?? []).map(id => graph.claims.find(claim => claim.id === id)!.kind);
    expect(kinds).not.toContain("indication");
    expect(kinds).not.toContain("currentness");
    expect(kinds).not.toContain("guideline_metadata");
  });
});

describe("N5-1 / N-10 conditions and topics are never silently dropped", () => {
  it("what is asked survives the concept limit even with many conditions", () => {
    const ids = conceptsIn("Апиксабан у пожилых с фибрилляцией предсердий при ХБП: что известно о безопасности?", "cardiology").map(concept => concept.id);
    expect(ids).toContain("modifier:safety");
  });
  it("changed topics make the feed checks due on the next visit, wherever they were edited", () => {
    const profile = defaultProfile("cardiology");
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    profile.subscriptions.whats_new = { ...profile.subscriptions.whats_new, lastRunAt: hourAgo };
    expect(isRunDue(profile, "whats_new", new Date())).toBe(false);
    profile.topicsChangedAt = new Date().toISOString();
    expect(isRunDue(profile, "whats_new", new Date())).toBe(true);
  });
});

describe("UX-04 a follow-up continues the question", () => {
  it("«А если течение нетяжёлое?» depends on the previous question; a new drug question does not", () => {
    expect(isDependentFollowup("А если течение нетяжёлое?", "therapy")).toBe(true);
    expect(isDependentFollowup("а у детей?", "therapy")).toBe(true);
    expect(isDependentFollowup("Аторвастатин: противопоказания", "therapy")).toBe(false);
    // A short add-on continues the question even when it names a condition (N-03).
    expect(isDependentFollowup("а при беременности?", "therapy")).toBe(true);
    expect(isDependentFollowup("а при ХБП?", "therapy")).toBe(true);
    expect(isDependentFollowup("Метформин: противопоказания", "therapy")).toBe(false);
    expect(isDependentFollowup("PMID 31535829", "therapy")).toBe(false);
  });
  it("the continued question keeps every condition and adds the new one; a new population replaces the old", () => {
    const next = continuedQuestion(CAP, "А если течение нетяжёлое?");
    const concepts = conceptsIn(next, "therapy").map(concept => concept.id);
    expect(concepts).toEqual(expect.arrayContaining(["concept:community_acquired", "population:adults", "modifier:antibiotics", "modifier:duration", "modifier:non_severe"]));
    expect(continuedQuestion(CAP, "а у детей?")).not.toMatch(/взросл/u);
  });
  it("a follow-up on a result creates a run that carries the previous question and says it is a continuation", async () => {
    delete process.env.DATABASE_URL;
    await ensureSession(SESSION);
    const store = workspaceStore();
    const previous = await createRun(store, SESSION, { agentId: "reference", specialty: "therapy", profile: defaultProfile("therapy"), trigger: "composer", text: CAP, job: "answer" });
    await store.saveRun(SESSION, { ...previous, status: "completed", completedAt: new Date().toISOString() });
    const response = await respondToAsk(SESSION, "therapy", "А если течение нетяжёлое?", { contextRunId: previous.id, followup: true, schedule: () => undefined });
    expect(response.kind).toBe("run");
    const run = response.kind === "run" ? await store.getRun(SESSION, response.runId) : null;
    expect(run?.input.continuation).toMatchObject({ runId: previous.id, followup: "А если течение нетяжёлое?", question: CAP, rootRunId: previous.id, steps: [], replaced: null });
    // A second step keeps the original question, lists the step in between and names a replaced population.
    await store.saveRun(SESSION, { ...run!, status: "completed", completedAt: new Date().toISOString() });
    const second = await respondToAsk(SESSION, "therapy", "а у детей?", { contextRunId: run!.id, followup: true, schedule: () => undefined });
    const next = second.kind === "run" ? await store.getRun(SESSION, second.runId) : null;
    expect(next?.input.continuation).toMatchObject({ runId: run!.id, question: CAP, rootRunId: previous.id, steps: ["А если течение нетяжёлое?"], replaced: "взрослые → дети" });
    expect(run?.input.text).toMatch(/внебольничной пневмонии у взрослых\. Уточнение: А если течение нетяжёлое\?/u);
  });
});

describe("UX-05 the asked part first", () => {
  it("names the instruction sections a drug question asks for", () => {
    expect(askedSections("Аторвастатин: противопоказания")).toEqual(["contraindications"]);
    expect(askedSections("Апиксабан: противопоказания и взаимодействия")).toEqual(["contraindications", "interactions"]);
    expect(askedSections("Дапаглифлозин")).toEqual([]);
  });
});

describe("UX-06 relevance and text match are different labels", () => {
  it("the verification label speaks about matching the source text, not about answering the question", () => {
    expect(editorialVerification("SUPPORTED").label).toBe("Совпадает с текстом источника");
    for (const label of Object.values(VERIFICATION_LABEL)) expect(label.label).not.toMatch(/подтвержд/iu);
  });
  it("a document from a widened search is labelled «Шире вопроса» and is not in «Коротко»", async () => {
    const { graph } = await acceptanceGraph();
    const widenedId = graph.documents.find(document => document.sourceId === "pubmed")!.id;
    const marked = { ...graph, documents: graph.documents.map(document => document.id === widenedId ? { ...document, attributes: { ...document.attributes, questionMatch: "partial", unmatchedConditions: "длительность" } } : document) };
    const { manifest } = compileExperience({ graph: marked, user: { signals: [], topics: [] }, modules: ["key_takeaway", "evidence"], policy: { descriptors: [] }, scenario: null, resultKeys: {} });
    const takeaway = manifest.modules.find(entry => entry.family === "key_takeaway");
    const claimsInTakeaway = (takeaway?.claimIds ?? []).map(id => marked.claims.find(claim => claim.id === id)!.documentId);
    expect(claimsInTakeaway).not.toContain(widenedId);
    const run = { id: "run-x", agentId: "reference", specialty: "cardiology", input: { text: "x" }, riskNotices: [], progress: null, experience: { manifest, graph: marked } } as unknown as AgentRun;
    const html = renderToStaticMarkup(<WorkspaceProvider specialty="cardiology"><ExperienceView run={run} experience={{ intentId: "i", manifest, graph: marked, plan: { id: "p", steps: 0, invocations: 0, reused: false } }} results={[]} /></WorkspaceProvider>);
    expect(html).toContain("Шире вопроса");
    expect(html).not.toContain("Подтверждено источником");
    // R-A-02: the answer lists what the search used; no label claims the work answers the question.
    expect(html).toContain("Искали по:");
    expect(html).not.toContain("По всем условиям вопроса");
  });
});

describe("UX-07 / UX-10 run outcomes are distinct", () => {
  const base = { status: "completed", plan: [], toolsUsed: [], resultIds: [], experience: null, error: null } as unknown as AgentRun;
  it("found, nothing found, not run, source error and partial each have their own state", () => {
    expect(runOutcome({ ...base, resultIds: ["r1"] }).kind).toBe("found");
    expect(runOutcome({ ...base, toolsUsed: [{ tool: "searchPubmed", connectorIds: ["pubmed"], modes: [], status: "ok", itemCount: 0, durationMs: 1, note: null }] }).kind).toBe("not_found");
    expect(runOutcome({ ...base, toolsUsed: [{ tool: "searchPubmed", connectorIds: ["pubmed"], modes: [], status: "partial", itemCount: 0, durationMs: 1, note: "Нет тем для поиска" }] }, { monitoring: true })).toMatchObject({ kind: "not_run", label: "Проверка не выполнялась" });
    expect(runOutcome({ ...base, toolsUsed: [{ tool: "searchPubmed", connectorIds: ["pubmed"], modes: [], status: "unavailable", itemCount: 0, durationMs: 1, note: "PubMed сейчас недоступен" }] }).kind).toBe("source_error");
    expect(runOutcome({ ...base, status: "partial", resultIds: ["r1"] }).kind).toBe("partial");
    expect(runOutcome({ ...base, plan: [{ id: "s", label: "Поиск не выполнялся", tool: null, status: "skipped", detail: "В вопросе не распознаны заболевание, препарат или тема — искать было нечего", connectorIds: [] }] }).kind).toBe("not_run");
  });
  it("«Готово» is never the label of an empty result; a monitor says «изменений не найдено»", () => {
    expect(runOutcome(base).label).not.toBe("Готово");
    expect(runOutcome({ ...base, toolsUsed: [{ tool: "searchPubmed", connectorIds: ["pubmed"], modes: [], status: "ok", itemCount: 0, durationMs: 1, note: null }] }, { monitoring: true }).label).toBe("Проверено: изменений не найдено");
  });
});

describe("UX-08 «что изменилось» opens as a comparison", () => {
  it("a change question opens the previous-version comparison; without a stated previous version it says so", async () => {
    expect(openingView("Что изменилось в рекомендациях по ХСН?", "guidelines")?.comparison).toBe("previous_version");
    expect(openingView("Клинические рекомендации по ХСН", "guidelines")).toBeNull();
    const { graph } = await acceptanceGraph();
    const without = { ...graph, documents: graph.documents.map(document => ({ ...document, attributes: { ...document.attributes, previousVersion: null } })) };
    expect(viewDirectives(without, null, openingView("Что изменилось в рекомендациях?", "guidelines")!).moduleProps.recommendation_delta).toMatchObject({ comparison: "current_state" });
  });
});

describe("UX-09 no card action pretends to act on the material", () => {
  it("there is no «Кратко» that starts a search; topic searches say they are about the topic", () => {
    for (const kind of ["publication", "guideline", "drug_signal"] as const) {
      const scenarios = scenariosFor(kind, "митральный клапан");
      expect(scenarios.map(item => item.label)).not.toContain("Кратко");
      expect(scenarios.some(item => item.job === "answer")).toBe(false);
    }
  });
});

describe("Round 6: the drug, the asked sections and the feed reason survive", () => {
  it("N5-1: a long question keeps the named drug and the asked safety; one disease named three ways takes one place", () => {
    for (const question of [
      "Апиксабан у пожилых с фибрилляцией предсердий при ХБП",
      "Апиксабан у пожилых с ФП и ХБП: что известно о безопасности?",
      continuedQuestion("Апиксабан у пожилых с фибрилляцией предсердий и сниженной функцией почек: что известно о безопасности?", "А при ХБП?"),
    ]) {
      const concepts = conceptsIn(question, "cardiology");
      expect(concepts.map(concept => concept.id)).toContain("drug:apixaban");
      expect(pubmedTermFor(concepts)).toContain('"apixaban"[tiab]');
      const kidney = concepts.filter(concept => /chronic kidney disease/u.test(concept.term));
      expect(kidney).toHaveLength(1);
      if (/безопасн/u.test(question)) expect(concepts.map(concept => concept.id)).toContain("modifier:safety");
    }
  });

  it("N5-1: «Искали по» names the kidney condition that was searched, and «Не учтено» does not claim it was dropped", () => {
    const question = continuedQuestion("Апиксабан у пожилых с фибрилляцией предсердий и сниженной функцией почек: что известно о безопасности?", "А при ХБП?");
    const conditions = searchConditions(compileIntent(question, "cardiology"));
    expect(conditions).toContain("апиксабан");
    expect(conditions.some(condition => /кардиоренал|хбп|почек/u.test(condition))).toBe(true);
    expect(unmatchedWords(question, conditions, "cardiology")).toEqual([]);
    expect(unmatchedWords("ХСН: что нового в лечении?", searchConditions(compileIntent("ХСН: что нового в лечении?", "cardiology")), "cardiology")).toEqual([]);
  });

  it("N6-1: «Особые указания» is a safety section; «С осторожностью» names the patients who need caution", () => {
    expect(drugSectionGroup("Особые указания")).toBe("safety");
    expect(drugSectionGroup("С осторожностью")).toBe("populations");
    expect(drugSectionGroup("Применение у особых групп пациентов")).toBe("populations");
    expect(drugSectionGroup("Применение при беременности и в период грудного вскармливания")).toBe("populations");
  });

  it("N4-2: the instruction keeps the sections the question names («взаимодействия»), whatever the task", () => {
    const intent = compileIntent("Апиксабан: противопоказания и взаимодействия", "cardiology");
    expect(intent.sections).toEqual(expect.arrayContaining(["contraindications", "interactions"]));
    expect(intent.id).not.toBe(compileIntent("Апиксабан: противопоказания", "cardiology").id);
    const raw: InstructionPage = {
      title: "Эликвис", inn: "апиксабан", registration: null, officialNote: null, prescription: null, indications: [],
      sections: [
        { id: "contraindications", heading: "Противопоказания", text: "Повышенная чувствительность к апиксабану.", html: "" },
        { id: "interactions", heading: "Взаимодействие с другими лекарственными средствами", text: "Сильные ингибиторы CYP3A4 и P-gp повышают концентрацию апиксабана.", html: "" },
        { id: "warnings", heading: "Особые указания", text: "Риск кровотечений.", html: "" },
      ],
    };
    const page = { requestedUrl: "https://medi.ru/instrukciya/eliquis/", finalUrl: "https://medi.ru/instrukciya/eliquis/", status: 200, html: "", fetchedAt: "2026-10-23T00:00:00.000Z", driver: "http", durationMs: 1 } as unknown as PageSnapshot;
    const document = normalizeInstruction(raw, page, { drug: intent.entities.drugs[0], listingDate: null, nosology: null, safety: intent.safety, job: intent.job.primary, sections: intent.sections });
    const headings = document.claims.map(claim => document.chunks.find(chunk => chunk.id === claim.chunkId)?.heading);
    expect(headings).toContain("Взаимодействие с другими лекарственными средствами");
    // Without the asked sections the adapter kept only its default sections: «Взаимодействие» was read and dropped.
    const before = normalizeInstruction(raw, page, { drug: intent.entities.drugs[0], listingDate: null, nosology: null, safety: intent.safety, job: intent.job.primary });
    expect(before.claims.map(claim => before.chunks.find(chunk => chunk.id === claim.chunkId)?.heading)).not.toContain("Взаимодействие с другими лекарственными средствами");
  });

  it("R6-02: an unrecognised feed document is not titled with the specialty", () => {
    const card = resultCard({
      id: "r", key: "k", agentId: "guidelines", specialty: "cardiology", kind: "guideline_change", category: "guideline_publication",
      title: "Clinical Practice Guideline: Tinnitus (Update)", summary: "Otolaryngol Head Neck Surg · 2026", reasonShown: ["Тема: Артериальная гипертензия"],
      observedAt: "2026-10-01", evidence: [], source: { connectorId: "pubmed", sourceName: "PubMed", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/1/", dataOrigin: "runtime_api", retrievedAt: "2026-10-23T00:00:00.000Z" },
      actions: [], attributes: {}, partner: null, rank: 0, createdAt: "2026-10-23T00:00:00.000Z", runId: "run",
    } as unknown as Parameters<typeof resultCard>[0], "cardiology", false);
    expect(card.title).not.toContain("Кардиология");
  });
});

describe("Round 6: a population question is answered from that population's sections", () => {
  const raw: InstructionPage = {
    title: "Эликвис", inn: "апиксабан", registration: null, officialNote: null, prescription: null, indications: [],
    sections: [
      { id: "caution", heading: "С осторожностью", text: "Тяжёлая почечная недостаточность (КК 15–29 мл/мин).", html: "" },
      { id: "pregnancy", heading: "Применение при беременности и в период грудного вскармливания", text: "Данных о применении у беременных нет.", html: "" },
      { id: "dosing", heading: "Способ применения и дозы", text: "Пациентам 80 лет и старше с массой тела 60 кг и менее — 2,5 мг 2 раза в сутки.", html: "" },
    ],
  };
  const page = { requestedUrl: "https://medi.ru/instrukciya/eliquis/", finalUrl: "https://medi.ru/instrukciya/eliquis/", status: 200, html: "", fetchedAt: "2026-10-23T00:00:00.000Z", driver: "http", durationMs: 1 } as unknown as PageSnapshot;
  const headingsFor = (question: string) => {
    const intent = compileIntent(question, "cardiology");
    const document = normalizeInstruction(raw, page, { drug: intent.entities.drugs[0], listingDate: null, nosology: null, safety: intent.safety, job: intent.job.primary, sections: intent.sections, populations: populationsNamed(intent) });
    return document.claims.map(claim => document.chunks.find(chunk => chunk.id === claim.chunkId)?.heading);
  };
  it("elderly with CKD: dosing and «С осторожностью», not pregnancy", () => {
    const headings = headingsFor("Апиксабан у пожилых с фибрилляцией предсердий при ХБП");
    expect(headings).toEqual(expect.arrayContaining(["С осторожностью", "Способ применения и дозы"]));
    expect(headings).not.toContain("Применение при беременности и в период грудного вскармливания");
  });
  it("pregnancy: the pregnancy section", () => {
    expect(headingsFor("Апиксабан при беременности")).toContain("Применение при беременности и в период грудного вскармливания");
  });
});

describe("Round 7: section labels, population excerpts and feed topics stay truthful", () => {
  it("N7-1: «Передозировка» is a safety section, never «Дозирование»", () => {
    expect(drugSectionGroup("Передозировка")).toBe("safety");
    expect(drugSectionGroup("Способ применения и дозы")).toBe("dosing");
  });

  it("N7-2: a population question quotes dosing from the sentence about that population", () => {
    const intent = compileIntent("Апиксабан у пожилых с фибрилляцией предсердий при ХБП", "cardiology");
    const raw: InstructionPage = {
      title: "Эликвис", inn: "апиксабан", registration: null, officialNote: null, prescription: null, indications: [],
      sections: [{ id: "dosing", heading: "Способ применения и дозы", text: "Препарат принимают внутрь независимо от приема пищи. Таблетку можно измельчить. Пациенты с нарушением функции почек: при клиренсе креатинина 15–29 мл/мин доза 2,5 мг 2 раза в сутки.", html: "" }],
    };
    const page = { requestedUrl: "https://medi.ru/instrukciya/eliquis/", finalUrl: "https://medi.ru/instrukciya/eliquis/", status: 200, html: "", fetchedAt: "2026-10-23T00:00:00.000Z", driver: "http", durationMs: 1 } as unknown as PageSnapshot;
    const document = normalizeInstruction(raw, page, { drug: intent.entities.drugs[0], listingDate: null, nosology: null, safety: intent.safety, job: intent.job.primary, sections: intent.sections, populations: populationsNamed(intent) });
    expect(document.claims[0]?.quote).toMatch(/^Пациенты с нарушением функции почек/u);
  });

  it("R7-02: a title about a more specific topic does not count for the broader one", () => {
    const others = ['"pulmonary hypertension"[tiab]', "hypertension[tiab]"];
    expect(titleNamesTopic("Brazilian Thoracic Society recommendations for the treatment of pulmonary hypertension", "hypertension[tiab]", others)).toBe(false);
    expect(titleNamesTopic("2026 ISH guideline on the management of hypertension in Africa", "hypertension[tiab]", others)).toBe(true);
    expect(titleNamesTopic("Pulmonary hypertension: 2026 update", '"pulmonary hypertension"[tiab]', others)).toBe(true);
  });

  it("R7-03: a learning card shows the topic's name, not its vocabulary id", () => {
    const card = resultCard({
      id: "r", key: "k", agentId: "learning", specialty: "cardiology", kind: "learning_module", category: null,
      title: "Артериальная гипертензия: клинические рекомендации 2024", summary: "Рекомендации РКО", reasonShown: [],
      observedAt: "2026-10-01", evidence: [], source: { connectorId: "catalog", sourceName: "Каталог", sourceUrl: "https://example.org/", dataOrigin: "curated_snapshot", retrievedAt: "2026-10-23T00:00:00.000Z" },
      actions: [], attributes: { topic: "ah", step: "guideline" }, partner: null, rank: 0, createdAt: "2026-10-23T00:00:00.000Z", runId: "run",
    } as unknown as Parameters<typeof resultCard>[0], "cardiology", false);
    expect(card.tags).toContain("Артериальная гипертензия");
    expect(card.tags).not.toContain("ah");
  });
});

describe("D-7: the research review says what was checked and puts the asked population first", () => {
  it("a record checked only by its citation is «Сверены данные публикации», not «Совпадает с текстом источника»", () => {
    const citation = [{ claim: "Опубликовано: «Switching from warfarin to DOACs in frail elderly patients» — Eur Heart J, 2026" }];
    expect(verificationLabelFor("SUPPORTED", citation).label).toBe("Сверены данные публикации");
    expect(verificationLabelFor("SUPPORTED", [{ claim: "Short-course therapy was non-inferior." }]).label).toBe("Совпадает с текстом источника");
  });

  it("titles that name the asked population and drug class come first", () => {
    const terms = conceptsIn("ПОАК у пожилых с фибрилляцией предсердий", "cardiology").filter(concept => concept.kind === "concept").map(concept => concept.term);
    const ordered = byQuestionInTitle([
      { title: "1-month versus 12-month dual antithrombotic therapy after percutaneous coronary intervention in patients with atrial fibrillation (OPTIMA-AF)" },
      { title: "Switching from warfarin to direct oral anticoagulants in frail elderly Asian patients with atrial fibrillation" },
      { title: "Temporal trends in the use of oral anticoagulants and clinical outcomes in older, elderly, and very elderly patients with atrial fibrillation" },
    ], terms);
    expect(ordered[0].title).toMatch(/elderly/u);
    expect(ordered[1].title).toMatch(/elderly/u);
    expect(ordered[2].title).toMatch(/OPTIMA-AF/u);
  });

  it("the reading note does not speak of authors' conclusions when no text was read", () => {
    const run = { id: "run", agentId: "research", specialty: "cardiology", status: "completed", input: { text: "ПОАК у пожилых с фибрилляцией предсердий" }, toolsUsed: [{ tool: "searchPubmed", connectorIds: ["pubmed"], modes: [], status: "ok", itemCount: 1, durationMs: 1, note: null }], plan: [], resultIds: [] } as unknown as AgentRun;
    const result = { id: "r1", rank: 1, partner: null, kind: "research_finding", category: "publication", title: "Switching from warfarin to DOACs in frail elderly patients", summary: "Eur Heart J · 2026", attributes: {}, evidence: [{ claim: "Опубликовано: «Switching…» — Eur Heart J", verificationStatus: "SUPPORTED", evidenceLevel: "peer_reviewed" }], source: { source: "PubMed", connectorId: "pubmed" }, actions: [] } as unknown as Parameters<typeof buildResearchAnswer>[1][number];
    const answer = buildResearchAnswer(run, [result]);
    expect(answer.practice).not.toMatch(/если тексты статей прочитаны/u);
    expect(answer.practice).toMatch(/Тексты статей не читались/u);
  });
});

describe("Round 8: labels say what was checked, the review names what it did not search, topics are named in titles", () => {
  it("N8-1: a citation from a journal outside the physicians' list is checked, and says the journal's standing apart", () => {
    const evidence = [{ claim: "Опубликовано: «Switching from warfarin to DOACs in frail elderly patients» — Eur Heart J", verificationNote: "Не в белом списке врачей: PubMed — Каталог статей, не знак качества" }];
    expect(verificationLabelFor("PARTIALLY_SUPPORTED", evidence).label).toBe("Сверены данные публикации · журнал вне списка врачей");
    expect(verificationLabelFor("PARTIALLY_SUPPORTED", [{ claim: evidence[0].claim, verificationNote: "Текст совпадает с источником не полностью" }]).label).toBe("Данные публикации совпадают частично");
  });

  it("N8-2: the review names the words of the question it did not search, and does not call the result «по вопросу»", () => {
    const run = { id: "run", agentId: "research", specialty: "cardiology", status: "completed", input: { text: "Кардиоверсия у пожилых с фибрилляцией предсердий" }, toolsUsed: [{ tool: "searchPubmed", connectorIds: ["pubmed"], modes: [], status: "ok", itemCount: 1, durationMs: 1, note: null }], plan: [], resultIds: [] } as unknown as AgentRun;
    expect(researchConditions(run).unmatched).toContain("кардиоверсия");
    const result = { id: "r1", rank: 1, partner: null, kind: "research_finding", category: "publication", title: "Atrial fibrillation in older adults", summary: "Eur Heart J · 2026", attributes: {}, evidence: [{ claim: "Опубликовано: «Atrial fibrillation in older adults» — Eur Heart J", verificationStatus: "SUPPORTED", evidenceLevel: "peer_reviewed" }], source: { source: "PubMed", connectorId: "pubmed" }, actions: [] } as unknown as Parameters<typeof buildResearchAnswer>[1][number];
    const answer = buildResearchAnswer(run, [result]);
    expect(answer.headline).toMatch(/по условиям поиска — не по всему вопросу/u);
    expect(answer.unmatched).toContain("кардиоверсия");
  });

  it("N8-3: a population word counts only in a title on the question's topic", () => {
    const terms = conceptsIn("Катетерная аблация при фибрилляции предсердий у пожилых", "cardiology").filter(concept => concept.kind === "concept").map(concept => concept.term);
    const ordered = byQuestionInTitle([
      { title: "Prevalence of heart failure in Portugal in people aged ≥50 years (PORTHOS)" },
      { title: "Pulmonary vein isolation versus sham procedure in atrial fibrillation: the PVI-SHAM-AF trial of catheter ablation" },
    ], terms, ['"atrial fibrillation"[tiab]']);
    expect(ordered[0].title).toMatch(/PVI-SHAM-AF/u);
  });

  it("N8-01 / R7-02: a review or guideline counts for a topic only when its title names it, not a narrower condition", () => {
    expect(titleNamesTopic("Human schistosomiasis", "hypertension[tiab]", specificTopicTerms("therapy"))).toBe(false);
    expect(titleNamesTopic("Recommendations for the treatment of pulmonary hypertension", "hypertension[tiab]", specificTopicTerms("therapy"))).toBe(false);
    expect(titleNamesTopic("Pulmonary arterial hypertension: 2026 update", "hypertension[tiab]", specificTopicTerms("cardiology"))).toBe(false);
    expect(titleNamesTopic("2026 guideline on the management of hypertension in adults", "hypertension[tiab]", specificTopicTerms("therapy"))).toBe(true);
  });

  it("N8-4: the review table shows the design PubMed states", () => {
    const html = renderToStaticMarkup(<ResearchResultsTable results={[{ id: "r", title: "ARISTOTLE", summary: "Eur Heart J", kind: "research_finding", category: "publication", attributes: { publicationTypes: "Journal Article, Randomized Controlled Trial" }, evidence: [], source: { source: "PubMed" }, actions: [] } as unknown as Parameters<typeof ResearchResultsTable>[0]["results"][number]]} />);
    expect(html).toContain(">РКИ<");
  });
});

describe("Round 9: every place of the review says the same, by the reason a record was marked", () => {
  it("N9-1: a catalog card lowered only for its version reads «Совпадает с источником · версию сверьте»", () => {
    const card = [{ claim: "Официальный материал РКО.", verificationNote: "Актуальность версии требует проверки" }];
    expect(verificationLabelFor("PARTIALLY_SUPPORTED", card).label).toBe("Совпадает с источником · версию сверьте");
    expect(verificationLabelFor("PARTIALLY_SUPPORTED", [{ claim: "Рекомендация", verificationNote: "Карточка составлена по документу — сверьте с полным текстом" }]).label).toMatch(/^Совпадает с источником · карточка по документу/u);
    expect(verificationLabelFor("PARTIALLY_SUPPORTED", [{ claim: "Рекомендация", verificationNote: "Утверждение совпадает с источником не полностью" }]).label).toBe("Совпадает с источником частично");
  });

  it("N8-1: the comparison, the run summary and the export count a matched citation as matched", () => {
    const citation = { claim: "Опубликовано: «Trial» — Eur Heart J", verificationStatus: "PARTIALLY_SUPPORTED" as const, verificationNote: "Не в белом списке врачей: PubMed — Каталог статей, не знак качества" };
    expect(matchedSource(citation.verificationStatus, [citation])).toBe(true);
    expect(verificationSummary([{ evidence: [citation] } as unknown as Parameters<typeof verificationSummary>[0][number]])).toBe("сверены данные публикации — 1; нужна сверка — журнал вне списка врачей: 1");
    const result = { id: "r", rank: 1, createdAt: "2026-10-23T00:00:00.000Z", title: "Trial", observedAt: "2026", attributes: {}, partner: null, kind: "research_finding", source: { publisher: "Eur Heart J", source: "PubMed", publishedAt: "2026" }, evidence: [{ ...citation, evidenceLevel: "peer_reviewed", confidence: 1 }], actions: [] } as unknown as Parameters<typeof ResearchComparison>[0]["results"][number];
    const html = renderToStaticMarkup(<ResearchComparison results={[result, { ...result, id: "r2", title: "Trial 2" }]} />);
    expect(html).toContain("Сверены данные публикации · журнал вне списка врачей");
    expect(html).not.toContain("совпадают частично");
  });

  it("N9-4: an adjective before a searched word is not a lost condition; a widened search names what it dropped", () => {
    expect(researchConditions({ input: { text: "Катетерная аблация при фибрилляции предсердий у пожилых" }, plan: [], specialty: "cardiology" } as unknown as AgentRun).unmatched).toEqual([]);
    expect(researchConditions({ input: { text: "ПОАК у пожилых с фибрилляцией предсердий" }, plan: [{ label: "Расширили поиск в PubMed до тем вопроса" }], specialty: "cardiology" } as unknown as AgentRun).unmatched).toEqual(expect.arrayContaining(["пожилые пациенты"]));
  });
});

describe("Round 10: a qualifier is lost unless the concept covers it; the export names every matched record", () => {
  it("N10-1: «пароксизмальная», «резистентная», «интенсивное снижение» are named; «катетерная» before «аблация» is not", () => {
    const unmatched = (text: string) => researchConditions({ input: { text }, plan: [], specialty: "cardiology" } as unknown as AgentRun).unmatched;
    expect(unmatched("Пароксизмальная фибрилляция предсердий")).toContain("пароксизмальная");
    expect(unmatched("Резистентная артериальная гипертензия у пожилых")).toContain("резистентная");
    expect(unmatched("Интенсивное снижение давления у пожилых").join(" ")).toMatch(/интенсивное снижение/u);
    expect(unmatched("Катетерная аблация при фибрилляции предсердий у пожилых")).toEqual([]);
  });

  it("N8-1: every matched record is «used in the synthesis», whatever check it still needs", () => {
    const record = (id: string, note: string | null) => ({ id, rank: Number(id.slice(1)), createdAt: "2026-10-23T00:00:00.000Z", evidence: [{ claim: `Опубликовано: «${id}» — J`, verificationStatus: note ? "PARTIALLY_SUPPORTED" : "SUPPORTED", verificationNote: note }] });
    const results = [record("r1", null), record("r2", "Не в белом списке врачей: PubMed"), record("r3", "Актуальность версии требует проверки"), record("r4", null), record("r5", "Не в белом списке врачей: PubMed"), record("r6", null)] as unknown as Parameters<typeof researchSourceBuckets>[0];
    const buckets = researchSourceBuckets(results, "brief");
    expect(buckets.used).toHaveLength(6);
    expect(buckets.additional).toHaveLength(0);
  });
});

describe("Round 10 (IA): the export and the trace repeat the labels; a partial date is not a mismatch", () => {
  it("N10-03: «Дата указана не полностью» is a check, not «частично»", () => {
    expect(verificationLabelFor("PARTIALLY_SUPPORTED", [{ claim: "ESC 2026", verificationNote: "Вторичный источник; сверьте в первоисточнике: ESC. Дата указана не полностью" }]).label).toBe("Совпадает с источником · сверьте в первоисточнике · дата указана не полностью");
  });

  it("N10-01: each exported record carries its on-screen check; catalog cards from one page stay separate", () => {
    const card = (id: string, title: string) => ({ id, rank: Number(id.slice(1)), createdAt: "2026-10-23T00:00:00.000Z", title, summary: "Рекомендации РКО", attributes: {}, source: { source: "Рекомендации РКО", sourceUrl: "https://scardio.ru/rekomendacii/rekomendacii_rko", retrievedAt: "2026-10-23T00:00:00.000Z" }, evidence: [{ claim: "Официальный материал РКО.", verificationStatus: "PARTIALLY_SUPPORTED", verificationNote: "Актуальность версии требует проверки" }] });
    const run = { id: "run", specialty: "cardiology", plan: [], toolsUsed: [], input: { text: "ПОАК у пожилых" }, synthesis: null, completedAt: "2026-10-23T00:00:00.000Z", startedAt: "2026-10-23T00:00:00.000Z" } as unknown as AgentRun;
    const text = buildResearchExport({ run, results: [card("r1", "Фибрилляция и трепетание предсердий"), card("r2", "Контроль безопасности антикоагулянтной терапии при ФП")] as unknown as Parameters<typeof buildResearchExport>[0]["results"], mode: "articles", citationStyle: "gost", bibliographyOrder: "appearance", includeBibliography: true, format: "markdown" });
    expect(text).toContain("Проверка: Совпадает с источником · версию сверьте");
    expect(text).toContain("Фибрилляция и трепетание предсердий");
    expect(text.match(/Контроль безопасности антикоагулянтной терапии при ФП/gu)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Round 11: no part of the question is lost silently", () => {
  const unmatched = (text: string, skipped = false) => researchConditions({ input: { text }, plan: [], toolsUsed: skipped ? [{ tool: "searchPubmed", note: "PubMed пропущен: выбран поиск только по источникам РФ" }] : [], specialty: "cardiology" } as unknown as AgentRun);
  it("N11-1: words beside an abbreviated disease name are their own condition; unknown capitals are named", () => {
    expect(unmatched("Сердечная недостаточность с сохранённой фракцией выброса у пожилых").unmatched).toContain("сохранённой фракцией выброса");
    expect(unmatched("Острая сердечная недостаточность у пожилых").unmatched).toContain("острая");
    expect(unmatched("ИКД при ХСН у пожилых").unmatched).toContain("ИКД");
    expect(unmatched("Хроническая сердечная недостаточность у пожилых").unmatched).toEqual([]);
    expect(unmatchedWords("Апиксабан у пожилых с фибрилляцией предсердий и сниженной функцией почек. Уточнение: А при ХБП?", ["фибрилляция предсердий", "кардиоренальные связи", "антикоагулянты", "пожилые пациенты", "апиксабан", "безопасность"], "cardiology")).toEqual([]);
  });
  it("N11-2: a negated key («неклапанная», «неишемическая») does not bring the opposite topic", () => {
    expect(unmatched("Неклапанная фибрилляция предсердий и антикоагулянты").conditions).not.toContain("клапанные пороки");
    expect(unmatched("Клапанная фибрилляция предсердий и антикоагулянты").conditions).toContain("клапанные пороки");
    expect(unmatched("Неишемическая кардиомиопатия и ИКД").conditions).not.toContain("ИБС");
    expect(unmatched("Дислипидемия у пожилых").conditions).toContain("липидология");
  });
  it("N11-3: a skipped PubMed names the concepts it did not search", () => {
    const skipped = unmatched("Катетерная аблация при фибрилляции предсердий у пожилых", true);
    expect(skipped.conditions).toEqual(["фибрилляция предсердий"]);
    // Named as written: «аблация» (N23, the concept name is not the physician's word).
    expect(skipped.unmatched).toEqual(expect.arrayContaining(["катетерная аблация", "пожилые пациенты"]));
    expect(unmatched("Катетерная аблация при фибрилляции предсердий у пожилых").unmatched).toEqual([]);
  });
});

describe("Round 12: the review names what its own search did not use; hyphenated keys match", () => {
  const rc = (text: string) => researchConditions({ input: { text }, plan: [], toolsUsed: [], specialty: "cardiology" } as unknown as AgentRun);
  it("N12-1: a drug the portal knows but the review did not search is named", () => {
    expect(rc("Бисопролол при ХСН у пожилых").unmatched).toContain("бисопролол");
    expect(rc("Амиодарон при фибрилляции предсердий у пожилых").unmatched).toContain("амиодарон");
    expect(rc("СНсФВ у пожилых")).toEqual({ conditions: ["ХСН", "пожилые пациенты"], unmatched: ["СНсФВ"] });
    expect(rc("Хроническая СН у пожилых").unmatched).toEqual([]);
    expect(rc("ПОАК у пожилых с фибрилляцией предсердий").unmatched).toEqual([]);
    expect(rc("Катетерная аблация при фибрилляции предсердий у пожилых").unmatched).toEqual([]);
  });
  it("N12-2: «сердечно-сосудистый риск» and «SCORE2» find the prevention topic again", () => {
    expect(rc("Сердечно-сосудистый риск у пожилых").conditions).toContain("профилактика");
    expect(rc("Шкала SCORE2 у пожилых")).toEqual({ conditions: ["профилактика", "пожилые пациенты"], unmatched: [] });
  });
  it("N12-5: stop words typed in capitals are not «не учтено»", () => {
    expect(rc("Катетерная аблация при ФП у пожилых: ЧТО НОВОГО?").unmatched).toEqual([]);
  });
});

describe("Round 12 (IA): no dead topic key in any specialty", () => {
  it("N12-01: every keyword of every topic, written in a sentence, finds its topic", () => {
    const dead: string[] = [];
    for (const [specialty, topics] of Object.entries(TOPICS)) for (const topic of topics) for (const keyword of topic.keywords) {
      // A keyword is a stem («сердечно-сосудист»): the sentence uses it as the start of a word, as a physician would type it.
      const text = `Вопрос про ${keyword}ый у пожилых`;
      if (!topicsMentioned(specialty as Parameters<typeof topicsMentioned>[0], text).includes(topic.id) && !topicsMentioned(specialty as Parameters<typeof topicsMentioned>[0], `Вопрос про ${keyword} у пожилых`).includes(topic.id)) dead.push(`${specialty}:${topic.id}:${keyword}`);
    }
    expect(dead).toEqual([]);
  });
});

describe("Round 13: phenotype forms are named; «лёгочных вен» is not pulmonary hypertension; multi-word keys are used", () => {
  const rc = (text: string) => researchConditions({ input: { text }, plan: [], toolsUsed: [], specialty: "cardiology" } as unknown as AgentRun);
  it("N13-1: every written form of an HF phenotype finds ХСН and is named in its own case", () => {
    for (const form of ["СНсФВ", "ХСНсФВ", "ХСНунФВ", "СНнФВ", "ХСНнФВ"]) expect(rc(`${form} у пожилых`)).toEqual({ conditions: ["ХСН", "пожилые пациенты"], unmatched: [form] });
  });
  it("N13-2: «лёгочных вен», «лёгочной артерии», «сердечно-лёгочная» do not bring «Лёгочная гипертензия»", () => {
    expect(topicsMentioned("cardiology", "Изоляция лёгочных вен при ФП у пожилых")).not.toContain("ph");
    expect(topicsMentioned("cardiology", "Тромбоэмболия лёгочной артерии у пожилых")).not.toContain("ph");
    expect(topicsMentioned("cardiology", "Сердечно-лёгочная реанимация у пожилых")).not.toContain("ph");
    expect(topicsMentioned("cardiology", "Лёгочная гипертензия у пожилых")).toContain("ph");
  });
  it("N13-3: the words of a multi-word key or concept are used, not «не учтено»", () => {
    for (const question of ["Искусственный интеллект в кардиологии", "Антагонисты минералокортикоидных рецепторов при ХСН", "Аортальный стеноз у пожилых", "Инфаркт миокарда у пожилых", "Изоляция лёгочных вен при ФП у пожилых"]) expect(rc(question).unmatched).toEqual([]);
  });
});

describe("Round 13 (after): a narrower multi-word topic is not also the broader one", () => {
  it("«лёгочная гипертензия» is pulmonary hypertension, not arterial hypertension, in every specialty", () => {
    expect(topicsMentioned("cardiology", "Лёгочная гипертензия у пожилых")).toEqual(["ph"]);
    expect(topicsMentioned("therapy", "Лёгочная гипертензия у пожилых")).not.toContain("ah");
    expect(topicsMentioned("cardiology", "Лёгочная гипертензия и артериальная гипертензия")).toEqual(expect.arrayContaining(["ah", "ph"]));
    expect(topicsMentioned("cardiology", "Артериальная гипертензия у пожилых")).toEqual(["ah"]);
  });
});

describe("Round 14: the diabetes type is searched or named; written-out forms of PH are PH", () => {
  const rc = (text: string, specialty = "cardiology") => researchConditions({ input: { text }, plan: [], toolsUsed: [], specialty } as unknown as AgentRun);
  it("N14-1: «1 типа» is searched as type 1 diabetes, never lost and never type 2", () => {
    expect(rc("Статины при сахарном диабете 1 типа").conditions).toContain("сахарный диабет 1 типа");
    expect(pubmedConceptsIn("Статины при сахарном диабете 1 типа").map(concept => concept.term)).toContain('"type 1 diabetes"[tiab]');
    expect(rc("Сахарный диабет 1 типа у пожилых", "therapy").conditions).not.toContain("сахарный диабет 2 типа");
    expect(rc("СД у пожилых с ХСН").conditions).toContain("сахарный диабет");
  });
  it("N14-2: «лёгочная артериальная гипертензия» and «лёгочная гипертония» are PH, not АГ", () => {
    expect(rc("Лёгочная артериальная гипертензия у пожилых").conditions).toEqual(["лёгочная гипертензия", "пожилые пациенты"]);
    expect(rc("Лёгочная гипертония у пожилых").conditions).toEqual(["лёгочная гипертензия", "пожилые пациенты"]);
    expect(rc("Лёгочная гипертензия у пожилых", "therapy").unmatched).toContain("лёгочная гипертензия");
  });
  it("N14-5: a hyphenated word is named", () => {
    expect(rc("Сердечно-лёгочная реанимация у пожилых").unmatched).toContain("сердечно-лёгочная реанимация");
  });
  it("N14-01 (B): hyphenated drugs, tests and phenotypes are named; understood compound terms are not", () => {
    expect(rc("Бета-блокаторы при ФП")).toEqual({ conditions: ["фибрилляция предсердий"], unmatched: ["бета-блокаторы"] });
    expect(rc("Бета-блокаторы при ХСН у пожилых").unmatched).toEqual(["бета-блокаторы"]);
    expect(rc("Д-димер при ФП").unmatched).toEqual(["Д-димер"]);
    expect(rc("Стресс-ЭхоКГ при ИБС").unmatched).toEqual(["стресс-ЭхоКГ"]);
    expect(rc("ХСН-сФВ у пожилых")).toEqual({ conditions: ["ХСН", "пожилые пациенты"], unmatched: ["ХСН-сФВ"] });
    expect(rc("Сердечно-сосудистый риск у пожилых", "therapy").unmatched).toEqual(["сердечно-сосудистый"]);
    expect(rc("Сердечно-сосудистый риск при СД2", "endocrinology").unmatched).toEqual(["сердечно-сосудистый"]);
    expect(rc("Сердечно-сосудистый риск у пожилых").unmatched).toEqual([]);
    expect(rc("иНГЛТ-2 при ХСН").unmatched).toEqual([]);
  });
  it("N14-03/N14-04 (B): only the matched key and the words of the name next to each other are used", () => {
    expect(rc("Митральная регургитация и стеноз сонных артерий").unmatched).toEqual(["регургитация", "стеноз сонных артерий"]);
    expect(rc("Гипертрофия миокарда при АГ").unmatched).toEqual(["гипертрофия миокарда"]);
    expect(rc("Дыхательная недостаточность при ХСН").unmatched).toEqual(["дыхательная недостаточность"]);
    expect(rc("Хроническая сердечная недостаточность у пожилых").unmatched).toEqual([]);
    expect(rc("Сердечной недостаточностью у пожилых").unmatched).toEqual([]);
    expect(rc("Лёгочная артериальная гипертензия: риоцигуат", "therapy").unmatched).toEqual(["лёгочная артериальная гипертензия", "риоцигуат"]);
  });
  it("B: with nothing found the screen still says what was searched and what was not", () => {
    const answer = buildResearchAnswer({ input: { text: "СНнФВ у пожилых" }, plan: [], toolsUsed: [], specialty: "cardiology" } as unknown as AgentRun, []);
    expect(answer.kind).toBe("not_found");
    expect(answer).toMatchObject({ conditions: ["ХСН", "пожилые пациенты"], unmatched: ["СНнФВ"] });
    const html = renderToStaticMarkup(<ResearchAnswerView run={{ input: { text: "СНнФВ у пожилых" }, plan: [], toolsUsed: [], specialty: "cardiology" } as unknown as AgentRun} results={[]} />);
    expect(html).toMatch(/Искали\sпо:\sХСН\s·\sпожилые\sпациенты\.\sНе\sучтено\sв\sпоиске:\s«СНнФВ»\.</u);
    expect(html).not.toContain("по найденным работам");
  });
  it("N13-04 rest (B): «АД» is arterial hypertension in therapy too", () => {
    expect(rc("Целевое АД у пожилых", "therapy")).toEqual({ conditions: ["артериальная гипертензия", "пожилые пациенты"], unmatched: ["целевое"] });
  });
});

describe("Round 15: every written form of a word is a question word; what the review searched is what it says", () => {
  const ok = { tool: "searchPubmed", connectorIds: ["pubmed"], modes: [], status: "ok", itemCount: 3, durationMs: 1, note: null };
  const skipped = { ...ok, itemCount: 0, note: "PubMed пропущен: выбраны только источники РФ" };
  const down = { ...ok, status: "unavailable", itemCount: 0 };
  const rc = (text: string, use: unknown = ok, specialty = "cardiology") => researchConditions({ input: { text }, plan: [], toolsUsed: [use], specialty } as unknown as AgentRun);
  it("N15-01: Greek, digits and Latin are named when the search did not use them", () => {
    for (const use of [ok, skipped, down]) {
      expect(rc("β-блокаторы при ФП", use).unmatched).toEqual(["β-блокаторы"]);
      expect(rc("Омега-3 при ИБС", use).unmatched).toEqual(["омега-3"]);
      expect(rc("ИЛ-6 при ИБС", use).unmatched).toEqual(["ИЛ-6"]);
      expect(rc("Тропонин-I при ИБС", use).unmatched).toEqual(["тропонин-I"]);
      expect(rc("Ковид-19 и миокардит", use).unmatched).toContain("ковид-19");
    }
    expect(rc("арГПП-1 при ХСН").conditions).toContain("ГПП-1");
    expect(rc("Ингибиторы ПЦСК9 при ИБС").unmatched).toEqual([]);
    // Latin words are searched as typed only by PubMed.
    expect(rc("Dapagliflozin при ХСН").unmatched).toEqual([]);
    expect(rc("NT-proBNP при ХСН").unmatched).toEqual([]);
    expect(rc("Dapagliflozin при ХСН", skipped).unmatched).toEqual(["Dapagliflozin"]);
    expect(rc("NT-proBNP при ХСН", down).unmatched).toEqual(["NT-proBNP"]);
    expect(rc("иНГЛТ-2 при ХСН").unmatched).toEqual([]);
    expect(rc("SCORE2 у пожилых").unmatched).toEqual([]);
  });
  it("N15-02: words the search understands are not named", () => {
    expect(rc("Сердечно-сосудистая профилактика у пожилых").unmatched).toEqual([]);
    expect(rc("Хроническая болезнь почек при ХСН").unmatched).toEqual([]);
    expect(rc("Хроническая болезнь почек при АГ", skipped, "therapy")).toEqual({ conditions: ["артериальная гипертензия", "хроническая болезнь почек"], unmatched: [] });
    expect(rc("Хроническая болезнь почек при АГ", ok, "therapy").conditions).toEqual(["артериальная гипертензия", "хроническая болезнь почек"]);
    expect(rc("Ишемическая болезнь сердца у пожилых").unmatched).toEqual([]);
    expect(rc("Гипертоническая болезнь у пожилых", ok, "therapy").unmatched).toEqual([]);
  });
  it("N15-03: «2» and «тип» alone are not type 2 diabetes", () => {
    expect(topicsMentioned("therapy", "АВ-блокада 2 степени: тип Мобиц")).toEqual([]);
    expect(topicsMentioned("therapy", "Пациенты 72 лет: тип телосложения")).toEqual([]);
    expect(topicsMentioned("therapy", "Сахарный диабет 2 типа у пожилых")).toContain("dm2");
  });
  it("N15-04: a named concept is not repeated, and a concept cut by the query limit is named", () => {
    expect(rc("Контроль АД при СД 2 типа", skipped).unmatched).toEqual(["сахарный диабет 2 типа", "контроль"]);
    expect(rc("иАПФ или БРА при АГ с сахарным диабетом", skipped, "therapy").unmatched).toEqual(["сахарный диабет", "иАПФ", "БРА"]);
    expect(rc("Пожилые с СД 2 типа, ХБП, ожирением на иНГЛТ-2 и статинах").unmatched).toContain("сахарный диабет 2 типа");
  });
  it("IA-3 (B, round 15): with PubMed down and nothing in the catalog, the screen still says by what the catalog was searched", () => {
    const answer = buildResearchAnswer({ input: { text: "Бета-блокаторы при ФП" }, plan: [], toolsUsed: [down], specialty: "cardiology", status: "done", riskNotices: [] } as unknown as AgentRun, []);
    expect(answer.kind).toBe("unavailable");
    expect(answer).toMatchObject({ conditions: ["фибрилляция предсердий"], unmatched: ["бета-блокаторы"] });
  });
  it("N15-05: abbreviations keep their case; numbers and service words split phrases", () => {
    expect(rc("КТ-ангиография при стабильной стенокардии").unmatched).toEqual(["КТ-ангиография", "стабильной"]);
    expect(rc("АВ-блокада 2 степени: тип Мобиц", ok, "therapy").unmatched).toEqual(["АВ-блокада 2 степени", "мобиц"]);
  });
});

describe("Round 15 (A): understood words are never «не учтено»; ЛАГ is not АГ on the home answer", () => {
  const home = (question: string, specialty = "cardiology") => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return { conditions, unmatched: unmatchedWords(question, conditions, specialty as never) };
  };
  const rc = (text: string, plan: unknown[] = []) => researchConditions({ input: { text }, plan, toolsUsed: [{ tool: "searchPubmed", status: "ok", note: null }], specialty: "cardiology" } as unknown as AgentRun);
  it("N15-1: a word differing from a condition only by suffix is used; a different word sharing six letters is not", () => {
    for (const question of ["Эмпаглифлозин при ХСН: дозировка", "Дозировки бисопролола при ХСН", "Безопасен ли апиксабан у пожилых", "Критерии диагноза ХСН"]) expect(home(question).unmatched).toEqual([]);
    expect(rc("Дапаглифлозин при хронической болезни почек")).toEqual({ conditions: ["иНГЛТ-2", "ХБП"], unmatched: [] });
    expect(rc("Бета-блокаторы при ХСН").unmatched).toEqual(["бета-блокаторы"]);
    expect(rc("Гипертрофия миокарда при АГ").unmatched).toEqual(["гипертрофия миокарда"]);
    expect(home("Апиксабан у пожилых со сниженной функцией почек").unmatched).toEqual(["сниженной функцией почек"]);
  });
  it("N14-2 rest: the home answer does not take «лёгочная артериальная гипертензия» for arterial hypertension", () => {
    expect(detectDomain("Лёгочная артериальная гипертензия у пожилых", "cardiology").nosology).toBeNull();
    expect(detectDomain("Артериальная гипертензия у пожилых", "cardiology").nosology?.id).toBe("cardiology/arterial_hypertension");
    expect(home("Лёгочная артериальная гипертензия у пожилых")).toEqual({ conditions: ["лёгочная гипертензия", "пожилые пациенты"], unmatched: [] });
  });
  it("N15-2: a phenotype the search narrowed to and the words of a searched term are used", () => {
    expect(home("Эмпаглифлозин при ХСН-сФВ").unmatched).toEqual([]);
    expect(home("Сердечно-сосудистый риск у пожилых").unmatched).toEqual([]);
    expect(home("Сердечно-сосудистые заболевания и ХБП").unmatched).toEqual([]);
  });
  it("N15-3: a widened search names the dropped concepts once, without fragments", () => {
    expect(rc("Статины при сахарном диабете 1 типа", [{ label: "Расширили поиск в PubMed до тем вопроса" }]).unmatched).toEqual(["статины", "сахарный диабет 1 типа"]);
  });
  it("N15-4: no unused phrase is cut silently", () => {
    expect(rc("Бисопролол, карведилол или небиволол при ХСН, ФП и ХОБЛ: что безопаснее?").unmatched).toContain("безопаснее");
  });
  it("N15-7: «АД» next to «атопический» is not arterial hypertension", () => {
    expect(home("Атопический дерматит (АД) у детей: эмоленты", "pediatrics").conditions).not.toContain("артериальная гипертензия");
    expect(topicsMentioned("cardiology", "Целевое АД у пожилых")).toContain("ah");
  });
  it("N15-6: sources excluded in the profile are named as the reason no search ran", () => {
    const step = { id: "step-3", label: "Поиск не выполнялся", tool: null, status: "skipped", detail: "Подходящие источники исключены в вашем профиле: PubMed. Включите их, чтобы проверить", connectorIds: [] };
    const outcome = runOutcome({ status: "done", plan: [step], toolsUsed: [], resultIds: [], experience: null, error: null } as never);
    expect(outcome.kind).toBe("not_run");
    expect(outcome.note).toMatch(/исключены в вашем профиле: PubMed/u);
    expect(outcome.note).not.toMatch(/не распознаны/u);
  });
});

describe("Round 16: a word counts as used only when the search used it", () => {
  const home = (question: string, specialty = "cardiology") => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return { conditions, unmatched: unmatchedWords(question, conditions, specialty as never) };
  };
  const ok = { tool: "searchPubmed", status: "ok", note: null };
  const skipped = { tool: "searchPubmed", status: "ok", note: "PubMed пропущен" };
  const rc = (text: string, use: unknown = ok) => researchConditions({ input: { text }, plan: [], toolsUsed: [use], specialty: "cardiology" } as unknown as AgentRun);
  it("N16-1 (A): only the phenotype the search narrowed to is used; the other is named", () => {
    expect(home("СНсФВ и СНнФВ: различия в лечении").unmatched).toEqual(["СНнФВ", "различия"]);
    expect(home("ХСН-сФВ или ХСН-нФВ: дапаглифлозин").unmatched).toEqual(["ХСН-нФВ"]);
    expect(home("Эмпаглифлозин при ХСН-сФВ").unmatched).toEqual([]);
    expect(home("СНсФВ у пожилых: дапаглифлозин").unmatched).toEqual([]);
  });
  it("N16-2 (A): words of a drug-instruction section the search used are used", () => {
    for (const question of ["Амиодарон: побочные эффекты", "Апиксабан: доза при ХБП", "Аторвастатин: дозы", "Бисопролол: доза у пожилых", "Профилактические дозы эноксапарина", "Амиодарон: нежелательные явления", "Апиксабан: побочное действие"]) expect(home(question).unmatched).toEqual([]);
    expect(home("Острая сердечная недостаточность: диуретики").unmatched).toEqual(["диуретики"]);
    expect(home("Бета-блокаторы при ХСН").unmatched).toEqual(["бета-блокаторы"]);
    // On the review, where no section was searched, the same words are named.
    expect(rc("Профиль безопасности статинов при ИБС").unmatched).toEqual(["профиль безопасности"]);
  });
  it("N16-01 (B) / N16-5 (A): a different word sharing a short stem is not covered", () => {
    expect(rc("Гипертензия в лёгочной артерии").unmatched).toEqual(["артерии"]);
    expect(rc("Стеноз почечной артерии при АГ").unmatched).toEqual(["стеноз", "артерии"]);
    expect(rc("Контроль АД на фоне контрацепции").unmatched).toContain("контроль");
    expect(rc("Тромбоз артерии при АГ").unmatched).toEqual(["тромбоз артерии"]);
    expect(home("Эмпаглифлозин при ХСН: дозировка").unmatched).toEqual([]);
    expect(home("Безопасен ли апиксабан у пожилых").unmatched).toEqual([]);
  });
  it("N16-4 (A): «ХБП» is not hidden behind the compound topic «Кардиоренальные связи»", () => {
    expect(rc("Апиксабан у пожилых с ФП и ХБП").conditions).toContain("ХБП");
    expect(researchConditions({ input: { text: "Хроническая болезнь почек при АГ" }, plan: [], toolsUsed: [ok], specialty: "therapy" } as unknown as AgentRun).conditions).toEqual(["артериальная гипертензия", "хроническая болезнь почек"]);
  });
  it("N16-5 (A) / N16-02, N16-03 (B): a number stays with its word; a short Latin word not in the query is named", () => {
    expect(rc("Инфаркт миокарда 2 типа").unmatched).toEqual(["2 типа"]);
    expect(rc("Витамин D при ХСН").unmatched).toEqual(["витамин D"]);
    expect(rc("Lp(a) при ИБС").unmatched).toEqual([]);
    expect(rc("Lp(a) при ИБС", skipped).unmatched).toEqual(["Lp(a)"]);
    expect(rc("Профилактика инсульта у пациентов с сердечно-сосудистыми заболеваниями").unmatched).toEqual([]);
  });
  it("N16-3 (A): sources excluded in the profile are the one reason, without a request to name a disease", () => {
    const step = { id: "step-3", label: "Поиск не выполнялся", tool: null, status: "skipped", detail: "Подходящие источники исключены в вашем профиле: PubMed. Включите их, чтобы проверить", connectorIds: [] };
    expect(runOutcome({ status: "done", plan: [step], toolsUsed: [], resultIds: [], experience: null, error: null } as never).note).toMatch(/^Подходящие источники исключены в вашем профиле: PubMed/u);
  });
});

describe("Round 17: compounds, sections and short Latin as the search used them", () => {
  const home = (question: string, specialty = "cardiology") => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return { conditions, unmatched: unmatchedWords(question, conditions, specialty as never) };
  };
  const ok = { tool: "searchPubmed", status: "ok", note: null };
  const skipped = { tool: "searchPubmed", status: "ok", note: "PubMed пропущен" };
  const rc = (text: string, use: unknown = ok) => researchConditions({ input: { text }, plan: [], toolsUsed: [use], specialty: "cardiology" } as unknown as AgentRun);
  it("N17-01 (B) / N17-2 (A): a compound of a searched word and the parts of a searched concept are used", () => {
    expect(home("Длительность антибиотикотерапии при внебольничной пневмонии", "therapy").unmatched).toEqual([]);
    expect(home("Антибиотикотерапия внебольничной пневмонии у детей", "pediatrics").unmatched).toEqual([]);
    expect(home("Lp(a) при ИБС").unmatched).toEqual([]);
    expect(home("ХСН NYHA II–III: дапаглифлозин").unmatched).toEqual([]);
    expect(home("Витамин D при ХСН").unmatched).toEqual(["витамин D"]);
    // Insulin therapy is a searched concept since N21-05.
    expect(home("Инсулинотерапия при СД 2 типа", "endocrinology").unmatched).toEqual([]);
    expect(rc("Тромбоз артерии при АГ").unmatched).toEqual(["тромбоз артерии"]);
    for (const specialty of Object.keys(SUGGESTIONS) as Array<keyof typeof SUGGESTIONS>) for (const question of SUGGESTIONS[specialty]) {
      const { conditions, unmatched } = home(question, specialty);
      // No named word repeats a word of the conditions.
      for (const phrase of unmatched) expect(conditions.join(" ").toLocaleLowerCase("ru-RU")).not.toContain(phrase.toLocaleLowerCase("ru-RU"));
    }
  });
  it("N17-1 (A): a section noun belongs only to the section word right before it", () => {
    for (const question of ["Апиксабан: безопасность и эффективность у пожилых", "Безопасность и эффективность финеренона", "Аторвастатин: доза и эффективность"]) expect(home(question).unmatched).toEqual(["эффективность"]);
    for (const question of ["Амиодарон: побочные эффекты", "Амиодарон: нежелательные явления", "Апиксабан: побочное действие"]) expect(home(question).unmatched).toEqual([]);
  });
  it("N17-02 (B): Latin the PubMed query took is used; English service words are not conditions", () => {
    expect(rc("QT interval при ФП").unmatched).toEqual([]);
    expect(rc("NYHA II при ХСН").unmatched).toEqual([]);
    expect(rc("Депрессия сегмента ST при ИБС").unmatched).toEqual(["депрессия сегмента"]);
    expect(rc("QT interval при ФП", skipped).unmatched).toEqual(["QT interval"]);
    expect(home("Beta blockers in heart failure").unmatched).toEqual([]);
  });
  it("N17-03 (B): without PubMed a concept whose words chose the topic is used; with PubMed it is shown once", () => {
    expect(rc("Искусственный интеллект в кардиологии", skipped)).toEqual({ conditions: ["ИИ в кардиологии"], unmatched: [] });
    expect(rc("ИИ в кардиологии").conditions).toEqual(["ИИ в кардиологии"]);
    expect(rc("Инфаркт миокарда и миокардит", skipped).unmatched).toEqual([]);
    expect(rc("ХБП при АГ", skipped).unmatched).toEqual([]);
    expect(rc("Апиксабан у пожилых с ФП и ХБП").conditions).toContain("ХБП");
  });
  it("N17-3 (A) / N17-04 (B): numbers keep their fraction, range and unit; a lone dash separates", () => {
    expect(home("Целевой ЛПНП ниже 1,4 ммоль/л").unmatched).toContain("целевой ЛПНП ниже 1,4 ммоль/л");
    expect(home("Лихорадка у младенцев 8–60 дней", "pediatrics").unmatched).toEqual(["8–60 дней"]);
    expect(rc("Омега 3 при ИБС").unmatched).toEqual(["омега 3"]);
    expect(rc("ИЛ 6 при ИБС").unmatched).toEqual(["ИЛ 6"]);
    expect(rc("ФП - кардиоверсия").unmatched).toEqual(["кардиоверсия"]);
  });
  it("N17-4 (A): abbreviations keep their case in «Искали по» and «Не учтено» alike", () => {
    expect(rc("Дапаглифлозин при хронической болезни почек", skipped).unmatched).toEqual(["дапаглифлозин", "хронической болезни почек"]);
    expect(home("Эмпаглифлозин при ХСН: дозировка").conditions).toContain("иНГЛТ-2");
  });
});

describe("Round 18: each path counts the Latin its own query took; compounds only of «-терапия»; clinical «события» are a question", () => {
  // As the home answer's SearchConditions does: the home query's Latin, and only when PubMed ran.
  const home = (question: string, specialty = "cardiology", pubmedRan = true) => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return { conditions, unmatched: unmatchedWords(question, conditions, specialty as never, undefined, { latinSearched: pubmedRan, latinQueried: new Set(latinTermsIn(question)) }) };
  };
  const ok = { tool: "searchPubmed", status: "ok", note: null };
  const skipped = { tool: "searchPubmed", status: "ok", note: "PubMed пропущен" };
  const rc = (text: string, use: unknown = ok, specialty = "cardiology") => researchConditions({ input: { text }, plan: [], toolsUsed: [use], specialty } as unknown as AgentRun);
  it("N18-1 (A) / N18-01 (B): the home answer names short Latin its query did not take", () => {
    for (const pubmedRan of [true, false]) {
      expect(home("Удлинение QT при ФП", "cardiology", pubmedRan).unmatched).toEqual(["удлинение QT"]);
      expect(home("Фактор Xa при ФП", "cardiology", pubmedRan).unmatched).toEqual(["фактор Xa"]);
      expect(home("AF у пожилых", "cardiology", pubmedRan).unmatched).toEqual(["AF"]);
      expect(home("Витамин D3 при ХСН", "cardiology", pubmedRan).unmatched).toEqual(["витамин D3"]);
      expect(home("Депрессия сегмента ST при ИБС", "cardiology", pubmedRan).unmatched).toEqual(["депрессия сегмента ST"]);
    }
    expect(home("ХСН NYHA II–III: дапаглифлозин").unmatched).toEqual(["NYHA II"]);
    expect(home("Beta blockers in heart failure").unmatched).toEqual([]);
    expect(home("Lp(a) при ИБС").unmatched).toEqual([]);
    // The review's query takes «QT», «ST».
    expect(rc("Депрессия сегмента ST при ИБС").unmatched).toEqual(["депрессия сегмента"]);
  });
  it("N18-2 (A) / N18-02 (B): only «-терапия» compounds a searched word; hyphenated words are not compounds", () => {
    expect(home("Длительность антибиотикотерапии при внебольничной пневмонии", "therapy").unmatched).toEqual([]);
    expect(home("Антибиотикорезистентность при внебольничной пневмонии", "therapy").unmatched).toEqual(["антибиотикорезистентность"]);
    expect(home("Антибиотикопрофилактика инфекционного эндокардита", "therapy").unmatched).toEqual(["антибиотикопрофилактика"]);
    expect(home("Сердечно-сосудистый риск при ХСН", "therapy").unmatched).toEqual(["сердечно-сосудистый"]);
  });
  it("N18-3 (A): «сердечно-сосудистые события» is a clinical question, not the events listing", () => {
    for (const question of ["Сердечно-сосудистые события при ХСН", "Большие сердечно-сосудистые события при СД 2 типа", "Риск сердечно-сосудистых событий у пожилых", "Неблагоприятные сердечно-сосудистые события после ЧКВ"]) expect(compileIntent(question, "cardiology").job.primary).not.toBe("event_search");
    expect(compileIntent("Конференции по ХСН", "cardiology").job.primary).toBe("event_search");
  });
  it("N18-4 (A) / N18-03 (B): a value after a searched term is named with it; ordinals stay whole", () => {
    expect(home("ЛПНП 3,0 ммоль/л у пожилых").unmatched).toEqual(["ЛПНП 3,0 ммоль/л"]);
    expect(home("Апиксабан 2,5 мг при ХБП").unmatched).toEqual(["апиксабан 2,5 мг"]);
    expect(rc("СД 2-го типа у пожилых").unmatched).toEqual([]);
    expect(rc("АВ-блокада 2-й степени").unmatched).toEqual(["АВ-блокада 2-й степени"]);
  });
  it("N18-5, N18-6 (A), N18-04…N18-06 (B): «A» is a word; «предупреждение инсульта» is not a section; a broader topic does not hide a concept", () => {
    expect(rc("Расслоение аорты типа A").unmatched.join(" ")).toContain("A");
    expect(home("Предупреждение инсульта при ФП: апиксабан").unmatched).toEqual(["предупреждение"]);
    expect(rc("Антикоагулянты при ТЭЛА", skipped).unmatched).toContain("антикоагулянты");
    expect(rc("ХБП при АГ", skipped).unmatched).toEqual([]);
    // N18-05 (B): the home query takes «эдоксабан» through «антикоагулянты» (edoxaban[tiab]), so it is used.
    expect(home("Апиксабан, ривароксабан, дабигатран или эдоксабан у пожилых с ФП").unmatched).not.toContain("эдоксабан");
  });
});

describe("Round 19: «события» are the listing only with a listing cue; numbers, sections and Latin as searched", () => {
  const home = (question: string, specialty = "cardiology", pubmedRan = true) => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return { conditions, unmatched: unmatchedWords(question, conditions, specialty as never, undefined, { latinSearched: pubmedRan, latinQueried: new Set(latinTermsIn(question)) }) };
  };
  const ok = { tool: "searchPubmed", status: "ok", note: null };
  const skipped = { tool: "searchPubmed", status: "ok", note: "PubMed пропущен" };
  const rc = (text: string, use: unknown = ok, specialty = "cardiology") => researchConditions({ input: { text }, plan: [], toolsUsed: [use], specialty } as unknown as AgentRun);
  it("N19-1 (A) / N19-01 (B): clinical «события» are a question; a listing cue leads to the listing", () => {
    for (const [question, specialty] of [["Нежелательные события при приёме апиксабана", "cardiology"], ["Цереброваскулярные события при ФП", "cardiology"], ["Сердечно-сосудистые и почечные события при СД 2 типа", "endocrinology"], ["Кардиальные события у пожилых", "cardiology"], ["Аритмические события при ХСН", "cardiology"], ["Частота событий при ХСН", "cardiology"], ["Серьёзные нежелательные события при терапии статинами", "cardiology"]] as const) expect(compileIntent(question, specialty).job.primary).not.toBe("event_search");
    for (const question of ["Конференции по ХСН", "Мероприятия по ХСН", "События по кардиологии в ноябре", "Ближайшие события РКО", "Какие события по ХСН в этом месяце", "Главные события ESC 2026", "Большие события в кардиологии в 2026 году"]) expect(compileIntent(question, "cardiology").job.primary).toBe("event_search");
  });
  it("N19-4 (A) / N19-03, N19-04 (B): numbers the search used are used; a number goes with its lead word, not across punctuation", () => {
    expect(home("Сахарный диабет 1 и 2 типа: статины", "therapy").unmatched).toEqual([]);
    expect(home("Статины после 75 лет").unmatched).toEqual(["после 75 лет"]);
    expect(home("ФВ ЛЖ менее 40% при ХСН").unmatched).toEqual(["ФВ ЛЖ менее 40%"]);
    expect(home("ХСН у пожилых, 80 лет").unmatched).toEqual(["80 лет"]);
    expect(home("Артериальная гипертензия: клинические рекомендации 2024").unmatched).toEqual(["2024"]);
    expect(home("ЛПНП 3,0 ммоль/л у пожилых").unmatched).toEqual(["ЛПНП 3,0 ммоль/л"]);
    expect(rc("Рекомендации ESC 2024 по ведению ФП").unmatched).toEqual([]);
    expect(rc("Рекомендации ESC 2024 по ведению ФП", skipped).unmatched).toEqual(["ESC 2024"]);
  });
  it("N19-5 (A) / N19-09, N19-05, N19-07 (B): «предупреждения» is a section only as a heading; English service words; «теме»", () => {
    expect(askedSections("Апиксабан для предупреждения инсульта при ФП")).not.toContain("safety");
    expect(askedSections("Апиксабан: предупреждения и меры предосторожности")).toContain("safety");
    expect(askedSections("Варфарин: предупреждение о кровотечении")).toContain("safety");
    expect(home("In patients with heart failure").unmatched).toEqual([]);
    expect(home("Тип A аортальной диссекции").unmatched).toContain("тип A");
    expect(home("Что нового по теме «Фибрилляция предсердий»").unmatched).toEqual([]);
  });
  it("N19-6, N19-7, N19-8 (A) / N19-02 (B): a concept naming its topic, an abbreviation in brackets, a drug compound", () => {
    expect(rc("Ведение беременности", skipped, "obgyn").unmatched).toEqual([]);
    expect(rc("Антикоагулянты при ТЭЛА", skipped).unmatched).toContain("антикоагулянты");
    expect(home("Атопический дерматит (АД) у детей: эмоленты", "pediatrics").unmatched).toEqual(["эмоленты"]);
    expect(home("Аспиринорезистентность при ИБС").unmatched).toEqual(["аспиринорезистентность"]);
  });
});

describe("Round 20: a drug or concept outweighs a general listing cue; no number is dropped", () => {
  const home = (question: string, specialty = "cardiology") => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return { conditions, unmatched: unmatchedWords(question, conditions, specialty as never, undefined, { latinSearched: true, latinQueried: new Set(latinTermsIn(question)) }) };
  };
  const ok = { tool: "searchPubmed", status: "ok", note: null };
  const rc = (text: string, specialty = "cardiology") => researchConditions({ input: { text }, plan: [], toolsUsed: [ok], specialty } as unknown as AgentRun);
  it("N20-01 (B): clinical context outweighs «какие», «ближайшие», a week or a year; a month, «предстоящие», a society keep the listing", () => {
    for (const [question, specialty] of [["Какие события нужно регистрировать при приёме апиксабана", "cardiology"], ["Гипогликемические события при инсулинотерапии", "endocrinology"], ["Какие события считаются MACE при ИБС", "cardiology"], ["События при ХСН у пожилых в 2025 году", "cardiology"], ["События, следующие за инфарктом миокарда", "cardiology"], ["События у пациентов после ЧКВ в ближайшие 30 дней", "cardiology"], ["События в течение недели после ИМ", "cardiology"], ["Отдалённые события после АКШ", "cardiology"], ["Число событий в исследовании PARADIGM-HF", "cardiology"]] as const) expect(compileIntent(question, specialty).job.primary).not.toBe("event_search");
    for (const [question, specialty] of [["События по ХСН в мае", "cardiology"], ["Предстоящие события по АГ", "cardiology"], ["События РКО по АГ", "cardiology"], ["События для эндокринологов в декабре", "endocrinology"], ["Ближайшие события по кардиологии", "cardiology"], ["Главные события ESC 2026", "cardiology"]] as const) expect(compileIntent(question, specialty).job.primary).toBe("event_search");
  });
  it("N20-02 (B): a number the search did not take is named, after punctuation too; a type missing from the conditions is named", () => {
    expect(home("ЛПНП при ИБС: 1,4").unmatched).toEqual(["1,4"]);
    expect(home("ХСН у пожилых, 85").unmatched).toEqual(["85"]);
    expect(home("Ривароксабан при ФП: 15 или 20 мг").unmatched).toEqual(["15", "20 мг"]);
    expect(home("СД 1 и 2 типа", "therapy").unmatched).toEqual(["СД 2 типа"]);
    expect(home("Сахарный диабет 1 и 2 типа", "endocrinology").unmatched).toEqual([]);
    expect(home("Статины после 75 лет").unmatched).toEqual(["после 75 лет"]);
  });
  it("N20-03…N20-05, N20-08 (B): «старше 75 лет» is «пожилые»; no «null»; used hyphenated parts; «до 3 лет», «тип A»", () => {
    expect(rc("ИБС у пациентов старше 75 лет").unmatched).toEqual([]);
    expect(home("SGLT2, HF у пожилых").unmatched.join(" ")).not.toContain("null");
    expect(home("Сакубитрил-валсартан при ХСН").unmatched).toEqual([]);
    expect(home("Бета-блокаторы при ХСН").unmatched).toEqual(["бета-блокаторы"]);
    expect(rc("Эпилепсия у детей до 3 лет", "neurology").unmatched).toContain("детей до 3 лет");
    expect(home("Расслоение аорты тип A").unmatched).toEqual(["расслоение аорты тип A"]);
  });
});

describe("Round 20 (A): a chain of numbers keeps its word; a measure keeps its lead word; «предупреждения» by its role", () => {
  const home = (question: string, specialty = "cardiology") => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return unmatchedWords(question, conditions, specialty as never, undefined, { latinSearched: true, latinQueried: new Set(latinTermsIn(question)) });
  };
  it("N20-2: the type missing from the conditions is named with its abbreviation", () => {
    expect(home("СД 1 и 2 типа: статины")).toEqual(["СД 2 типа"]);
    expect(home("СД 2 и 1 типа у детей", "pediatrics")).toEqual(["СД 1 типа"]);
    expect(home("Сахарный диабет 1 и 2 типа: статины", "endocrinology")).toEqual([]);
  });
  it("N20-3, N20-6: no «null»; «ЛПНП менее 1,4», «СКФ менее 30 мл/мин», «QRS 150 мс» are one phrase each", () => {
    expect(home("Удлинение QTc (QT) при ФП")).toEqual(["удлинение", "QT"]);
    expect(home("ЛПНП менее 1,4")).toEqual(["ЛПНП менее 1,4"]);
    expect(home("СКФ менее 30 мл/мин")).toEqual(["СКФ менее 30 мл/мин"]);
    expect(home("QRS 150 мс CRT")).toEqual(["QRS 150 мс"]);
    expect(home("Статины после 75 лет")).toEqual(["после 75 лет"]);
  });
  it("N20-7: «особые предупреждения», «предупреждение в рамке», warnings of a drug are the section; «предупреждение и лечение» is not", () => {
    for (const question of ["Особые предупреждения апиксабана", "Предупреждения апиксабан", "Предупреждение в рамке", "Апиксабан: предупреждение в рамке и программа REMS"]) expect(askedSections(question)).toContain("safety");
    for (const question of ["Апиксабан для предупреждения и лечения ТГВ", "Предупреждение и лечение тромбоэмболий: апиксабан"]) expect(askedSections(question)).not.toContain("safety");
  });
  it("«AT» is antithrombin, not «at»; «при приёме» is not a condition", () => {
    expect(home("Дефицит AT III при тромбозах").join(" ")).toContain("AT");
    expect(home("Нежелательные события при приёме апиксабана")).not.toContain("приёме");
  });
});

describe("Round 21: «события по <теме>» are the listing; a clinical turn makes them a question; measures and units whole", () => {
  const home = (question: string, specialty = "cardiology") => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return unmatchedWords(question, conditions, specialty as never, undefined, { latinSearched: true, latinQueried: new Set(latinTermsIn(question)) });
  };
  it("N21-01 (B): the topic after «по» is the listing's subject; «при», «после», «у пациентов», a drug make a clinical question", () => {
    for (const question of ["Ближайшие события по ХСН", "Какие события по АГ на этой неделе", "События по ХСН в 2026 году", "События по ФП на следующей неделе", "Какие события по ХСН стоит посетить", "События по ХСН", "Ближайшие события после Нового года", "Какие события по ХСН в этом месяце", "Предстоящие события по АГ"]) expect(compileIntent(question, "cardiology").job.primary).toBe("event_search");
    for (const question of ["События у пациентов с ФП", "События после ЧКВ", "События в ноябре у пациентов с ХСН", "Нежелательные события при приёме апиксабана", "Какие события чаще на фоне апиксабана", "Какие события входят в MACE", "Сердечно-сосудистые события при ХСН"]) expect(compileIntent(question, "cardiology").job.primary).not.toBe("event_search");
  });
  it("N21-02…N21-04, N21-06 (B): «ФВ ЛЖ менее 40%», units, signs, «IN», «режим приёма», «предупреждение и снижение»", () => {
    expect(home("ФВ ЛЖ более 50% при ХСН")).toEqual(["ФВ ЛЖ более 50%"]);
    expect(home("ЛПНП < 1,4 у пожилых")).toEqual(["ЛПНП менее 1,4"]);
    expect(home("Lp(a) более 50 мг/дл").join(" ")).toContain("50 мг/дл");
    expect(home("Apixaban vs warfarin IN elderly").join(" ")).not.toContain("IN");
    expect(home("Время приёма статинов").join(" ")).toContain("время приёма");
    expect(askedSections("Предупреждение и снижение риска инсульта апиксабаном")).not.toContain("safety");
    expect(askedSections("Варфарин: предупреждения и противопоказания")).toContain("safety");
  });
});

describe("Round 21 (A): a number takes only a type word after it; «ниже/выше» hold the measure; heading words of the section", () => {
  const home = (question: string, specialty = "cardiology") => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return unmatchedWords(question, conditions, specialty as never, undefined, { latinSearched: true, latinQueried: new Set(latinTermsIn(question)) });
  };
  it("N21-3, N21-4: «менее 60 кг», «дозы 5 мг», «ЛПНП ниже 1,8», «АД выше 140/90»", () => {
    expect(home("Вес менее 60 кг апиксабан").join(" ")).not.toContain("апиксабан");
    expect(home("ЛПНП ниже 1,8 у пациентов с СД")).toContain("ЛПНП ниже 1,8");
    expect(home("АД выше 140/90 у пожилых")).toContain("АД выше 140/90");
    expect(home("Statins OR placebo in elderly").join(" ")).not.toContain("OR");
  });
  it("«особые», «рамке», «меры предосторожности» belong to the safety section; «предупреждение ривароксабаном» does not", () => {
    expect(askedSections("Апиксабан: меры предосторожности")).toContain("safety");
    expect(askedSections("Предупреждение ривароксабаном тромбоза")).not.toContain("safety");
  });
});

describe("Round 22: a plan never below two steps; «события» by meaning with the way back on top; measures as written", () => {
  const home = (question: string, specialty = "cardiology") => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return unmatchedWords(question, conditions, specialty as never, undefined, { latinSearched: true, latinQueried: new Set(latinTermsIn(question)) });
  };
  const listing = (question: string, specialty = "cardiology") => routePortalIntent(question, specialty as never).job === "events";
  it("N22-01 (B): no task stops at a one-step plan, and only comparisons of drugs stop at one at all", () => {
    const jobs: PortalJob[] = ["answer", "drug", "guidelines", "research", "events", "learning", "updates", "materials"];
    for (const text of ["Бисопролол, метопролол или карведилол при ХСН", "Курсы по апиксабану, ривароксабану и дабигатрану", "Мои материалы: апиксабан, ривароксабан, дабигатран"]) {
      for (const job of jobs) {
        const strategy = decideStrategy({ text, specialty: "cardiology", job, session: null, answered: null, planConfirmed: null });
        if (strategy.planPreview) {
          expect(["answer", "drug", "guidelines", "research"]).toContain(job);
          expect(strategy.planPreview.steps.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
    expect(decideStrategy({ text: "Курсы по апиксабану, ривароксабану и дабигатрану", specialty: "cardiology", job: "learning", session: null, answered: null, planConfirmed: null }).planPreview).toBeNull();
  });
  it("N22-01 (B): a next action never stops at the plan, while the composer still shows it", async () => {
    delete process.env.DATABASE_URL;
    await ensureSession(SESSION);
    const text = "Апиксабан, ривароксабан или дабигатран при ФП";
    const next = await respondToAsk(SESSION, "cardiology", text, { job: "guidelines", followup: true, clarification: { id: "next_action", optionId: null }, schedule: () => undefined });
    expect(next.kind).toBe("run");
    const typed = await respondToAsk(SESSION, "cardiology", text, { schedule: () => undefined });
    expect(typed.kind === "plan" ? typed.plan.steps.length : 2).toBeGreaterThanOrEqual(2);
  });
  it("N22-1 (A), N22-02 (B): a group of patients, a registry or a disease right after «события» is a clinical question", () => {
    for (const [question, specialty] of [["Какие события у детей с эпилепсией", "neurology"], ["Какие события регистрируются в регистре ХСН", "cardiology"], ["Какие события чаще у женщин с ФП", "cardiology"], ["События ОКС", "cardiology"], ["События у беременных с АГ", "obgyn"], ["Эпилептические события у детей", "neurology"], ["Церебральные события ФП", "cardiology"], ["События, определяющие прогноз ХСН", "cardiology"], ["Кровотечения как события на антикоагулянтах", "cardiology"], ["События у пациентов после ЧКВ в ближайшие 30 дней", "cardiology"], ["Какие события по данным ESC при ФП", "cardiology"]]) {
      expect(listing(question, specialty), question).toBe(false);
    }
    for (const question of ["Ближайшие события по ХСН", "События по ХСН на этой неделе", "Какие события по ХСН", "Ближайшие события по СД 2 типа у детей", "Главные события по кардиологии"]) expect(listing(question), question).toBe(true);
  });
  it("N22-2 (A), N22-03 (B): a month, the audience or a supporting society keep the listing over «при» and «в течение»", () => {
    for (const [question, specialty] of [["События по ХСН в течение ноября", "cardiology"], ["События по кардиологии при поддержке РКО", "cardiology"], ["События для эндокринологов при СД", "endocrinology"], ["События для кардиологов при участии ESC", "cardiology"], ["Какие события по ФП в течение ближайшего месяца", "cardiology"]]) {
      expect(listing(question, specialty), question).toBe(true);
    }
  });
  it("N22-1 (A): without a word of the listing the way to the answer comes first; with one it follows the listing, and only with a topic", () => {
    const render = (text: string) => renderToStaticMarkup(<WorkspaceProvider><JobResult job="events" run={{ id: "r", specialty: "cardiology", input: { text }, riskNotices: [], synthesis: null, plan: [], toolsUsed: [], resultIds: [], status: "completed" } as unknown as AgentRun} results={[]} partner={[]} specialty="cardiology" adapter={{ catalog: true, organisers: [] } as never} /></WorkspaceProvider>);
    expect(render("Какие события у женщин с ФП")).toContain("data-bridge=\"top\"");
    expect(render("Ближайшие события по ХСН")).toContain("data-bridge=\"bottom\"");
    expect(render("Ближайшие события по специальности")).not.toContain("Искали не мероприятия?");
    expect(render("Конференции по ХСН в ноябре")).not.toContain("Искали не мероприятия?");
  });
  it("N22-3 (A), N22-05, N22-06 (B): signs read as words, «не более» keeps «не», the lead word stays with its value", () => {
    expect(home("ФВ ЛЖ < 40% при ХСН")).toEqual(["ФВ ЛЖ менее 40%"]);
    expect(home("СКФ < 30 мл/мин")).toEqual(["СКФ менее 30 мл/мин"]);
    expect(home("ЧСС < 60 уд/мин")).toEqual(["ЧСС менее 60 уд/мин"]);
    expect(home("QTc > 500 мс")).toEqual(["QTc более 500 мс"]);
    expect(home("ЛПНП не более 1,4 при ИБС")).toEqual(["ЛПНП не более 1,4"]);
    expect(home("АД не более 130/80")).toEqual(["АД не более 130/80"]);
    expect(home("Статины старше или моложе 75 лет")).toEqual(["старше или моложе 75 лет"]);
    expect(home("Тропонин выше 99-го перцентиля")).toEqual(["тропонин выше 99-го перцентиля"]);
    expect(home("Гликированный гемоглобин выше 7%")).toEqual(["гликированный гемоглобин выше 7%"]);
    expect(home("ЛПНП ниже целевого уровня")).toEqual(["ниже целевого уровня"]);
    expect(home("ХСН с ФВ 50% и выше")).toEqual(["ФВ 50% и выше"]);
    expect(home("ХБП 3 и 4 стадии")).toEqual(["ХБП 3 и 4 стадии"]);
    expect(home("ИМ 2 типа")).toEqual(["ИМ 2 типа"]);
    expect(home("Систолическое АД выше 140")).toEqual(["систолическое АД выше 140"]);
    expect(home("Статины после 75 лет")).toEqual(["после 75 лет"]);
  });
  it("N21-05 (B): hypoglycaemia, insulin therapy, MI («ИМ», never the pronoun «им») and CABG are searched; a version is one word", () => {
    expect(searchConditions(compileIntent("Гипогликемические события при инсулинотерапии", "endocrinology"))).toEqual(expect.arrayContaining(["гипогликемия", "инсулин"]));
    expect(searchConditions(compileIntent("Гипогликемические события после ИМ", "cardiology"))).toContain("инфаркт миокарда (ИМ)");
    expect(searchConditions(compileIntent("Можно ли им назначать статины", "cardiology"))).not.toContain("инфаркт миокарда (ИМ)");
    expect(searchConditions(compileIntent("События после АКШ", "cardiology"))).toContain("АКШ");
    expect(home("ИМ 2 типа")).toEqual(["ИМ 2 типа"]);
    expect(home("Рекомендации ESC v2.0")).toEqual(["v2.0"]);
  });
  it("N22-04 (B): «приёма» after «на фоне» and «без» is the drug's context; «время приёма» is named", () => {
    expect(home("Кровотечения на фоне приёма апиксабана")).toEqual([]);
    expect(home("Инсульт без приёма антикоагулянтов при ФП")).toEqual([]);
    expect(home("Время приёма статинов")).toContain("время приёма");
  });
  it("N22-5 (A): a source excluded in the profile does not make the answer partial", () => {
    const run = { status: "partial", plan: [], resultIds: ["x"], experience: null, error: null, toolsUsed: [{ tool: "searchPubmed", status: "unavailable", note: "PubMed исключён в вашем профиле" }, { tool: "searchCatalog", status: "ok", note: null }] };
    expect(runOutcome(run as never).kind).toBe("found");
  });
  it("N22-08 (B): «История» keeps the answer and the listing of the same words apart", () => {
    const run = (id: string, job: string, startedAt: string) => ({ id, trigger: "composer", status: "completed", intent: job, specialty: "cardiology", input: { text: "События после ЧКВ" }, startedAt } as unknown as AgentRun);
    expect(recentQuestions([run("a", "events", "2026-10-23T10:00:00Z"), run("b", "answer", "2026-10-23T10:01:00Z"), run("c", "events", "2026-10-23T10:02:00Z")]).map(item => item.id)).toEqual(["c", "b"]);
  });
});

describe("Round 23: «события» by positive clinical signs, the way to the answer on top of any clinical listing; measures as written", () => {
  const home = (question: string, specialty = "cardiology") => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return unmatchedWords(question, conditions, specialty as never, undefined, { latinSearched: true, latinQueried: new Set(latinTermsIn(question)) });
  };
  const specialties = ["cardiology", "therapy", "endocrinology", "neurology", "pediatrics", "obgyn"];
  const listing = (question: string, specialty: string) => routePortalIntent(question, specialty as never).job === "events";
  it("N23-1 (A): a clinical question is an answer, or a listing with «Ответ по источникам» first", () => {
    for (const question of ["Какие события при ФП учитывает ESC", "События в ближайший год после инфаркта", "Ближайшие события после ЧКВ", "Ближайшие события после ЧКВ: тромбоз стента", "События в ближайший месяц после инсульта", "События в ближайший месяц после родов", "Регистрация событий при ФП", "События после ТАВИ в 2025 году", "События при преэклампсии по ACOG"]) {
      for (const specialty of specialties) expect(!listing(question, specialty) || eventsBridge(question, specialty as never) === "top", `${specialty}: ${question}`).toBe(true);
    }
    for (const question of ["Какие события при ФП учитывает ESC", "События в ближайший год после инфаркта", "События после ТАВИ в 2025 году"]) expect(listing(question, "cardiology"), question).toBe(false);
    for (const question of ["Ближайшие события по ХСН", "Ближайшие события по СД 2 типа у детей", "Ближайшие события после Нового года", "Ближайшие события по ФП после 1 ноября", "События по ХСН в течение ноября", "События по кардиологии при поддержке РКО"]) expect(listing(question, "cardiology"), question).toBe(true);
  });
  it("N23-2 (A), N23-01 (B): any adjective, a schedule, a society or a field keeps the listing", () => {
    for (const question of ["Грядущие события по ХСН", "Ближайшие очные события по ХСН", "Значимые события по АГ", "Аккредитованные события по ХСН", "Расписание событий по ХСН", "Посещение событий по ХСН", "События ОССН по ХСН", "События НМИЦ кардиологии", "События аритмологии", "События по беременности и родам", "Какие события по СД у детей", "События ХСН в ноябре", "Акушерские события", "Онлайн-события по ХСН"]) {
      for (const specialty of specialties) expect(listing(question, specialty), `${specialty}: ${question}`).toBe(true);
    }
  });
  it("N23-02 (B): clinical adjectives, trials, placebo and endpoints make a question", () => {
    for (const question of ["Мозговые события у пожилых", "Инфекционные события", "Тератогенные события", "Моторные события во сне", "События в группе плацебо", "События на 1000 пациенто-лет", "События в РКИ по ХСН", "Конечные точки и события в DAPA-HF", "События ОНМК", "Сколько событий предотвращает статин"]) {
      expect(listing(question, "cardiology"), question).toBe(false);
    }
  });
  it("N23-3 (A), N23-03…N23-06 (B): «г/л», no lone «выше», «до/от» as written, «во время», a dash separates, a searched disease stays out of a date", () => {
    expect(home("Гемоглобин менее 100 г/л при ХСН")).toEqual(["гемоглобин менее 100 г/л"]);
    expect(home("Риск выше у пожилых с ФП")).toEqual([]);
    expect(home("ЛПНП ниже целевого уровня")).toEqual(["ниже целевого уровня"]);
    expect(home("Отмена апиксабана за 48 часов до операции")).toContain("48 часов до операции");
    expect(home("Отказ от курения при ИБС")).toEqual(["отказ от курения"]);
    expect(home("Во время приёма статинов")).toEqual([]);
    expect(home("Детям старше 12 лет — по 10 мг один раз в сутки").join(" | ")).not.toContain("старше 10 мг");
    expect(home("При массе тела 60 кг и менее — 2,5 мг")).toEqual(["массе тела 60 кг и менее", "2,5 мг"]);
    expect(home("Ближайшие события по ФП после 1 ноября")).toContain("после 1 ноября");
    expect(home("ИМТ 30 кг/м2 и выше")).toEqual(["ИМТ 30 кг/м2 и выше"]);
  });
  it("N23-4 (A) / N23-07 (B): no verified listing is said as it is, without «Повторить»; an excluded source is named under «ничего не найдено»", () => {
    const listingRun = { status: "completed", plan: [], resultIds: [], experience: null, error: null, toolsUsed: [{ tool: "searchEvents", status: "unavailable", note: "Для этой специальности нет проверенной афиши событий" }, { tool: "matchPartnerContent", status: "ok", note: null }] };
    expect(runOutcome(listingRun as never)).toMatchObject({ kind: "not_run", label: "Проверенной афиши пока нет" });
    const excluded = { status: "completed", plan: [], resultIds: [], experience: null, error: null, toolsUsed: [{ tool: "searchPubmed", status: "unavailable", note: "PubMed исключён в вашем профиле" }, { tool: "searchCatalog", status: "ok", note: null }] };
    expect(runOutcome(excluded as never).note).toContain("PubMed исключён в вашем профиле");
  });
  it("a dropped concept is named in the physician's words, not by its name («апиксабан», not «антикоагулянты»)", () => {
    const run = { input: { text: "Апиксабан, ривароксабан или дабигатран при ФП" }, plan: [], toolsUsed: [{ tool: "searchPubmed", status: "unavailable", note: "PubMed исключён в вашем профиле" }], specialty: "cardiology" } as unknown as AgentRun;
    expect(researchConditions(run).unmatched).toEqual(["апиксабан", "ривароксабан", "дабигатран"]);
  });
});

describe("Round 24: CABG only in a coronary context; field adjectives yield to a date; measures keep their head and unit", () => {
  const home = (question: string, specialty = "cardiology") => {
    const conditions = searchConditions(compileIntent(question, specialty as never));
    return unmatchedWords(question, conditions, specialty as never, undefined, { latinSearched: true, latinQueried: new Set(latinTermsIn(question)) });
  };
  const listing = (question: string, specialty = "cardiology") => routePortalIntent(question, specialty as never).job === "events";
  it("N24-02 (B): «шунтирование» is CABG only next to ИБС, coronary or MI; other shunts are not", () => {
    for (const [question, specialty] of [["Шунтирование при нормотензивной гидроцефалии у пожилых", "neurology"], ["Шунтирование желудка при ожирении и СД 2 типа", "endocrinology"], ["Портосистемное шунтирование при циррозе", "therapy"], ["Шунтирование при ВПС у детей", "pediatrics"], ["Экстра-интракраниальное шунтирование при окклюзии ВСА", "neurology"]]) {
      expect(searchConditions(compileIntent(question, specialty as never)), question).not.toContain("АКШ");
      expect(researchConditions({ input: { text: question }, plan: [], toolsUsed: [], specialty } as unknown as AgentRun).conditions, question).not.toContain("АКШ");
    }
    for (const question of ["Шунтирование при ИБС", "Аортокоронарное шунтирование у пожилых", "Статины после АКШ", "Тромбоз шунта после АКШ"]) expect(searchConditions(compileIntent(question, "cardiology")), question).toContain("АКШ");
  });
  it("N24-05 (B): glucose-lowering drugs are not hypoglycaemia; insulin is named «инсулин»", () => {
    expect(searchConditions(compileIntent("Пероральные гипогликемические препараты при ХБП", "endocrinology"))).not.toContain("гипогликемия");
    expect(searchConditions(compileIntent("Уровень инсулина при ожирении", "endocrinology"))).toContain("инсулин");
  });
  it("N24-1 (A): verbs of sequence, «перед/накануне/во время» and a recognised disease after «события» make a question", () => {
    for (const question of ["Какие события предшествуют инсульту", "Какие события сопровождают ФП", "События перед инсультом", "События накануне инсульта", "События ТЭЛА", "Какие события связаны с ХСН", "Какие события следуют за инфарктом"]) expect(listing(question), question).toBe(false);
  });
  it("N24-2 (A) / N24-01 (B): a field adjective with a date or another adjective is the listing; alone or with a turn, a question", () => {
    for (const question of ["Ближайшие неврологические события", "Неврологические события в ноябре", "Главные неврологические события года", "Неврологические события 2026 года", "Региональные неврологические события"]) expect(listing(question, "neurology"), question).toBe(true);
    for (const question of ["Неврологические события", "Неврологические события после инсульта", "Неврологические события у детей"]) expect(listing(question, "neurology"), question).toBe(false);
    expect(listing("События ESC-2026")).toBe(true);
    expect(listing("Острые события ноября в кардиологии")).toBe(true);
    expect(listing("Нежелательные события в мае при вакцинации", "pediatrics")).toBe(false);
  });
  it("N24-3 (A) / N24-03 (B): «5 г» but not «2024 г.»; «ЛПНП до 1,8»; «от 30 до 60»; «во время операции»; no hanging «от»", () => {
    expect(home("Соль менее 5 г в сутки при АГ")).toContain("соль менее 5 г");
    expect(home("Масса тела менее 2500 г у новорождённых", "pediatrics")).toContain("масса тела менее 2500 г");
    expect(home("ЛПНП до 1,8")).toEqual(["ЛПНП до 1,8"]);
    expect(home("СКФ от 30 до 60")).toEqual(["СКФ от 30 до 60"]);
    expect(home("ДАТТ от 6 до 12 месяцев")).toEqual(["ДАТТ от 6 до 12 месяцев"]);
    expect(home("ФП во время операции")).toEqual(["во время операции"]);
    expect(home("Переход от варфарина к апиксабану")).toEqual(["переход"]);
    expect(home("Ближайшие события по ФП после 1 ноября")).toContain("после 1 ноября");
  });
  it("N24-04 (B) / N24-3 (A): a concept in the physician's words is named once, whole, without a stray bracket", () => {
    const rc = (text: string) => researchConditions({ input: { text }, plan: [], toolsUsed: [{ tool: "searchPubmed", status: "unavailable", note: "PubMed исключён в вашем профиле" }], specialty: "cardiology" } as unknown as AgentRun).unmatched;
    expect(rc("Апиксабан 2,5 мг у пожилых")).toEqual(["пожилые пациенты", "апиксабан 2,5 мг"]);
    expect(rc("Статины старше 75 лет").filter(item => item.includes("старше"))).toEqual(["старше 75 лет"]);
    expect(rc("Изоляция лёгочных вен при ФП")).toContain("изоляция лёгочных вен");
    expect(rc("Транзиторная ишемическая атака (ТИА): аспирин")).toContain("ТИА");
    expect(rc("ИМ 2 типа")).toEqual(["ИМ 2 типа"]);
  });
});
