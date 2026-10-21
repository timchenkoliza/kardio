import { countLabel } from "@/lib/agents/format";
import { stableId, truncate } from "@/lib/agents/text";
import type { Evidence } from "@/lib/agents/types";
import { conceptsIn, drugsIn, latinTermsIn, pubmedBroadTermFor, pubmedCoreTermFor, pubmedTermFor, type DrugEntry } from "@/lib/portal/lexicon";
import { entrezDate, type PubmedArticle } from "./adapters/pubmed";
import type { DrugLabel } from "./adapters/openfda";
import type { PubmedAbstract } from "./adapters/pubmed-abstracts";
import type { AgentContext } from "./context";
import type { ResultDraft } from "./drafts";
import { finishWithChecks, PlanBuilder, type ExecutorResult } from "./plan";
import { drugChangesForDrugs } from "./services/drug-change";
import { catalogProvenance, evidenceFromCatalog, evidenceFromPubmed, evidenceFromQuote, pubmedProvenance } from "./services/evidence";
import { factCheck } from "./services/fact-check";
import { approvedJournals } from "./services/source-policy";
import * as tools from "./tools";

/**
 * Reference capability: the portal's default job (~47% of physician requests).
 *
 * The answer is built only from what sources state:
 *  - conclusions of recent systematic reviews, meta-analyses and guidelines,
 *    quoted verbatim from PubMed abstracts (journals approved by physicians first);
 *  - for a drug, verbatim sections of the current FDA label (openFDA) and any
 *    regulatory signal the curated snapshot holds about that drug.
 * Nothing is paraphrased, translated as fact or extended. No patient-specific
 * therapy is selected; prescribing wording is reframed by the input risk gate.
 */

export const REFERENCE_PUBLICATION_TYPES = ["Systematic Review", "Meta-Analysis", "Practice Guideline", "Guideline"];
const REFERENCE_YEARS = 6;
const MAX_ANSWERS = 5;

function yearOf(article: PubmedArticle): string | null {
  return article.sortDate?.slice(0, 4) ?? article.pubDate?.match(/\d{4}/)?.[0] ?? null;
}

function studyType(article: PubmedArticle): string {
  const types = article.publicationTypes;
  if (types.some(type => /guideline/i.test(type))) return "Клинические рекомендации";
  if (types.includes("Meta-Analysis")) return "Метаанализ";
  if (types.includes("Systematic Review")) return "Систематический обзор";
  return "Обзор";
}

