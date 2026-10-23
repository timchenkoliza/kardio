import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

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
import { specificTopicTerms } from "@/lib/agents/vocabulary";
import { ResearchResultsTable } from "@/components/workspace/research-report";
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
    const run = { id: "run", input: { text: "ПОАК у пожилых" }, synthesis: null, completedAt: "2026-10-23T00:00:00.000Z", startedAt: "2026-10-23T00:00:00.000Z" } as unknown as AgentRun;
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
    expect(unmatched("Неишемическая кардиомиопатия и ИКД").conditions).not.toContain("ибс");
    expect(unmatched("Дислипидемия у пожилых").conditions).toContain("липидология");
  });
  it("N11-3: a skipped PubMed names the concepts it did not search", () => {
    const skipped = unmatched("Катетерная аблация при фибрилляции предсердий у пожилых", true);
    expect(skipped.conditions).toEqual(["фибрилляция предсердий"]);
    expect(skipped.unmatched).toEqual(expect.arrayContaining(["абляция", "пожилые пациенты"]));
    expect(unmatched("Катетерная аблация при фибрилляции предсердий у пожилых").unmatched).toEqual([]);
  });
});
