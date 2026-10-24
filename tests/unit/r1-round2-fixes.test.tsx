import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined }),
  usePathname: () => "/cardiology/ask",
  useSearchParams: () => new URLSearchParams(),
}));
import { detectRiskSignals, PATIENT_DOSE_LINE } from "@/lib/agents/risk-rules";
import { buildResearchAnswer, SECONDARY_ANALYSIS } from "@/lib/agents/research-answer";
import { normalizeResearchStudy } from "@/lib/agents/research-study-normalization";
import type { AgentResultView, AgentRun } from "@/lib/agents/types";
import { redactDirectIdentifiers } from "@/lib/clinical-case/anonymizer";
import type { SpecialtyId } from "@/lib/domain/types";
import { compileExperience, EJECTION_FRACTION_SIGNAL, labelIndicationNote, PATIENT_DOSE_SIGNAL } from "@/lib/mesh/compiler";
import type { EvidenceGraph } from "@/lib/mesh/evidence";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { planSources } from "@/lib/mesh/planner";
import { askedSections } from "@/lib/mesh/refine";
import { excludedJournalsGap } from "@/lib/mesh/source-preferences";
import { runOutcome } from "@/lib/portal/run-outcome";
import { ExperienceView } from "@/components/experience/experience-view";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { cleanSection } from "@/server/agents/adapters/openfda";
import type { PubmedArticle } from "@/server/agents/adapters/pubmed";
import type { PubmedAbstract } from "@/server/agents/adapters/pubmed-abstracts";
import { materialFromAnswer } from "@/server/agents/services/material";
import { deidentify } from "@/server/agents/services/risk";
import * as tools from "@/server/agents/tools";
import { bindResearchRunOptions } from "@/server/agents/services/research-runtime-policy";
import { DEFAULT_RESEARCH_RUN_OPTIONS } from "@/lib/agents/research-options";
import { resetBrowserToolState } from "@/server/mesh/browser/tool";
import { executePlan } from "@/server/mesh/execute";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { fakeAbstracts, fakeArticle, fakePubmed, profileWith, testContext } from "./agent-test-utils";
import { acceptanceGraph, FixtureDriver, HFPEF_ABSTRACT, HFPEF_REVIEW, registryStatuses } from "./mesh-test-utils";
import { compileWithSkill } from "@/lib/mesh/skill-compile";
import { skillById } from "@/lib/mesh/skills/registry";
import { flowById } from "@/lib/mesh/flows/registry";

/**
 * R1, re-review round 2 on dea13b5: the P0/P1 findings of reviewers A, B and C that the round-1 fixes left open or
 * caused (docs/ux-remediation/R1_REVIEW_LEDGER.md, «Раунд 2»).
 */

beforeEach(() => resetBrowserToolState());

function view(run: AgentRun, experience: NonNullable<AgentRun["experience"]>, results: AgentResultView[] = []) {
  return renderToStaticMarkup(<WorkspaceProvider specialty="cardiology"><ExperienceView run={run} experience={experience} results={results} /></WorkspaceProvider>).replace(/ /gu, " ");
}

function runOf(text: string, extra: Partial<AgentRun> = {}): AgentRun {
  return { id: "run-r2", agentId: "reference", specialty: "cardiology", trigger: "composer", startedAt: "2026-10-24T00:00:00.000Z", completedAt: "2026-10-24T00:00:01.000Z", status: "completed", input: { text, preferenceDigest: "" }, intent: "answer", plan: [], toolsUsed: [], resultIds: [], newResultCount: 0, error: null, durationMs: 1, riskNotices: [], synthesis: null, ...extra } as unknown as AgentRun;
}