/** English words a concept's PubMed term searches for (field tags, operators and wildcards removed). */
export function termWords(term: string): string[] {
  return term
    .replace(/\[[a-z]+\]/giu, " ")
    .replace(/\b(?:AND|OR|NOT)\b/gu, " ")
    .replace(/[()"*]/gu, " ")
    .split(/\s+/u)
    .map(word => word.toLowerCase())
    .filter(word => word.length >= 4 && !/^(?:with|from|that|this)$/u.test(word));
}

/**
 * PubMed relevance still returns reviews that mention a condition only in
 * passing (e.g. headache as a side effect). Articles whose title names one of
 * the question's subjects come first; when at least two do, the rest are
 * dropped as tangential.
 */
export function rerankByTitle<T extends { title: string }>(articles: readonly T[], subjectTerms: readonly string[]): T[] {
  if (!subjectTerms.length) return [...articles];
  const groups = subjectTerms.map(termWords).filter(words => words.length);
  const hits = (title: string) => {
    const value = title.toLowerCase();
    return groups.filter(words => words.some(word => value.includes(word.replace(/s$/u, "")))).length;
  };
  const scored = articles.map((article, index) => ({ article, index, hits: hits(article.title) }));
  const onTopic = scored.filter(item => item.hits > 0);
  const pool = onTopic.length >= 2 ? onTopic : scored;
  return pool.sort((a, b) => b.hits - a.hits || a.index - b.index).map(item => item.article);
}

function sectionsForQuestion(label: DrugLabel, populations: readonly string[], drugJob: boolean): DrugLabel["sections"] {
  const wanted = new Set<string>(["boxed_warning", "recent_major_changes", "indications_and_usage", "contraindications", "warnings_and_cautions"]);
  if (drugJob) { wanted.add("dosage_and_administration"); wanted.add("drug_interactions"); }
  if (populations.includes("pregnancy") || populations.includes("lactation")) wanted.add("pregnancy");
  if (populations.includes("children")) wanted.add("pediatric_use");
  return label.sections.filter(section => wanted.has(section.id)).slice(0, 7);
}

function labelDraft(ctx: AgentContext, drug: DrugEntry, label: DrugLabel, populations: readonly string[], retrievedAt: string): ResultDraft {
  const sections = sectionsForQuestion(label, populations, ctx.job === "drug");
  const evidence: Evidence[] = sections.map(section => factCheck(evidenceFromQuote({
    connectorId: "openfda-labels",
    sourceName: `Инструкция FDA · ${section.ru}`,
    sourceUrl: label.dailyMedUrl,
    publisher: label.manufacturer ?? "U.S. Food and Drug Administration",
    retrievedAt,
    publishedAt: label.effectiveDate,
    claim: section.text,
    quote: section.text,
    quoteLanguage: "en",
    quoteKind: "verbatim",
    level: "regulatory",
    secondary: false,
    verifyIn: null,
    version: label.version ? `версия ${label.version}` : null,
    dataOrigin: "runtime_api",
  })));
  const brands = label.brandNames.length ? label.brandNames.join(", ") : null;
  return {
    key: stableId("drug-label", label.setId, ctx.job ?? "answer"),
    agentId: ctx.agentId,
    specialty: ctx.specialty,
    kind: "drug_label",
    category: "fda_label",
    title: `${drug.ru[0].toLocaleUpperCase("ru-RU")}${drug.ru.slice(1)} (${label.genericName || drug.inn}): инструкция FDA`,
    summary: [brands ? `Торговые названия в США: ${brands}` : null, label.effectiveDate ? `инструкция от ${label.effectiveDate}` : null, label.route.length ? label.route.join(", ").toLowerCase() : null].filter(Boolean).join(" · "),
    reasonShown: [`Препарат из вашего вопроса: ${drug.ru}`, "Инструкция США, не российская: сверьте с ГРЛС"],
    observedAt: label.effectiveDate,
    evidence,
    source: { connectorId: "openfda-labels", source: "Инструкция FDA (openFDA, DailyMed)", sourceUrl: label.dailyMedUrl, publisher: label.manufacturer, retrievedAt, publishedAt: label.effectiveDate, version: label.version, ownership: "PUBLIC_SOURCE", dataOrigin: "runtime_api" },
    actions: [
      { kind: "open_source", label: "Инструкция на DailyMed", href: label.dailyMedUrl, requiresConfirmation: false },
      { kind: "open_source", label: "Проверить в ГРЛС", href: "https://grls.rosminzdrav.ru/", requiresConfirmation: false },
      { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
    ],
    attributes: {
      genericName: label.genericName || drug.inn,
      drugRu: drug.ru,
      brands,
      effectiveDate: label.effectiveDate,
      setId: label.setId,
      sections: sections.map(section => section.id).join("|"),
      sectionTitles: sections.map(section => section.ru).join("|"),
      truncated: sections.some(section => section.truncated),
    },
    partner: null,
    rank: 0,
  };
}

function answerDraft(ctx: AgentContext, article: PubmedArticle, abstract: PubmedAbstract, approved: boolean, questionKey: string, relevance: number): ResultDraft {
  const conclusion = abstract.conclusion ?? "";
  const full = abstract.sections.find(section => section.label === abstract.conclusionLabel)?.text ?? conclusion;
  const provenance = pubmedProvenance(article, ctx.nowIso);
  const quoted = evidenceFromQuote({
    connectorId: "pubmed",
    sourceName: `${article.journal || "PubMed"}${yearOf(article) ? ` · ${yearOf(article)}` : ""}`,
    sourceUrl: article.url,
    publisher: article.journalFull ?? article.journal,
    retrievedAt: ctx.nowIso,
    publishedAt: provenance.publishedAt,
    claim: conclusion,
    quote: full,
    quoteLanguage: "en",
    quoteKind: "verbatim",
    level: studyType(article) === "Клинические рекомендации" ? "guideline" : "peer_reviewed",
    secondary: false,
    verifyIn: null,
    dataOrigin: "runtime_api",
  });
  // The physicians' source policy judges literature by journal, not by the PubMed host.
  const evidence = factCheck({ ...quoted, provenance: { ...quoted.provenance, journal: article.journal } });
  return {
    key: stableId("answer", questionKey, article.pmid),
    agentId: ctx.agentId,
    specialty: ctx.specialty,
    kind: "reference_answer",
    category: studyType(article),
    title: truncate(article.title, 220),
    summary: [studyType(article), article.journal, yearOf(article)].filter(Boolean).join(" · "),
    reasonShown: [approved ? "Журнал из списка, одобренного врачами" : "Журнал вне списка, одобренного врачами", abstract.conclusionLabel ? `Цитата раздела «${abstract.conclusionLabel}»` : "Цитата реферата"],
    observedAt: article.sortDate,
    evidence: [evidence],
    source: { ...provenance, dataOrigin: "runtime_api" },
    actions: [
      { kind: "open_source", label: "PubMed", href: article.url, requiresConfirmation: false },
      { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
    ],
    attributes: { pmid: article.pmid, journal: article.journal, year: yearOf(article), studyType: studyType(article), approvedJournal: approved, conclusionLabel: abstract.conclusionLabel, relevance },
    partner: null,
    rank: 0,
  };
}

export async function reference(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  const question = ctx.inputText?.trim() ?? "";
  if (!question) {
    builder.note("Нужен вопрос", "Напишите вопрос, препарат или тему");
    return { intent: ctx.job ?? "answer", plan: builder.plan, toolsUsed: [], drafts: [], synthesis: null, notices: [] };
  }
  const concepts = conceptsIn(question, ctx.specialty);
  const drugs = drugsIn(question);
  const latin = latinTermsIn(question);
  const populations = concepts.filter(item => item.kind === "population").map(item => item.id.replace("population:", ""));
  const term = pubmedTermFor(concepts, latin);
  const questionKey = question.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  builder.note("Разобрали вопрос", concepts.length || latin.length
    ? `Термины: ${[...concepts.map(item => item.label), ...latin].join(", ")}`
    : "Медицинские термины не распознаны — уточните вопрос");

  const gaps: string[] = [];
  const drafts: ResultDraft[] = [];

  // 1. Drug label(s) and snapshot signals.
  const drugTargets = drugs.slice(0, ctx.job === "drug" ? 2 : 1);
  for (const drug of drugTargets) {
    const labels = builder.record(`Открыли инструкцию: ${drug.ru}`, await tools.lookupDrugLabel(ctx, drug.inn), items => items.length ? `Инструкция FDA${items[0].effectiveDate ? ` от ${items[0].effectiveDate}` : ""}` : "Инструкции нет");
    const label = labels[0];
    if (label) drafts.push(labelDraft(ctx, drug, label, populations, ctx.nowIso));
    else gaps.push(builder.toolsUsed.at(-1)?.status === "ok" ? `для «${drug.ru}» в базе FDA нет инструкции (возможно, препарат не зарегистрирован в США) — проверьте ГРЛС` : `инструкция «${drug.ru}»: ${builder.toolsUsed.at(-1)?.note ?? "источник недоступен"}`);
  }
  if (drugTargets.length) {
    const signals = drugChangesForDrugs(ctx, drugTargets.map(drug => drug.ru));
    if (signals.length) builder.note("Проверили регуляторные сигналы", countLabel(signals.length, ["сигнал", "сигнала", "сигналов"]) + " из снимка публичных сообщений");
    drafts.push(...signals);
  }
  if (ctx.job === "drug" && !drugTargets.length) gaps.push("препарат в вопросе не распознан — напишите МНН, например «дапаглифлозин»");

  // 2. Conclusions of reviews and guidelines.
  const minDate = entrezDate(new Date(Date.UTC(ctx.now.getUTCFullYear() - REFERENCE_YEARS, ctx.now.getUTCMonth(), ctx.now.getUTCDate())));
  const maxDate = entrezDate(ctx.now);
  const approved = approvedJournals();
  let articles: PubmedArticle[] = [];
  const approvedPmids = new Set<string>();
  if (term) {
    const search = (journals?: string[], searchTerm = term, retmax = 6) => tools.searchPubmed(ctx, { term: searchTerm, minDate, maxDate, retmax, journals, publicationTypes: REFERENCE_PUBLICATION_TYPES, sort: "relevance" });
    const describe = (items: PubmedArticle[]) => countLabel(items.length, ["публикация", "публикации", "публикаций"]);
    const add = (items: readonly PubmedArticle[]) => { for (const article of items) if (!articles.some(item => item.pmid === article.pmid)) articles.push(article); };
    const lastOk = () => builder.toolsUsed.at(-1)?.status === "ok";
    const subjectTerms = concepts.filter(concept => concept.kind === "topic" || concept.kind === "concept" || concept.kind === "drug").map(concept => concept.term);
    const onTopic = () => rerankByTitle(articles, subjectTerms).length;

    const first = builder.record("Искали обзоры и рекомендации в журналах, одобренных врачами", await search(approved, term, 4), describe);
    for (const article of first) approvedPmids.add(article.pmid);
    add(first);
    if (onTopic() < 3 && lastOk()) add(builder.record("Расширили поиск на все журналы PubMed", await search(undefined), describe));
    const core = pubmedCoreTermFor(concepts, latin);
    if (onTopic() < 2 && core && lastOk()) {
      const relaxed = builder.record("Убрали уточнения вопроса и повторили поиск", await search(undefined, core), describe);
      if (relaxed.length) gaps.push("точного совпадения с уточнениями вопроса нет — часть обзоров отвечает на вопрос шире");
      add(relaxed);
    }
    const broad = pubmedBroadTermFor(concepts, latin);
    if (!articles.length && broad && lastOk()) {
      const broader = builder.record("Ослабили сочетание терминов", await search(undefined, broad), describe);
      if (broader.length) gaps.push("совпадения всех терминов нет — показаны обзоры по части вопроса");
      add(broader);
    }
  } else {
    gaps.push("не удалось составить запрос к PubMed: в вопросе нет распознанных терминов");
  }
  const pubmedUse = builder.toolsUsed.find(use => use.tool === "searchPubmed");
  if (pubmedUse && pubmedUse.status !== "ok") gaps.push(`PubMed: ${pubmedUse.note ?? "недоступен"}`);

  const ranked = rerankByTitle(articles, concepts.filter(concept => concept.kind === "topic" || concept.kind === "concept" || concept.kind === "drug").map(concept => concept.term));
  if (ranked.length < articles.length) builder.note("Отсеяли публикации не по теме", countLabel(articles.length - ranked.length, ["публикация упоминает", "публикации упоминают", "публикаций упоминают"]) + " тему вопроса только вскользь");
  const top = ranked.slice(0, MAX_ANSWERS + 1);
  const abstracts = builder.record("Прочитали выводы рефератов", await tools.readAbstracts(ctx, top.map(article => article.pmid)), items => countLabel(items.filter(item => item.conclusion).length, ["вывод", "вывода", "выводов"]));
  const byPmid = new Map(abstracts.map(item => [item.pmid, item]));
  let answers = 0;
  for (const article of top) {
    const abstract = byPmid.get(article.pmid);
    if (abstract?.conclusion && answers < MAX_ANSWERS) {
      drafts.push(answerDraft(ctx, article, abstract, approvedPmids.has(article.pmid), questionKey, top.indexOf(article)));
      answers += 1;
    } else {
      drafts.push({
        key: stableId("answer", questionKey, "biblio", article.pmid),
        agentId: ctx.agentId,
        specialty: ctx.specialty,
        kind: "research_finding",
        category: "publication",
        title: truncate(article.title, 220),
        summary: [studyType(article), article.journal, yearOf(article)].filter(Boolean).join(" · "),
        reasonShown: ["Реферат без выделенного вывода — откройте источник"],
        observedAt: article.sortDate,
        evidence: [factCheck(evidenceFromPubmed(article, ctx.nowIso))],
        source: pubmedProvenance(article, ctx.nowIso),
        actions: [{ kind: "open_source", label: "PubMed", href: article.url, requiresConfirmation: false }, { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false }],
        attributes: { pmid: article.pmid, journal: article.journal, year: yearOf(article), studyType: studyType(article) },
        partner: null,
        rank: 0,
      });
    }
  }

  // 3. Canonical catalog (only where one exists).
  if (ctx.catalog.content.length) {
    const hits = builder.record("Проверили каталог рекомендаций специальности", await tools.searchMedical(ctx, { query: question, limit: 3, requireTopicMatch: true, topics: concepts.filter(item => item.kind === "topic" && item.id.startsWith(`${ctx.specialty}:`)).map(item => item.id.split(":")[1]) }), items => countLabel(items.length, ["материал", "материала", "материалов"]));
    for (const hit of hits) drafts.push({
      key: stableId("answer", questionKey, "catalog", hit.content.id),
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind: "research_finding",
      category: hit.content.kind,
      title: hit.content.title,
      summary: hit.content.summary,
      reasonShown: [hit.content.source.name],
      observedAt: hit.content.publicationDate ?? (hit.content.publicationYear ? String(hit.content.publicationYear) : null),
      evidence: [factCheck(evidenceFromCatalog(hit.content), { currentness: hit.content.currentness, editorialStatus: hit.content.editorialStatus })],
      source: catalogProvenance(hit.content),
      actions: [{ kind: "open_internal", label: "Открыть", href: `/${ctx.specialty}/content/${encodeURIComponent(hit.content.id)}`, requiresConfirmation: false }, { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false }],
      attributes: { question },
      partner: null,
      rank: 0,
    });
  }

  const checked = await finishWithChecks(builder, ctx, drafts);
  const labelCount = checked.filter(draft => draft.kind === "drug_label").length;
  const answerCount = checked.filter(draft => draft.kind === "reference_answer").length;
  const approvedCount = checked.filter(draft => draft.kind === "reference_answer" && draft.attributes.approvedJournal === true).length;
  gaps.push("российские клинические рекомендации и статус препаратов в РФ проверяйте в рубрикаторе Минздрава и ГРЛС — они не подключены");
  const found = [
    labelCount ? `${countLabel(labelCount, ["инструкция", "инструкции", "инструкций"])} FDA` : null,
    answerCount ? `${countLabel(answerCount, ["вывод", "вывода", "выводов"])} обзоров и рекомендаций${approvedCount ? ` (${approvedCount} — из журналов, одобренных врачами)` : ""}` : null,
  ].filter(Boolean).join(" и ");
  const synthesis = [
    found ? `По вопросу «${truncate(question, 120)}» найдено: ${found}. Ниже — выводы источников дословно, на языке оригинала; продукт их не пересказывает и не дополняет.` : `По вопросу «${truncate(question, 120)}» подходящих обзоров и инструкций не найдено.`,
    `Чего не хватает: ${gaps.join("; ")}.`,
  ].join("\n\n");
  builder.note("Собрали ответ", "Только то, что сказано в источниках, с датой и ссылкой");
  return { intent: ctx.job ?? "answer", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts: checked, synthesis, notices: builder.notices };
}
