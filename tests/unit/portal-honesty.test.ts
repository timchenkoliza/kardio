import { describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/agents/profile";
import type { AgentResult, AgentRun } from "@/lib/agents/types";
import { LAUNCH_SPECIALTY_IDS, type SpecialtyId } from "@/lib/domain/types";
import { specialties } from "@/lib/specialty";
import { cleanSection, dedupeChangeList, parseLabel } from "@/server/agents/adapters/openfda";
import { publicationDates } from "@/server/agents/adapters/pubmed";
import { extractConclusion } from "@/server/agents/adapters/pubmed-abstracts";
import { chooseLearningSignal, learning } from "@/server/agents/executor-learning";
import { reference, rerankByTitle } from "@/server/agents/executor-reference";
import { EXECUTORS } from "@/server/agents/executors";
import { validateEvidence } from "@/server/agents/supervisor";
import { buildForYou } from "@/server/portal/for-you";
import { listContent } from "@/server/repositories/catalog";
import { fakeAbstracts, fakeArticle, fakeDrugLabel, fakePubmed, FIXED_NOW, testContext } from "./agent-test-utils";

function run(text: string, startedAt: string, agentId: AgentRun["agentId"] = "reference"): AgentRun {
  return { id: `run-${startedAt}`, agentId, specialty: "endocrinology", trigger: "composer", startedAt, completedAt: startedAt, status: "completed", input: { text, preferenceDigest: "" }, intent: "answer", plan: [], toolsUsed: [], resultIds: [], newResultCount: 0, error: null, durationMs: 1, riskNotices: [], synthesis: null };
}

describe("first value without configuration", () => {
  it("a new physician with no topics gets a sourced answer from the reference job", async () => {
    const article = { ...fakeArticle("111", "Antibiotics for acute otitis media in children"), journal: "Cochrane Database Syst Rev", publicationTypes: ["Systematic Review"] };
    const ctx = await testContext({ agentId: "reference", topics: [], specialty: "pediatrics", text: "антибиотики при остром среднем отите у детей", job: "answer", pubmed: fakePubmed([article]), abstracts: fakeAbstracts([{ pmid: "111", sections: [{ label: "AUTHORS' CONCLUSIONS", text: "Antibiotics probably have no effect on pain at 24 hours in children with AOM." }], conclusion: "Antibiotics probably have no effect on pain at 24 hours in children with AOM.", conclusionLabel: "AUTHORS' CONCLUSIONS" }]) });
    expect(ctx.profile.interests.topics).toEqual([]);
    const out = await reference(ctx);
    const answer = out.drafts.find(draft => draft.kind === "reference_answer");
    expect(answer?.evidence[0].verificationStatus).toBe("SUPPORTED");
    expect(answer?.source.dataOrigin).toBe("runtime_api");
    expect(out.synthesis).toMatch(/Чего не хватает/);
  });

  it("an unavailable source degrades honestly instead of returning a fabricated answer", async () => {
    const ctx = await testContext({ agentId: "reference", topics: [], specialty: "therapy", text: "лечение подагры", job: "answer", pubmed: fakePubmed([], "unavailable") });
    const out = await reference(ctx);
    expect(out.drafts.filter(draft => draft.kind === "reference_answer")).toHaveLength(0);
    expect(out.synthesis).toMatch(/PubMed: PubMed сейчас недоступен/);
  });

  it("a drug without a US label says so and points to ГРЛС", async () => {
    const ctx = await testContext({ agentId: "reference", topics: [], specialty: "obgyn", text: "дидрогестерон", job: "drug", drugLabel: fakeDrugLabel({ status: "not_found" }) });
    const out = await reference(ctx);
    expect(out.drafts.some(draft => draft.kind === "drug_label")).toBe(false);
    expect(out.synthesis).toMatch(/нет инструкции.*ГРЛС/);
  });
});

describe("source parsing keeps provenance truthful", () => {
  it("takes the authors' conclusion, never the results section", () => {
    const conclusion = extractConclusion([{ label: "MAIN RESULTS", text: "We included 19 RCTs." }, { label: "AUTHORS' CONCLUSIONS", text: "There may be small improvements." }]);
    expect(conclusion?.text).toBe("There may be small improvements.");
  });

  it("replaces a future journal issue date with the online date", () => {
    const dates = publicationDates({ pubdate: "2027 Dec 31", sortpubdate: "2027/12/31 00:00", epubdate: "2026 Oct 10", history: [{ pubstatus: "entrez", date: "2026/10/10 12:00" }] }, FIXED_NOW);
    expect(dates.sortDate).toBe("2026-10-10");
    expect(dates.pubDate).toMatch(/онлайн/);
  });

  it("parses an FDA label into verbatim sections with the DailyMed link", () => {
    const label = parseLabel({ set_id: "abc", effective_time: "20260908", openfda: { generic_name: ["IBUPROFEN"], product_type: ["HUMAN PRESCRIPTION DRUG"] }, contraindications: ["4 CONTRAINDICATIONS Known hypersensitivity to ibuprofen."], recent_major_changes: ["Dosage (2.5) 6/2026 Dosage ( 2.5 ) 6/2026"] }, "https://api.fda.gov/x");
    expect(label?.dailyMedUrl).toContain("setid=abc");
    expect(label?.productType).toBe("HUMAN PRESCRIPTION DRUG");
    expect(label?.sections.find(section => section.id === "contraindications")?.text).toBe("Known hypersensitivity to ibuprofen.");
    expect(dedupeChangeList("Dosage (2.5) 6/2026 Dosage ( 2.5 ) 6/2026")).toBe("Dosage (2.5) 6/2026");
    expect(cleanSection("Directions ■ take 1 tablet ■ do not exceed").text).toBe("Directions • take 1 tablet • do not exceed");
  });

  it("drops tangential reviews when on-topic ones exist", () => {
    const ranked = rerankByTitle([{ title: "Uterotonic agents for postpartum haemorrhage" }, { title: "Migraine prophylaxis in adults" }, { title: "Vestibular migraine treatment" }], ["migraine[tiab] OR headache[tiab]"]);
    expect(ranked.map(item => item.title)).toEqual(["Migraine prophylaxis in adults", "Vestibular migraine treatment"]);
  });
});

describe("events: a real finite job or an honest limited state", () => {
  it("never fabricates events outside cardiology", async () => {
    for (const specialty of LAUNCH_SPECIALTY_IDS.filter(id => id !== "cardiology")) {
      const ctx = await testContext({ agentId: "events", topics: [], specialty, text: "конференции онлайн", job: "events" });
      const out = await EXECUTORS.events(ctx);
      expect(out.drafts.filter(draft => draft.kind === "event")).toHaveLength(0);
      expect(out.synthesis).toMatch(/не придумываются/);
      expect(specialties[specialty].organisers.length).toBeGreaterThan(0);
    }
  });

  it("cardiology events are curated snapshots with dates, organiser and confirmation-gated actions; rejected listings are hidden and reported", async () => {
    const ctx = await testContext({ agentId: "events", topics: [], text: "конгрессы", job: "events" });
    const out = await EXECUTORS.events(ctx);
    const { kept } = validateEvidence(out.drafts);
    const events = kept.filter(draft => draft.kind === "event");
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.source.dataOrigin).toBe("curated_snapshot");
      expect(event.source.sourceUrl).not.toMatch(/rnmo\.ru/);
      expect(typeof event.attributes.startDate).toBe("string");
      expect(event.attributes.organizer).toBeTruthy();
      expect(event.actions.find(action => action.kind === "registration")?.requiresConfirmation).toBe(true);
    }
    const dates = events.map(event => String(event.attributes.startDate));
    expect(dates).toEqual([...dates].sort());
    expect(out.notices.join(" ")).toMatch(/отклонённых врачами/);
  });
});

