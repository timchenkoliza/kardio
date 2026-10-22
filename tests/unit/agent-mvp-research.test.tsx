import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchAnswerView } from "@/components/workspace/research-answer";
import { buildResearchAnswer, designLabel, studyDigest } from "@/lib/agents/research-answer";
import { DEFAULT_RESEARCH_RUN_OPTIONS, researchOptionsForAnswerMode } from "@/lib/agents/research-options";
import { structuredEvidenceToAttributes } from "@/lib/agents/research-structured-evidence";
import { normalizeResearchStudy, researchStudyNormalizationToAttributes } from "@/lib/agents/research-study-normalization";
import { pubmedTermForIdentifiers, studyIdentifiersIn } from "@/lib/agents/study-identifiers";
import type { AgentResultView, AgentRun } from "@/lib/agents/types";
import { routePortalIntent } from "@/lib/portal/router";
import type { PubmedEvidenceDocument } from "@/server/agents/adapters/pubmed-document";
import { EXECUTORS, researchTopicQuery } from "@/server/agents/executors";
import { bindResearchRunOptions } from "@/server/agents/services/research-runtime-policy";
import { evidenceTextAttributes, extractStructuredResearchEvidence } from "@/server/agents/services/research-structured-evidence";
import { workspaceStore } from "@/server/agents/store";
import { resetMemorySession } from "@/server/agents/store/memory";
import { checkInputRisk } from "@/server/agents/services/risk";
import { createAskRun, executeAskRun } from "@/server/portal/manager";
import { ensureSession } from "@/server/services/state";
import { fakeArticle, fakePubmed, FIXED_NOW, profileWith, testContext } from "./agent-test-utils";

/**
 * Agent MVP vertical slice: «Разбор по исследованиям» (docs/agent-mvp/DECISION.md).
 * The synthetic abstract below is written for the test; it is not a real study.
 */

const SYNTHETIC_ABSTRACT: PubmedEvidenceDocument["sections"] = [
  { label: "BACKGROUND", text: "Whether drug X reduces heart failure events in patients with a reduced ejection fraction is uncertain." },
  { label: "METHODS", text: "In this randomized trial, we assigned 4744 patients with heart failure and a reduced ejection fraction to receive drug X at a dose of 10 mg once daily or placebo. The primary outcome was a composite of worsening heart failure or cardiovascular death." },
  { label: "RESULTS", text: "Over a median follow-up of 18.2 months, the primary outcome occurred in 386 patients in the drug X group and in 502 patients in the placebo group (hazard ratio, 0.74; 95% confidence interval [CI], 0.65 to 0.85; P<0.001)." },
  { label: "CONCLUSIONS", text: "Among patients with heart failure and a reduced ejection fraction, the risk of worsening heart failure or death from cardiovascular causes was lower among those who received drug X than among those who received placebo." },
];

