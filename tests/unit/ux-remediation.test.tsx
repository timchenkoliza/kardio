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
import { defaultProfile } from "@/lib/agents/profile";
import type { AgentRun } from "@/lib/agents/types";
import { compileExperience } from "@/lib/mesh/compiler";
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
import { acceptanceGraph } from "./mesh-test-utils";

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

describe("UX-04 a follow-up continues the question", () => {
  it("«А если течение нетяжёлое?» depends on the previous question; a new drug question does not", () => {
    expect(isDependentFollowup("А если течение нетяжёлое?", "therapy")).toBe(true);
    expect(isDependentFollowup("а у детей?", "therapy")).toBe(true);
    expect(isDependentFollowup("Аторвастатин: противопоказания", "therapy")).toBe(false);
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
    expect(run?.input.continuation).toEqual({ runId: previous.id, followup: "А если течение нетяжёлое?", question: CAP });
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