describe("learning: next step from real signals, cold start included", () => {
  it("cold start (no topics, no history) still produces a step and says why, without behavioural claims", async () => {
    const review = { ...fakeArticle("222", "Hypothyroidism management: a systematic review"), journal: "Cochrane Database Syst Rev", publicationTypes: ["Systematic Review"] };
    const ctx = await testContext({ agentId: "learning", topics: [], specialty: "endocrinology", pubmed: fakePubmed([review]) });
    const out = await learning(ctx);
    expect(out.drafts.length).toBeGreaterThan(0);
    expect(out.synthesis).toMatch(/Персональных сигналов пока нет/);
    expect(out.synthesis).not.toMatch(/обращались|часто/);
  });

  it("claims a repeated interest only when stored runs prove it", async () => {
    const once = await testContext({ agentId: "learning", topics: [], specialty: "endocrinology", history: [run("метформин при ХБП", "2026-10-12T10:00:00.000Z")] });
    expect(chooseLearningSignal(once).kind).toBe("recent_question");
    const twice = await testContext({ agentId: "learning", topics: [], specialty: "endocrinology", history: [run("остеопороз у пожилых", "2026-10-12T10:00:00.000Z"), run("деносумаб при остеопорозе", "2026-10-18T10:00:00.000Z")] });
    const signal = chooseLearningSignal(twice);
    expect(signal.kind).toBe("repeated_interest");
    expect(signal.reason).toMatch(/Остеопороз.*2 раза/);
    expect(signal.evidenceDates).toHaveLength(2);
  });

  it("the current request outranks stored history", async () => {
    const ctx = await testContext({ agentId: "learning", topics: [], specialty: "neurology", text: "хочу освежить ведение эпилепсии", history: [run("мигрень", "2026-10-12T10:00:00.000Z"), run("мигрень у подростков", "2026-10-13T10:00:00.000Z")] });
    expect(chooseLearningSignal(ctx).kind).toBe("current_intent");
  });
});