function document(access: PubmedEvidenceDocument["access"], sections = SYNTHETIC_ABSTRACT): PubmedEvidenceDocument {
  return { pmid: "31535829", pmcid: null, access, sections: access === "unavailable" ? [] : sections, sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/31535829/", note: access === "abstract" ? "Полного текста в открытом доступе нет, использована аннотация" : null };
}

function view(attributes: AgentResultView["attributes"], overrides: Partial<AgentResultView> = {}): AgentResultView {
  return {
    id: "res-1",
    sessionId: "s",
    agentId: "research",
    specialty: "cardiology",
    runId: "run-1",
    kind: "research_finding",
    category: "publication",
    title: "Drug X in heart failure with reduced ejection fraction",
    summary: "N Engl J Med · 2019 Nov 21 · Randomized Controlled Trial",
    reasonShown: ["Вы указали: PMID 31535829"],
    observedAt: "2019-11-21",
    evidence: [{ id: "e1", claim: "Опубликовано", sourceId: "pubmed:31535829", sourceTitle: "N Engl J Med", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/31535829/", evidenceLevel: "rct", verificationStatus: "SUPPORTED", retrievedAt: FIXED_NOW.toISOString(), quote: null } as unknown as AgentResultView["evidence"][number]],
    source: { connectorId: "pubmed", source: "The New England journal of medicine", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/31535829/", retrievedAt: FIXED_NOW.toISOString() } as AgentResultView["source"],
    actions: [{ kind: "open_source", label: "PubMed", href: "https://pubmed.ncbi.nlm.nih.gov/31535829/", requiresConfirmation: false }],
    attributes: { journal: "N Engl J Med", doi: "10.1056/nejmoa1911303", publicationTypes: "Journal Article, Randomized Controlled Trial, Multicenter Study", ...attributes },
    partner: null,
    rank: 0,
    createdAt: FIXED_NOW.toISOString(),
    newSinceLastSeen: false,
    saved: false,
    dismissed: false,
    ...overrides,
  } as unknown as AgentResultView;
}

function readAttributes(doc: PubmedEvidenceDocument): AgentResultView["attributes"] {
  const structured = extractStructuredResearchEvidence(doc);
  return { ...evidenceTextAttributes(doc), ...(structured ? structuredEvidenceToAttributes(structured) : {}), ...researchStudyNormalizationToAttributes(normalizeResearchStudy(structured)) };
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    sessionId: "s",
    specialty: "cardiology",
    agentId: "research",
    trigger: "composer",
    status: "completed",
    intent: "research",
    input: { text: "Разбери статью PMID 31535829", preferenceDigest: "", explicitJob: false, followup: false, answerMode: "full" },
    plan: [],
    toolsUsed: [{ tool: "searchPubmed", connectorIds: ["pubmed"], modes: ["LIVE"], status: "ok", itemCount: 1, durationMs: 1, note: null }],
    resultIds: ["res-1"],
    synthesis: null,
    riskNotices: [],
    startedAt: FIXED_NOW.toISOString(),
    completedAt: FIXED_NOW.toISOString(),
    ...overrides,
  } as unknown as AgentRun;
}

describe("study identifiers", () => {
  it("reads PMID, PubMed and PMC links and DOI, and nothing else", () => {
    expect(studyIdentifiersIn("Разбери статью PMID 31535829").pmids).toEqual(["31535829"]);
    expect(studyIdentifiersIn("https://pubmed.ncbi.nlm.nih.gov/31535829/ что там?").pmids).toEqual(["31535829"]);
    expect(studyIdentifiersIn("https://pmc.ncbi.nlm.nih.gov/articles/PMC7031581/").pmcids).toEqual(["PMC7031581"]);
    expect(studyIdentifiersIn("doi: 10.1056/NEJMoa1911303.").dois).toEqual(["10.1056/nejmoa1911303"]);
    expect(studyIdentifiersIn("https://doi.org/10.1056/NEJMoa1911303").dois).toEqual(["10.1056/nejmoa1911303"]);
    for (const text of ["апиксабан 5 мг 2 раза в день", "ХСН 2023, ФВ 35%", "исследование 2019 года"]) {
      expect(pubmedTermForIdentifiers(studyIdentifiersIn(text))).toBeNull();
    }
    expect(pubmedTermForIdentifiers(studyIdentifiersIn("PMID 31535829 и 10.1056/NEJMoa1911303"))).toBe('31535829[uid] OR "10.1056/nejmoa1911303"[doi]');
  });
});

describe("routing to the research scenario", () => {
  it("sends a named publication or a study review to research", () => {
    for (const text of ["Разбери статью PMID 31535829", "https://pubmed.ncbi.nlm.nih.gov/31535829/", "Что показало исследование DAPA-HF?", "Разбор исследования EMPEROR-Reduced", "Результаты исследования SINGLE-AF"]) {
      expect(routePortalIntent(text, "cardiology").job, text).toBe("research");
    }
    expect(routePortalIntent("Разбери статью PMID 31535829", "cardiology").reasons.join(" ")).toContain("PMID 31535829");
  });

  it("does not take other jobs away (regressions)", () => {
    expect(routePortalIntent("Апиксабан: противопоказания", "cardiology").job).toBe("drug");
    expect(routePortalIntent("Клинические рекомендации по ХСН", "cardiology").job).toBe("guidelines");
    expect(routePortalIntent("Когда назначать исследование ТТГ?", "endocrinology").job).not.toBe("research");
    expect(routePortalIntent("конференции по кардиологии в ноябре", "cardiology").job).toBe("events");
  });

  it("never explains a route with an empty topic", () => {
    expect(routePortalIntent("Statins and dementia risk", "neurology").reasons.join(" ")).not.toMatch(/Вопрос по теме: $/u);
  });
});

describe("research executor: a named publication", () => {
  it("looks it up by identifier, without the topic search and the journal filter", async () => {
    const pubmed = fakePubmed([fakeArticle("31535829", "Drug X in heart failure")]);
    const ctx = await testContext({ agentId: "research", topics: [], text: "Разбери статью PMID 31535829", pubmed });
    const result = await EXECUTORS.research(ctx);
    expect(pubmed.calls).toHaveLength(1);
    expect(pubmed.calls[0].term).toBe("31535829[uid]");
    expect(pubmed.calls[0].journals ?? []).toEqual([]);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].reasonShown[0]).toBe("Вы указали: PMID 31535829");
    expect(result.plan.map(step => step.label)).toContain("Нашли публикацию в PubMed по идентификатору");
  });

  it("flags a journal outside the physicians' approved list instead of hiding the article", async () => {
    const article = { ...fakeArticle("40000001", "Drug X registry"), journal: "Some Regional J" };
    const ctx = await testContext({ agentId: "research", topics: [], text: "PMID 40000001", pubmed: fakePubmed([article]) });
    const result = await EXECUTORS.research(ctx);
    expect(result.drafts[0].attributes.journalOutsideApprovedList).toBe(true);
  });

  it("says so when the publication is not in PubMed, and when PubMed is down", async () => {
    const missing = await EXECUTORS.research(await testContext({ agentId: "research", topics: [], text: "PMID 99999999", pubmed: fakePubmed([]) }));
    expect(missing.drafts).toHaveLength(0);
    expect(missing.synthesis).toContain("нет публикации по PMID 99999999");
    const down = await EXECUTORS.research(await testContext({ agentId: "research", topics: [], text: "PMID 31535829", pubmed: fakePubmed([fakeArticle("31535829", "x")], "unavailable") }));
    expect(down.drafts).toHaveLength(0);
    expect(down.synthesis).toMatch(/PubMed недоступен.*разбор не выполнен/u);
  });

  it("does not search PubMed behind the physician's back when the settings exclude it", async () => {
    const profile = bindResearchRunOptions(profileWith("cardiology", []), { ...DEFAULT_RESEARCH_RUN_OPTIONS, sourceScope: "russia" });
    const pubmed = fakePubmed([fakeArticle("31535829", "x")]);
    const result = await EXECUTORS.research(await testContext({ agentId: "research", topics: [], text: "PMID 31535829", pubmed, profile }));
    expect(pubmed.calls).toHaveLength(0);
    expect(result.synthesis).toContain("не искали");
  });
});

describe("what the run reads from the article", () => {
  it("keeps the authors' conclusion from the abstract, also when the full text was read", () => {
    const abstract = evidenceTextAttributes(document("abstract"));
    expect(abstract["evidenceText.access"]).toBe("abstract");
    expect(abstract["authorsConclusion.text"]).toContain("risk of worsening heart failure");
    const full = evidenceTextAttributes({ ...document("full_text", [{ label: "Discussion", text: "Long discussion text without a conclusion label." }]), abstract: SYNTHETIC_ABSTRACT });
    expect(full["authorsConclusion.text"]).toContain("risk of worsening heart failure");
    expect(evidenceTextAttributes(document("unavailable"))["authorsConclusion.text"]).toBeUndefined();
  });

  it("reads NEJM-style effect wording and quotes where the numbers come from", () => {
    const digest = studyDigest(view(readAttributes(document("abstract"))));
    expect(digest.effect).toBe("HR 0.74; 95% ДИ 0.65–0.85; p < 0.001");
    expect(digest.effectQuote).toContain("hazard ratio, 0.74");
    expect(digest.population).toContain("N=4744");
    expect(digest.design).toBe("РКИ, многоцентровое");
    expect(digest.links.map(link => link.label)).toEqual(["PubMed", "DOI"]);
  });
});

describe("numbers are read, never guessed", () => {
  it("Lancet middle-dot decimals give the real value, not «HR 0»", () => {
    const lancet = SYNTHETIC_ABSTRACT.map(section => section.label === "RESULTS" ? { ...section, text: "Over a median follow-up of 540 days, the primary outcome occurred in 51 patients in the short-therapy group and 79 in the long-therapy group (hazard ratio 0·62, 95% CI 0·43–0·88; p=0·0076)." } : section);
    const digest = studyDigest(view(readAttributes(document("abstract", lancet))));
    expect(digest.effect).toBe("HR 0.62; 95% ДИ 0.43–0.88; p = 0.0076");
    expect(digest.effectQuote).toContain("0·62");
  });

  it("an interval from another sentence is never glued to the ratio", () => {
    const mixed = SYNTHETIC_ABSTRACT.map(section => section.label === "RESULTS" ? { ...section, text: "Bleeding occurred less often with drug X (HR=0.50). The mean difference in quality-of-life score was 1.1 points (95% CI -1.5 to 3.6; p=0.41) at the end of the follow-up period." } : section);
    const digest = studyDigest(view(readAttributes(document("abstract", mixed))));
    expect(digest.effect).toBe("HR 0.50");
  });

  it("an implausible ratio is dropped, and a follow-up sentence is not an endpoint", () => {
    const broken = [
      { label: "METHODS", text: "Patients were followed up for a median of 1·4 years (IQR 0·7-2·3) in this registry of adults with atrial fibrillation." },
      { label: "RESULTS", text: "The hazard ratio was 0 in the subgroup because no events occurred during the follow-up period of the registry." },
    ];
    const digest = studyDigest(view(readAttributes(document("abstract", broken))));
    expect(digest.effect).toBeNull();
    expect(digest.endpoint).toBeNull();
  });
});

describe("one compact answer", () => {
  it("study: effect from the text in the headline, the rest as trust, practice and limitations", () => {
    const answer = buildResearchAnswer(run(), [view(readAttributes(document("abstract")))]);
    expect(answer.kind).toBe("study");
    expect(answer.headline).toContain("HR 0.74; 95% ДИ 0.65–0.85; p < 0.001");
    expect(answer.trust.join(" ")).toContain("только аннотация — 1");
    expect(answer.practice).toContain("не превращает их в рекомендацию");
    expect(answer.limitations.join(" ")).toContain("только аннотации");
  });

  it("an effect the text does not state stays empty and is named as a limitation", () => {
    const noEffect = SYNTHETIC_ABSTRACT.map(section => section.label === "RESULTS" ? { ...section, text: "The primary outcome occurred less often in the drug X group over the follow-up period of the study." } : section);
    const answer = buildResearchAnswer(run(), [view(readAttributes(document("abstract", noEffect)))]);
    expect(answer.studies[0].effect).toBeNull();
    expect(answer.headline).toContain("Величину эффекта в тексте найти не удалось");
    expect(answer.limitations.join(" ")).toContain("величина эффекта в тексте не найдена");
  });

  it("PubMed down: no study, no success claim", () => {
    const answer = buildResearchAnswer(run({ resultIds: [], toolsUsed: [{ tool: "searchPubmed", connectorIds: ["pubmed"], modes: ["LIVE"], status: "unavailable", itemCount: 0, durationMs: 1, note: "PubMed сейчас недоступен" }] as AgentRun["toolsUsed"] }), []);
    expect(answer.kind).toBe("unavailable");
    expect(answer.studies).toHaveLength(0);
    expect(answer.headline).toContain("разбор не выполнен");
  });

  it("blocked by the safety gate: says why, shows nothing else", () => {
    const answer = buildResearchAnswer(run({ status: "blocked", riskNotices: ["Запрос похож на экстренную ситуацию"] }), []);
    expect(answer.kind).toBe("blocked");
    expect(answer.studies).toHaveLength(0);
  });

  it("renders the main answer first, quotes in the original language, no pictures", () => {
    const html = renderToStaticMarkup(<ResearchAnswerView run={run()} results={[view(readAttributes(document("abstract")))]} />);
    expect(html.indexOf("ws-ra-headline")).toBeLessThan(html.indexOf("ws-ra-studies"));
    expect(html.indexOf("ws-ra-studies")).toBeLessThan(html.indexOf("Почему этому можно доверять"));
    expect(html).toContain('lang="en"');
    expect(html).not.toContain("<img");
    expect(html).toContain('href="https://pubmed.ncbi.nlm.nih.gov/31535829/"');
  });

  it("design labels come only from PubMed publication types", () => {
    expect(designLabel("Journal Article")).toBeNull();
    expect(designLabel("Meta-Analysis, Systematic Review")).toBe("метаанализ, систематический обзор");
  });
});

describe("the portal input runs the same research scenario", () => {
  const SESSION = "agent-mvp-research";
  beforeEach(async () => {
    vi.stubEnv("PUBMED_DISABLED", "1");
    resetMemorySession(SESSION);
    await ensureSession(SESSION);
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("applies the scenario settings before retrieval and reports an unavailable source honestly", async () => {
    const { run: created, job } = await createAskRun(SESSION, "cardiology", "Разбери статью PMID 31535829");
    expect(job).toBe("research");
    expect(created.agentId).toBe("research");
    expect(created.input.text).toContain("PMID 31535829");
    const outcome = await executeAskRun(SESSION, "cardiology", created.id);
    expect(outcome).not.toBeNull();
    const stored = await workspaceStore().getRun(SESSION, created.id);
    expect(stored?.plan[0]?.id).toBe("research-retrieval-policy");
    expect(stored?.plan[0]?.detail).toContain("Что получить: краткий обзор");
    expect(stored?.synthesis).toMatch(/PubMed недоступен/u);
    expect(buildResearchAnswer(stored!, []).kind).toBe("unavailable");
  });

  it("the answer depth chosen in the input reaches execution", async () => {
    expect(researchOptionsForAnswerMode("short").mode).toBe("articles");
    expect(researchOptionsForAnswerMode("research").mode).toBe("academic");
    const { run: created } = await createAskRun(SESSION, "cardiology", "Какие данные о ПОАК у пожилых с фибрилляцией предсердий?", { answerMode: "short" });
    await executeAskRun(SESSION, "cardiology", created.id);
    const stored = await workspaceStore().getRun(SESSION, created.id);
    expect(stored?.agentId).toBe("research");
    expect(stored?.plan[0]?.detail).toContain("Что получить: найти статьи");
  });
});

describe("out of scope and unsafe input", () => {
  it("masks the whole patient name, not only the surname", () => {
    const decision = checkInputRisk("Пациент Иванов Иван Петрович, 67 лет, разбери исследование DAPA-HF для него");
    expect(decision.sanitizedText).not.toMatch(/Иванов|Иван|Петрович/u);
    expect(decision.sanitizedText).toContain("Пациент [ФИО]");
    expect(checkInputRisk("Пациентка Петрова, 54 года").sanitizedText).toBe("Пациентка [ФИО], 54 года");
  });

  it("stops an acute state of a described patient and an image read, keeps a general question", () => {
    expect(checkInputRisk("Пациент без сознания, не дышит, разбери исследование по реанимации").allowed).toBe(false);
    expect(checkInputRisk("Посмотри ЭКГ моего пациента и разбери исследование").allowed).toBe(false);
    expect(checkInputRisk("Какие исследования есть по сердечно-лёгочной реанимации при остановке сердца?").allowed).toBe(true);
  });

  it("request words, placeholders and ages are not catalog topics", () => {
    expect(researchTopicQuery("Как приготовить борщ? разбор исследований")).toBe("Как приготовить борщ");
    expect(researchTopicQuery("Пациент [ФИО], 67 лет, СНИЛС [SNILS], разбери исследование DAPA-HF для него")).toBe("СНИЛС DAPA-HF для");
  });

  it("an off-topic question finds nothing instead of loosely matching catalog items", async () => {
    const result = await EXECUTORS.research(await testContext({ agentId: "research", topics: [], text: "Как приготовить борщ? разбор исследований", pubmed: fakePubmed([]) }));
    expect(result.drafts).toHaveLength(0);
    const onTopic = await EXECUTORS.research(await testContext({ agentId: "research", topics: [], text: "Какие данные о ПОАК у пожилых с фибрилляцией предсердий?", pubmed: fakePubmed([]) }));
    expect(onTopic.drafts.length).toBeGreaterThan(0);
  });
});