async function compiled(text: string, specialty: SpecialtyId, args: { job: string; signals?: string[]; articles?: PubmedArticle[]; abstracts?: PubmedAbstract[] }) {
  const registry = createSourceRegistry({ browserDriver: new FixtureDriver(), site: { minIntervalMs: 0 } });
  const intent = compileIntent(text, specialty);
  const ctx = await testContext({ agentId: "reference", topics: [], specialty, text, job: args.job as never, pubmed: fakePubmed(args.articles ?? []), abstracts: fakeAbstracts(args.abstracts ?? []) });
  const statuses = await registryStatuses(registry);
  const plan = planSources({ intent, sources: descriptors(registry), statuses });
  const execution = await executePlan({ plan, intent, registry, ctx, sessionId: `r2-${text}` });
  const graph = buildEvidenceGraph({ id: `graph-r2-${text}`, intent, plan, results: execution.results, descriptors: descriptors(registry), statuses, now: ctx.nowIso });
  const output = compileExperience({ graph, user: { signals: args.signals ?? ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario, resultKeys: {} });
  const experience = { intentId: "i", manifest: output.manifest, graph, plan: { id: "p", steps: 1, invocations: 1, reused: false } };
  return { graph, output, experience };
}

describe("C N-2 / N-3: identifiers outside the round-1 patterns", () => {
  const PHRASES: ReadonlyArray<[string, RegExp]> = [
    ["Кузнецову Петру Ивановичу, Ленинский проспект 32, кв 7: апиксабан при ХБП", /Кузнецов|Петру|Иванович|Ленинский|32|кв 7/u],
    ["пр. Мира 12-45, апиксабан при ХБП", /Мира|12-45/u],
    ["Ленина 5-3, Иванов: дозирование апиксабана", /Ленина|5-3|Иванов/u],
    ["Пациент родился 12 марта 1956 г., ХСН", /12 марта|1956/u],
    ["Сидорова 72 лет: ФП и антикоагуляция", /Сидоров/u],
    ["Пациентка Петрова Анна Сергеевна, 70 лет: ХСН", /Петров|Анна|Сергеевна/u],
    ["Анне Сергеевне Петровой назначен варфарин", /Анне|Сергеевне|Петровой/u],
  ];

  it("the question path masks each of the reviewer's phrases", () => {
    for (const [phrase, leak] of PHRASES) {
      const masked = deidentify(phrase);
      expect(masked.text, phrase).not.toMatch(leak);
      expect(masked.redactions.length, phrase).toBeGreaterThan(0);
    }
    // What the question asks about stays.
    expect(deidentify(PHRASES[0][0]).text).toBe("[ФИО], [АДРЕС]: апиксабан при ХБП");
    expect(deidentify(PHRASES[4][0]).text).toBe("[ФИО] 72 лет: ФП и антикоагуляция");
  });

  it("clinical wording is not taken for a name or an address", () => {
    for (const text of ["Креатинина 80-120 мкмоль/л у пожилых", "Шкала 0-10 при болевом синдроме", "Стадия 2-3 ХБП: апиксабан", "Варфарин и аспирин: взаимодействие", "Patient Reported Outcomes при ХСН", "Иванова 2023: метаанализ", "Аторвастатин 10 или 20 мг", "ESC 2024 и РКО 2020: ХСН"]) {
      expect(deidentify(text).text, text).toBe(text);
    }
  });

  it("the de-identification tool uses the same name rules as the question (no «Готово» with a name left)", () => {
    const file = "Пациентка Петрова Анна Сергеевна, 1950 г.р.\nИванов И.И., 1956 г.р., ул. Ленина д. 5 кв. 3\nКузнецову Петру Ивановичу, Ленинский проспект 32, кв 7";
    const result = redactDirectIdentifiers(file);
    expect(result.redactedText).not.toMatch(/Петров|Кузнецов|Иванов|Ленин/u);
    expect(result.counts.fio).toBe(3);
  });
});

describe("C N-5: a dose for a described patient in other wordings", () => {
  it("the reviewer's three phrases are patient-specific prescribing; populations are not", () => {
    for (const text of ["Дозировка бисопролола у мужчины 58 лет с ФВ 30%", "Пожилой пациент с КК 25: сколько апиксабана давать?", "Старик 82 лет весом 58 кг — какая доза апиксабана?"]) {
      expect(detectRiskSignals(text), text).toMatchObject({ prescribing: true, patientSpecific: true });
    }
    for (const text of ["Бисопролол: дозирование", "Апиксабан у пожилых: дозирование", "Дозирование апиксабана у женщин 50 лет", "Пожилые пациенты с ФП: антикоагуляция", "Сколько длится ДАТТ после ЧКВ"]) {
      expect(detectRiskSignals(text), text).toMatchObject({ prescribing: false, patientSpecific: false });
    }
  });

  it("a US label read for a condition its indications do not name says so", () => {
    const graph = {
      context: { nosology: "cardiology/heart_failure", subtype: null, drugs: ["bisoprolol"] },
      documents: [{ id: "openfda:df37d337", kind: "drug_label", jurisdiction: "US" }],
      claims: [{ id: "c1", documentId: "openfda:df37d337", kind: "indication", statement: "Bisoprolol fumarate tablets are indicated in the management of hypertension." }],
    } as unknown as EvidenceGraph;
    expect(labelIndicationNote(graph, { signals: [] })).toMatch(/^Среди показаний в инструкции США \(FDA\) этого состояния нет \(«Хроническая сердечная недостаточность»\)/u);
    // «ФВ 30%» without the disease's name is the same question.
    const byFraction = { ...graph, context: { ...graph.context, nosology: null } } as EvidenceGraph;
    expect(labelIndicationNote(byFraction, { signals: [] })).toBeNull();
    expect(labelIndicationNote(byFraction, { signals: [EJECTION_FRACTION_SIGNAL] })).toMatch(/этого состояния нет/u);
    // A label indicated for the asked condition says nothing.
    const hypertension = { ...graph, context: { ...graph.context, nosology: "cardiology/arterial_hypertension" } } as EvidenceGraph;
    expect(labelIndicationNote(hypertension, { signals: [] })).toBeNull();
  });
});

describe("A №2 / B N-1 / C N-4, N-7: a dose asked for a described patient", () => {
  const TEXT = "Мой пациент 67 лет: какую дозу эмпаглифлозина назначить при ХСН?";

  it("the compiler leaves dosing out of «Коротко»; the card keeps the section, closed, as reference; no loop", async () => {
    const plain = await compiled(TEXT, "cardiology", { job: "drug", articles: [HFPEF_REVIEW], abstracts: [HFPEF_ABSTRACT] });
    const plainTakeaway = plain.output.manifest.modules.find(entry => entry.family === "key_takeaway")!;
    // Without the signal the dosing section is part of «Коротко»: the signal is what removes it.
    expect(plainTakeaway.claimIds.some(id => plain.graph.claims.find(claim => claim.id === id)?.kind === "dosing")).toBe(true);

    const { graph, output, experience } = await compiled(TEXT, "cardiology", { job: "drug", signals: ["specialty", PATIENT_DOSE_SIGNAL], articles: [HFPEF_REVIEW], abstracts: [HFPEF_ABSTRACT] });
    const takeaway = output.manifest.modules.find(entry => entry.family === "key_takeaway")!;
    expect(takeaway.claimIds.some(id => graph.claims.find(claim => claim.id === id)?.kind === "dosing")).toBe(false);
    expect(takeaway.props.patientDose).toBe(true);
    expect(output.manifest.personalization.signals).toContain(PATIENT_DOSE_SIGNAL);

    const html = view(runOf(TEXT), experience);
    expect(html.match(/data-module="key_takeaway"[\s\S]*?<\/section>/u)?.[0] ?? "").toContain(PATIENT_DOSE_LINE);
    expect(html).toMatch(/<details class="pt-widened" data-dose-reference="true"><summary>Справочно: раздел инструкции о дозировании/u);
    const dosing = html.match(/<section id="[^"]*-dosing" class="pt-drug-section"[\s\S]*?<\/section>/u)?.[0] ?? "";
    expect(dosing).toContain('data-dose-reference="true"');
    expect(dosing).not.toMatch(/выше, в «Коротко»/u);
  });

  it("«Сохранить ответ» keeps what the screen shows: no dosing claim, and the line that the dose is not chosen", async () => {
    const { graph, experience } = await compiled(TEXT, "cardiology", { job: "drug", signals: ["specialty", PATIENT_DOSE_SIGNAL], articles: [HFPEF_REVIEW], abstracts: [HFPEF_ABSTRACT] });
    const material = materialFromAnswer({ ...runOf(TEXT), experience } as AgentRun, "2026-10-24T00:00:00.000Z");
    expect(material.text).toMatch(/Дозу для описанного пациента не подбираем/u);
    for (const claim of graph.claims.filter(item => item.kind === "dosing")) expect(material.text).not.toContain(claim.statement.slice(0, 80));
  });
});

describe("B №4 (rest): the review's own filters left nowhere to search", () => {
  it("PubMed excluded and the catalog emptied by «Только международные»: «Проверка не выполнялась», never «проверено»", () => {
    const run = runOf("Дапаглифлозин при ХСН с сохранённой фракцией выброса", {
      agentId: "research",
      toolsUsed: [
        { tool: "searchMedical", status: "ok", note: "Каталог специальности пропущен: при фильтре разбора «только международные» в нём нет материалов", durationMs: 1, connectorIds: ["catalog"] },
        { tool: "searchPubmed", status: "unavailable", note: "PubMed исключён в вашем профиле", durationMs: 1, connectorIds: ["pubmed"] },
      ],
    } as Partial<AgentRun>);
    const outcome = runOutcome(run);
    expect(outcome).toMatchObject({ kind: "not_run", label: "Проверка не выполнялась", sourcesLink: true });
    expect(outcome.note).toMatch(/PubMed исключён в вашем профиле; каталог специальности пропущен: при фильтре разбора «только международные» в нём нет материалов — включите его в источниках профиля или смените фильтр разбора/u);
  });

  it("the catalog tool says it was skipped when the filters leave none of it (the cardiology catalog is РКО/РКЖ only)", async () => {
    const ctx = await testContext({ agentId: "research", topics: ["hf"], profile: profileWith("cardiology", ["hf"]), text: "Дапаглифлозин при ХСН" });
    expect(ctx.catalog.content.length).toBeGreaterThan(0);
    bindResearchRunOptions(ctx.profile, { ...DEFAULT_RESEARCH_RUN_OPTIONS, sourceScope: "international" });
    const out = await tools.searchMedical(ctx, { query: "дапаглифлозин", topics: ["hf"] });
    expect(out.items).toEqual([]);
    expect(out.use).toMatchObject({ status: "ok", note: "Каталог специальности пропущен: при фильтре разбора «только международные» в нём нет материалов" });
  });
});

describe("A №3, №7 / B N-5 / C N-9, N-10: an excluded journal is named, and is not «нет в списке»", () => {
  it("the mesh note becomes one line of «Чего не хватает» with the journal's name", () => {
    expect(excludedJournalsGap("1 документ; скрыты публикации журналов, исключённых в ваших источниках (The Lancet): 1")).toBe("The Lancet — исключён в ваших источниках: публикации журнала не показываем (скрыто: 1)");
    expect(excludedJournalsGap("журналы, исключённые в ваших источниках, не показываем: The Lancet, NEJM")).toBe("The Lancet, NEJM — исключены в ваших источниках: публикации этих журналов не показываем");
    expect(excludedJournalsGap("PubMed не ответил вовремя")).toBeNull();
  });

  it("a reused answer still names the excluded journal", async () => {
    const { graph } = await compiled("Эмпаглифлозин при ХСН с сохранённой ФВ — обзоры", "cardiology", { job: "answer", articles: [HFPEF_REVIEW], abstracts: [HFPEF_ABSTRACT] });
    expect(graph.gaps.join(" | ")).not.toMatch(/The Lancet/u);
    const profile = profileWith("cardiology", []);
    profile.interests.excludedSources = ["lancet"];
    const ctx = await testContext({ agentId: "research", topics: [], profile, text: "ЧКВ или АКШ при поражении ствола левой коронарной артерии", pubmed: fakePubmed([{ ...fakeArticle("41936369", "PCI versus CABG for left main disease"), journal: "Eur Heart J" }]) });
    const found = await tools.searchPubmed(ctx, { term: "left main", journals: tools.trustedJournals(ctx) });
    // Nothing was hidden after the search, and the exclusion is still said.
    expect(found.use.note).toBe("исключены в вашем профиле и в поиск не входили: The Lancet");
    expect(tools.listedJournals(ctx).some(journal => /^lancet$/iu.test(journal))).toBe(true);
    expect(tools.trustedJournals(ctx).some(journal => /^lancet$/iu.test(journal))).toBe(false);
  });

  it("the review's «Ограничения» name the journal kept out of the search", () => {
    const result = { id: "r1", key: "r1", agentId: "research", specialty: "cardiology", kind: "research_finding", category: "study", title: "PCI versus CABG for left main disease", summary: "", reasonShown: [], observedAt: "2024-01-01", evidence: [], source: { connectorId: "pubmed", source: "PubMed", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/41936369/" }, actions: [], attributes: { journal: "Eur Heart J", "authorsConclusion.text": "PCI and CABG had similar outcomes in left main disease.", "evidenceText.access": "abstract" }, partner: null, rank: 1, createdAt: "2026-10-24T00:00:00.000Z", runId: "run-r2" } as unknown as AgentResultView;
    const run = runOf("ЧКВ или АКШ при поражении ствола левой коронарной артерии", { agentId: "research", toolsUsed: [{ tool: "searchPubmed", status: "ok", note: "исключены в вашем профиле и в поиск не входили: The Lancet", durationMs: 1, connectorIds: ["pubmed"] }] } as Partial<AgentRun>);
    const answer = buildResearchAnswer(run, [result]);
    expect(answer.limitations).toContain("В поиск не входили журналы, исключённые в вашем профиле: The Lancet.");
    expect(answer.limitations.join(" ")).not.toMatch(/Журнала нет в списке/u);
  });
});

describe("A №5 (rest), A №6 (rest): study answers", () => {
  it("a pooled or secondary analysis that names the trial is not its main publication", () => {
    expect(SECONDARY_ANALYSIS.test("Dapagliflozin across the range of ejection fraction: pooled analysis from the DAPA-HF and DELIVER trials")).toBe(true);
    expect(SECONDARY_ANALYSIS.test("Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction (DAPA-HF)")).toBe(false);
    const pooled = { id: "p1", key: "p1", agentId: "research", specialty: "cardiology", kind: "research_finding", category: "study", title: "Dapagliflozin across the range of ejection fraction: participant-level pooled analysis from the DAPA-HF and DELIVER trials", summary: "", reasonShown: [], observedAt: "2022-01-01", evidence: [], source: { connectorId: "pubmed", source: "PubMed", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/1/" }, actions: [], attributes: { journal: "Nat Med", "authorsConclusion.text": "Dapagliflozin reduced events across the range of ejection fraction.", "researchStudy.effectEstimate.value": "HR 0.74; 95% ДИ 0.56–0.97" }, partner: null, rank: 1, createdAt: "2026-10-24T00:00:00.000Z", runId: "run-r2" } as unknown as AgentResultView;
    const run = runOf("Исследование DAPA-HF: основной результат", { agentId: "research", toolsUsed: [{ tool: "searchPubmed", status: "ok", note: null, durationMs: 1, connectorIds: ["pubmed"] }] } as Partial<AgentRun>);
    expect(buildResearchAnswer(run, [pooled]).headline).toMatch(/^Основную публикацию «DAPA-HF» не нашли/u);
  });

  it("«Конечная точка» is a sentence that defines the endpoint, never a result or a discussion of outcomes", () => {
    const field = (value: string) => normalizeResearchStudy({ access: "abstract", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/1/", fields: { endpoint: { value, supportText: value, section: "RESULTS", confidence: 0.8 } } })?.fields.endpoint ?? null;
    expect(field("Empagliflozin reduced the risk of cardiovascular death or hospitalization for heart failure by 21%.")).toBeNull();
    expect(field("Win statistics offer a new approach to the analysis of outcomes in cardiovascular trials.")).toBeNull();
    expect(field("The primary outcome was a composite of cardiovascular death or hospitalization for heart failure.")?.value).toMatch(/composite of cardiovascular death/u);
  });
});

describe("P0 scenario 3 (rest): one conclusion is shown once; a work without a conclusion is judged by its title", () => {
  function review(pmid: string, title: string, conclusion: string | null, sortDate: string): { article: PubmedArticle; abstract: PubmedAbstract } {
    return {
      article: { ...fakeArticle(pmid, title), journal: "Cochrane Database Syst Rev", publicationTypes: ["Systematic Review"], sortDate },
      abstract: { pmid, sections: conclusion ? [{ label: "AUTHORS' CONCLUSIONS", text: conclusion }] : [{ label: "BACKGROUND", text: "Background only." }], conclusion, conclusionLabel: conclusion ? "AUTHORS' CONCLUSIONS" : null } as PubmedAbstract,
    };
  }

  it("Parkinson: the 2023 version of a review with the same conclusion as its 2024 update is not printed again", async () => {
    const text = "Levodopa remains the most effective symptomatic treatment for Parkinson disease.";
    const items = [review("38588457", "Treatment of Parkinson's disease: a Cochrane review", text, "2024-01-01"), review("36602886", "Treatment of Parkinson's disease: a Cochrane review", text, "2023-01-01")];
    const { experience } = await compiled("Лечение болезни Паркинсона", "neurology", { job: "answer", articles: items.map(item => item.article), abstracts: items.map(item => item.abstract) });
    const html = view(runOf("Лечение болезни Паркинсона", { specialty: "neurology" } as Partial<AgentRun>), experience);
    expect(html.split(text).length - 1).toBe(1);
  });

  it("endocarditis: a burden study without a read conclusion that never names the disease is not «По условиям поиска»", async () => {
    const burden = review("39000021", "Burden of cardiovascular disease in postmenopausal women, 1990-2040: a systematic analysis", null, "2024-03-01");
    const { experience } = await compiled("Профилактика инфекционного эндокардита", "cardiology", { job: "answer", articles: [burden.article], abstracts: [burden.abstract] });
    const html = view(runOf("Профилактика инфекционного эндокардита"), experience);
    expect(html).toMatch(/Burden of cardiovascular disease|Систематический обзор/u);
    expect(html).not.toMatch(/По условиям поиска/u);
  });

  it("a question with a disease: a work without a conclusion whose title never names it is marked off the question", async () => {
    const burden = review("39000022", "Burden of cardiovascular disease in postmenopausal women, 1990-2040: a systematic analysis", null, "2024-03-01");
    const { graph, experience } = await compiled("Фибрилляция предсердий: антикоагуляция у пожилых", "cardiology", { job: "answer", articles: [burden.article], abstracts: [burden.abstract] });
    expect(graph.context.nosology).toBe("cardiology/atrial_fibrillation");
    const html = view(runOf("Фибрилляция предсердий: антикоагуляция у пожилых"), experience);
    expect(html).toMatch(/Тема вопроса в выводе не названа/u);
    expect(html).not.toMatch(/По условиям поиска/u);
  });
});

describe("C N-1 (openFDA): a cut label section fits the source's excerpt limit with its «…»", () => {
  it("never 901 characters for a limit of 900", () => {
    const long = Array.from({ length: 80 }, (_, index) => `Sentence number ${index} about renal impairment and dose`).join(" ");
    const noStops = "a".repeat(2000);
    for (const raw of [long, noStops]) {
      const cut = cleanSection(raw, 900);
      expect(cut.truncated).toBe(true);
      expect(cut.text.length).toBeLessThanOrEqual(900);
      expect(cut.text.endsWith("…")).toBe(true);
    }
  });
});

describe("A round 2 №5: «no previous version» is said once", () => {
  it("the view line says it; the skill line and the versions module do not repeat it", async () => {
    const { graph, registry, intent } = await acceptanceGraph();
    const base = { user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario, resultKeys: {} };
    const skill = skillById("cardiology.guideline_change")!;
    const shaped = compileWithSkill(base, graph, skill, flowById(skill.flowId));
    const manifest = { ...shaped.output.manifest, view: { ...(shaped.output.manifest.view ?? { jurisdiction: null, since: null, focus: [], expandedDocumentId: null }), comparison: "previous_version" as const }, modules: shaped.output.manifest.modules.map(entry => entry.family === "recommendation_delta" ? { ...entry, props: { ...entry.props, comparison: "current_state" } } : entry) };
    const html = view(runOf("Что изменилось в рекомендациях по ФП?"), { intentId: "i", manifest: manifest as never, graph: shaped.graph, plan: { id: "p", steps: 1, invocations: 1, reused: false } });
    expect(html.match(/[Пп]редыдущую версию не нашли|[Пп]редыдущая версия[^<]{0,40}не указана/gu) ?? []).toHaveLength(1);
  });
});

describe("C-4 (rest): CKD wordings switch the instruction's population focus on", () => {
  it("«при ХБП», «КК 25 мл/мин», «на гемодиализе» name the renal population", () => {
    for (const text of ["апиксабан при ХБП", "Апиксабан при ХБП: дозирование", "Апиксабан при КК 25 мл/мин: дозирование", "Апиксабан на гемодиализе", "Ривароксабан при СКФ 30: противопоказания"]) {
      expect(askedSections(text), text).toContain("populations");
    }
    expect(askedSections("Аторвастатин: противопоказания")).toEqual(["contraindications"]);
  });
});

describe("A round 2 №3, №4: what the question names decides what answers it", () => {
  it("«ствол левой коронарной артерии» is a searched concept, not «Не учтено»", () => {
    const intent = compileIntent("ЧКВ или АКШ при поражении ствола левой коронарной артерии", "cardiology");
    expect(intent.entities.concepts.map(concept => concept.id)).toContain("concept:left_main");
  });

  it("a guideline publication on another disease is not a version of the asked guideline", async () => {
    const { graph, registry, intent } = await acceptanceGraph();
    expect(graph.context.nosology).toBe("cardiology/heart_failure");
    const template = graph.documents.find(document => document.sourceId === "pubmed")!;
    const af = { ...template, id: "pubmed:af-guideline", kind: "guideline_publication" as const, title: "2023 ACC/AHA/ACCP/HRS Guideline for the Diagnosis and Management of Atrial Fibrillation", attributes: { ...template.attributes, pmid: "38033089", questionMatch: "all_conditions", originalTitle: "2023 ACC/AHA/ACCP/HRS Guideline for the Diagnosis and Management of Atrial Fibrillation" } };
    const withAf = { ...graph, documents: [...graph.documents, af] };
    const { manifest } = compileExperience({ graph: withAf, user: { signals: ["specialty"], topics: [] }, modules: intent.modules, policy: { descriptors: descriptors(registry) }, scenario: intent.context.scenario, resultKeys: {} });
    const delta = manifest.modules.find(entry => entry.family === "recommendation_delta");
    expect(delta).toBeDefined();
    expect(delta!.documentIds).not.toContain(af.id);
  });
});
