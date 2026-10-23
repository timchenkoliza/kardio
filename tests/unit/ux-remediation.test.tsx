import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined }),
  usePathname: () => "/cardiology",
  useSearchParams: () => new URLSearchParams(),
}));

import { AGENT_DEFINITIONS } from "@/lib/agents/definitions";
import { VERIFICATION_LABEL } from "@/lib/agents/format";
import { defaultProfile, isRunDue } from "@/lib/agents/profile";
import type { AgentRun } from "@/lib/agents/types";
import { compileExperience } from "@/lib/mesh/compiler";
import { askedTerms } from "@/lib/mesh/evidence-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { askedSections, openingView, viewDirectives } from "@/lib/mesh/refine";
import { GALLERY, galleryHref } from "@/lib/portal/agents-gallery";
import { continuedQuestion, isDependentFollowup } from "@/lib/portal/continuation";
import { conceptsIn, pubmedCoreTermFor, pubmedTermFor } from "@/lib/portal/lexicon";
import { runOutcome } from "@/lib/portal/run-outcome";
import { editorialVerification } from "@/lib/presentation/physician";
import { ExperienceView } from "@/components/experience/experience-view";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { workspaceStore } from "@/server/agents/store";
import { createRun } from "@/server/agents/supervisor";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { conceptsForIntent, createPubmedAdapter } from "@/server/mesh/sources/pubmed";
import { scenariosFor } from "@/server/portal/for-you";
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