describe("«Для вас»: one contract, no cardiology leakage, disclosed partner", () => {
  function result(partial: Partial<AgentResult> & Pick<AgentResult, "id" | "agentId" | "kind">): AgentResult {
    return { key: partial.id, specialty: "pediatrics", runId: "run-1", category: null, title: partial.id, summary: "", reasonShown: ["Новая публикация по специальности «Педиатрия»"], createdAt: "2026-10-19T10:00:00.000Z", observedAt: "2026-10-18", evidence: [], source: { connectorId: "pubmed", source: "Cochrane", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/1/", publisher: null, retrievedAt: "2026-10-19T10:00:00.000Z", publishedAt: null, version: null, ownership: "PUBLIC_SOURCE", dataOrigin: "runtime_api" }, actions: [{ kind: "open_source", label: "PubMed", href: "https://pubmed.ncbi.nlm.nih.gov/1/", requiresConfirmation: false }], attributes: {}, partner: null, dismissed: false, savedMaterialId: null, rank: 1, ...partial };
  }

  it("never renders the cardiology catalog or partner fixture for another specialty", async () => {
    const cardioCatalog = await listContent("cardiology");
    for (const specialty of LAUNCH_SPECIALTY_IDS.filter(id => id !== "cardiology") as SpecialtyId[]) {
      const view = buildForYou({ specialty, profile: defaultProfile(specialty), results: [], runs: [], materials: [], content: cardioCatalog, now: FIXED_NOW });
      expect(view.cards.filter(card => card.kind === "catalog" || card.kind === "partner")).toHaveLength(0);
    }
  });

  it("every card carries the cross-type contract and partner material is disclosed and never first", async () => {
    const profile = defaultProfile("cardiology");
    profile.previousVisitAt = "2026-10-18T00:00:00.000Z";
    const runs: AgentRun[] = [{ ...run("", "2026-10-19T10:00:00.000Z", "whats_new"), specialty: "cardiology", trigger: "schedule_catchup", resultIds: ["res-a", "res-b"] }];
    const results = [result({ id: "res-a", agentId: "whats_new", kind: "update", specialty: "cardiology", runId: runs[0].id }), result({ id: "res-b", agentId: "whats_new", kind: "update", specialty: "cardiology", runId: runs[0].id, title: "second" })];
    const view = buildForYou({ specialty: "cardiology", profile, results, runs, materials: [], content: await listContent("cardiology"), now: FIXED_NOW });
    expect(view.cards[0].kind).not.toBe("partner");
    for (const card of view.cards) {
      expect(card.title).toBeTruthy();
      expect(card.whyShown).toBeTruthy();
      expect(card.source.name).toBeTruthy();
      expect(card.source.state).toBeTruthy();
      expect(card.primary.href).toBeTruthy();
    }
    const partner = view.cards.find(card => card.kind === "partner");
    expect(partner?.partner?.disclosure).toMatch(/Партнёрский материал/);
    expect(partner?.source.state).toBe("MOCK");
    expect(view.cards.filter(card => card.isNew).length).toBe(2);
  });
});
