import { countLabel } from "@/lib/agents/format";
import { stableId, truncate } from "@/lib/agents/text";
import type { AgentId, EventFormatPref } from "@/lib/agents/types";
import { describeStudyIdentifiers, hasStudyIdentifiers, pubmedTermForIdentifiers, studyIdentifierCount, studyIdentifiersIn, type StudyIdentifiers } from "@/lib/agents/study-identifiers";
import { pubmedConceptsIn, topicById, topicLabels, topicsMentioned } from "@/lib/agents/vocabulary";
import { conceptsIn, pubmedTermFor } from "@/lib/portal/lexicon";
import { specialties } from "@/lib/specialty";
import { entrezDate, type PubmedArticle } from "./adapters/pubmed";
import type { AgentContext } from "./context";
import type { ResultDraft } from "./drafts";
import { drugStudyDrafts, drugStudyTerm, pubmedWindow } from "./services/drug-change";
import { evidenceFromCatalog, evidenceFromPubmed, evidenceFromQuote, catalogProvenance, pubmedProvenance } from "./services/evidence";
import { eventDrafts, rejectedListingCount } from "./services/event";
import { factCheck as factCheckEvidence } from "./services/fact-check";
import { materialEvidenceId, materialProvenance } from "./services/material";
import { CLINICAL_PUBLICATION_TYPES } from "./adapters/pubmed";
import * as tools from "./tools";
import { finishWithChecks, PlanBuilder, topicsDetail, type ExecutorResult } from "./plan";
import { evidenceAnswer } from "@/server/mesh/executor";
import { learning } from "./executor-learning";

export type { ExecutorResult } from "./plan";

/**
 * Agent executors: each agent owns a goal and composes shared tools into a
 * plan. Plan step labels are written for the physician; tool names stay
 * internal and are only recorded for audit.
 */

async function whatsNew(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  builder.note("Определили, что считать новым", ctx.lastSeenAt ? "Всё, что появилось после вашего прошлого просмотра" : `Первый запуск: последние ${ctx.preference.horizonDays} дней · ${topicsDetail(ctx)}`);
  const since = ctx.lastSeenAt ? new Date(ctx.lastSeenAt).getTime() : ctx.now.getTime() - ctx.preference.horizonDays * 86_400_000;
  const horizon = ctx.now.getTime() - ctx.preference.horizonDays * 86_400_000;

  const hits = builder.record("Проверили каталог РКО и РКЖ", await tools.searchMedical(ctx, { kinds: ["article", "video", "event", "guideline", "clinical"], limit: 24 }), items => countLabel(items.length, ["материал", "материала", "материалов"]) + " по темам");
  const catalogDrafts: ResultDraft[] = hits
    .filter(hit => hit.content.publicationDate && new Date(`${hit.content.publicationDate}T00:00:00Z`).getTime() >= horizon)
    .map(hit => ({
      key: stableId("update", "catalog", hit.content.id),
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind: "update" as const,
      category: hit.content.kind,
      title: hit.content.title,
      summary: hit.content.summary,
      reasonShown: [`Тема: ${topicLabels(ctx.specialty, hit.matchedTopics).join(", ") || "по запросу"}`, `${hit.content.source.name} · ${hit.content.publicationDate}`],
      observedAt: hit.content.publicationDate,
      evidence: [factCheckEvidence(evidenceFromCatalog(hit.content), { currentness: hit.content.currentness, editorialStatus: hit.content.editorialStatus })],
      source: catalogProvenance(hit.content),
      actions: [{ kind: "open_internal" as const, label: "Открыть", href: `/${ctx.specialty}/content/${encodeURIComponent(hit.content.id)}`, requiresConfirmation: false }, { kind: "save" as const, label: "Сохранить", href: null, requiresConfirmation: false }],
      attributes: { since: new Date(since).toISOString() },
      partner: null,
      rank: 0,
    }));

  const wants = new Set(ctx.preference.contentTypes);
  let guidelineDrafts: ResultDraft[] = [];
  if (!wants.size || wants.has("guidelines")) {
    guidelineDrafts = builder.record("Сверили обновления рекомендаций", await tools.guidelineDiff(ctx), items => countLabel(items.length, ["изменение", "изменения", "изменений"]))
      .filter(draft => draft.category !== "needs_check")
      .filter(draft => !draft.observedAt || new Date(draft.observedAt.length === 4 ? `${draft.observedAt}-01-01` : draft.observedAt).getTime() >= horizon)
      .slice(0, 3);
  }
  let drugDrafts: ResultDraft[] = [];
  if (!wants.size || wants.has("drugs")) {
    drugDrafts = builder.record("Проверили изменения по препаратам", await tools.findDrugChanges(ctx), items => countLabel(items.length, ["изменение", "изменения", "изменений"]))
      .filter(draft => draft.observedAt && new Date(draft.observedAt).getTime() >= horizon)
      .slice(0, 3);
  }
  let pubmedDrafts: ResultDraft[] = [];
  if (!wants.size || wants.has("research")) {
    const window = pubmedWindow(ctx, 14);
    const topicTerm = tools.pubmedTermForTopics(ctx);
    // No topics yet: the specialty itself is the scope (value before configuration).
    const term = topicTerm ?? tools.specialtyScopeTerm(ctx);
    const scopeReason = topicTerm ? "Новая публикация по вашим темам" : `Новая публикация по специальности «${specialties[ctx.specialty].name}»`;
    const articles = builder.record("Искали новые публикации в PubMed", await tools.searchPubmed(ctx, { term, ...window, retmax: 5, journals: tools.trustedJournals(ctx), publicationTypes: CLINICAL_PUBLICATION_TYPES }), items => countLabel(items.length, ["публикация", "публикации", "публикаций"]) + ` с ${window.minDate}`);
    pubmedDrafts = articles.map(article => ({
      key: stableId("update", "pubmed", article.pmid),
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind: "update" as const,
      category: "publication",
      title: truncate(article.title, 180),
      summary: `${article.journal}${article.pubDate ? ` · ${article.pubDate}` : ""}${article.authors.length ? ` · ${article.authors.slice(0, 3).join(", ")}${article.authors.length > 3 ? " и др." : ""}` : ""}`,
      reasonShown: [scopeReason, "Клинические исследования и обзоры из журналов, одобренных врачами"],
      observedAt: article.sortDate,
      evidence: [factCheckEvidence(evidenceFromPubmed(article, ctx.nowIso))],
      source: pubmedProvenance(article, ctx.nowIso),
      actions: [{ kind: "open_source" as const, label: "PubMed", href: article.url, requiresConfirmation: false }, { kind: "save" as const, label: "Сохранить", href: null, requiresConfirmation: false }],
      attributes: { journal: article.journal, pmid: article.pmid, doi: article.doi, studyType: studyTypeLabel(article.publicationTypes) },
      partner: null,
      rank: 0,
    }));
  }
  const partner = builder.record("Подобрали партнёрский материал отдельно от выдачи", await tools.matchPartnerContent(ctx), items => items.length ? "1 материал, помечен как партнёрский" : "Совпадений нет");
  const drafts = await finishWithChecks(builder, ctx, [...catalogDrafts, ...guidelineDrafts, ...drugDrafts, ...pubmedDrafts, ...partner]);
  return { intent: "monitor_updates", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis: null, notices: builder.notices };
}

const GUIDELINE_PUBLICATION_TYPES = ["Practice Guideline", "Guideline", "Consensus Development Conference"];

export function studyTypeLabel(types: readonly string[]): string | null {
  if (types.some(type => /guideline/i.test(type))) return "Клинические рекомендации";
  if (types.some(type => /consensus/i.test(type))) return "Согласительный документ";
  if (types.includes("Meta-Analysis")) return "Метаанализ";
  if (types.includes("Systematic Review")) return "Систематический обзор";
  if (types.includes("Randomized Controlled Trial")) return "Рандомизированное исследование";
  if (types.includes("Review")) return "Обзор";
  return null;
}

/** Does a title contain what a topic's PubMed term looks for («hypertension», «"chronic kidney disease"», «diabet*»)? */
function titleNamesTopic(title: string, term: string): boolean {
  const value = title.toLowerCase();
  return [...term.matchAll(/"([^"]+)"\[[a-z]+\]|([A-Za-z0-9-]+)(\*?)\[[a-z]+\]/giu)].some(match => {
    const phrase = (match[1] ?? match[2]).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z])${phrase}${match[3] ? "" : "(?![a-z])"}`, "u").test(value);
  });
}

/**
 * Guidelines job. Cardiology adds the canonical catalog version chains and the
 * ESC snapshot; every specialty gets recently published guidelines from
 * PubMed. Russian official status is a hand-off to the rubricator: it is not
 * connected and never asserted.
 */
async function guidelines(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  const question = ctx.inputText?.trim() ?? "";
  const concepts = question ? conceptsIn(question, ctx.specialty).filter(concept => concept.kind !== "modifier") : [];
  builder.note("Определили область", question ? `Вопрос: «${truncate(question, 100)}»${concepts.length ? ` · ${concepts.map(item => item.label).join(", ")}` : ""}` : `${topicsDetail(ctx)} · период ${ctx.preference.horizonDays} дней`);
  const diffs = builder.record("Нашли новые версии и сравнили с прежними", await tools.guidelineDiff(ctx), items => {
    const changed = items.filter(item => item.category !== "needs_check").length;
    const check = items.length - changed;
    return [countLabel(changed, ["изменение", "изменения", "изменений"]), check ? `${check} требуют проверки актуальности` : null].filter(Boolean).join(", ");
  });

  const questionTerm = concepts.length ? pubmedTermFor(concepts) : null;
  // A guideline is «по вашей теме» when its title names the topic: a tinnitus guideline that mentions hypertension in its abstract is not.
  const topicTerm = tools.pubmedTermForTopics(ctx)?.replace(/\[tiab\]/g, "[ti]") ?? null;
  const term = questionTerm ?? topicTerm ?? tools.specialtyScopeTerm(ctx);
  const years = question ? 5 : 2;
  const minDate = entrezDate(new Date(Date.UTC(ctx.now.getUTCFullYear() - years, ctx.now.getUTCMonth(), ctx.now.getUTCDate())));
  const articles = builder.record("Искали опубликованные рекомендации в PubMed", await tools.searchPubmed(ctx, { term, minDate, maxDate: entrezDate(ctx.now), retmax: question ? 6 : 4, publicationTypes: GUIDELINE_PUBLICATION_TYPES, sort: question ? "relevance" : "pub_date" }), items => countLabel(items.length, ["документ", "документа", "документов"]) + ` за ${years} ${years === 2 ? "года" : "лет"}`);
  const conclusions = question && articles.length ? builder.record("Прочитали рефераты рекомендаций", await tools.readAbstracts(ctx, articles.slice(0, 4).map(article => article.pmid)), items => countLabel(items.filter(item => item.conclusion).length, ["вывод", "вывода", "выводов"])) : [];
  const byPmid = new Map(conclusions.map(item => [item.pmid, item]));
  // The reason names the topics this document's title matches, not every topic in the profile.
  const scopeReason = (title: string) => {
    if (questionTerm) return `По вопросу: ${concepts.map(item => item.label).join(", ")}`;
    if (!topicTerm) return `Специальность: ${specialties[ctx.specialty].name}`;
    const matched = ctx.preference.topics.filter(id => titleNamesTopic(title, topicById(ctx.specialty, id)?.pubmed ?? ""));
    const labels = topicLabels(ctx.specialty, matched.length ? matched : ctx.preference.topics);
    return `${labels.length > 1 ? "Темы" : "Тема"}: ${labels.join(", ")}`;
  };
  const publications: ResultDraft[] = articles.map(article => {
    const abstract = byPmid.get(article.pmid);
    const bibliographic = factCheckEvidence(evidenceFromPubmed(article, ctx.nowIso));
    const quote = abstract?.conclusion ? factCheckEvidence({ ...evidenceFromQuote({ connectorId: "pubmed", sourceName: `${article.journal} · ${article.sortDate?.slice(0, 4) ?? ""}`.trim(), sourceUrl: article.url, publisher: article.journalFull ?? article.journal, retrievedAt: ctx.nowIso, publishedAt: article.sortDate, claim: abstract.conclusion, quote: abstract.sections.find(section => section.label === abstract.conclusionLabel)?.text ?? abstract.conclusion, quoteLanguage: "en", quoteKind: "verbatim", level: "guideline", secondary: false, verifyIn: null, dataOrigin: "runtime_api" }), provenance: { ...pubmedProvenance(article, ctx.nowIso), journal: article.journal } }) : null;
    return {
      key: stableId("guideline-publication", article.pmid),
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind: "guideline_change" as const,
      category: "guideline_publication",
      title: truncate(article.title, 220),
      summary: [studyTypeLabel(article.publicationTypes), article.journal, article.pubDate].filter(Boolean).join(" · "),
      reasonShown: [scopeReason(article.title), "Международная публикация: статус в РФ сверяйте с рубрикатором Минздрава"],
      observedAt: article.sortDate,
      evidence: quote ? [quote, bibliographic] : [bibliographic],
      source: pubmedProvenance(article, ctx.nowIso),
      actions: [
        { kind: "open_source" as const, label: "PubMed", href: article.url, requiresConfirmation: false },
        { kind: "open_source" as const, label: "Рубрикатор КР Минздрава", href: "https://cr.minzdrav.gov.ru/", requiresConfirmation: false },
        { kind: "save" as const, label: "Сохранить", href: null, requiresConfirmation: false },
      ],
      attributes: { society: article.journal, journal: article.journal, pmid: article.pmid, studyType: studyTypeLabel(article.publicationTypes), conclusionLabel: abstract?.conclusionLabel ?? null },
      partner: null,
      rank: 0,
    };
  });
  const drafts = await finishWithChecks(builder, ctx, [...diffs, ...publications]);
  const synthesis = question
    ? [`По теме «${truncate(question, 100)}»: ${countLabel(diffs.length, ["изменение", "изменения", "изменений"])} в каталоге рекомендаций специальности и ${countLabel(publications.length, ["опубликованный документ", "опубликованных документа", "опубликованных документов"])} в PubMed.`, "Российские клинические рекомендации и их статус проверяются в рубрикаторе Минздрава: он пока не подключён, поэтому статус не утверждается."].join("\n\n")
    : null;
  return { intent: "compare_guidelines", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis, notices: builder.notices };
}

async function drugs(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  builder.note("Определили, что отслеживать", `${topicsDetail(ctx)} · ${ctx.lastSeenAt ? "изменения с прошлого просмотра" : `первый запуск: последние ${ctx.preference.horizonDays} дней`}`);
  const changes = builder.record("Проверили регистрации, ограничения и рекомендации", await tools.findDrugChanges(ctx), items => countLabel(items.length, ["изменение", "изменения", "изменений"]));
  const term = drugStudyTerm(ctx);
  const window = pubmedWindow(ctx, 30);
  const articles = builder.record("Искали новые рандомизированные исследования", await tools.searchPubmed(ctx, { term, ...window, retmax: 4, journals: tools.trustedJournals(ctx) }), items => countLabel(items.length, ["публикация", "публикации", "публикаций"]));
  const partner = builder.record("Подобрали партнёрский материал отдельно от выдачи", await tools.matchPartnerContent(ctx), items => items.length ? "1 материал, помечен как партнёрский" : "Совпадений нет");
  const drafts = await finishWithChecks(builder, ctx, [...changes, ...drugStudyDrafts(ctx, articles), ...partner]);
  builder.notices.push("Здесь только сообщения об изменениях: терапия не подбирается.");
  return { intent: "track_drugs", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis: null, notices: builder.notices };
}

function pubmedFindingDraft(ctx: AgentContext, questionKey: string, question: string, article: PubmedArticle, reason: string): ResultDraft {
  return {
    key: stableId("research", questionKey, "pubmed", article.pmid),
    agentId: ctx.agentId,
    specialty: ctx.specialty,
    kind: "research_finding" as const,
    category: "publication",
    title: truncate(article.title, 180),
    summary: `${article.journal}${article.pubDate ? ` · ${article.pubDate}` : ""}${article.publicationTypes.length ? ` · ${article.publicationTypes.slice(0, 2).join(", ")}` : ""}`,
    reasonShown: [reason, article.journal || "PubMed"],
    observedAt: article.sortDate,
    evidence: [factCheckEvidence(evidenceFromPubmed(article, ctx.nowIso))],
    source: pubmedProvenance(article, ctx.nowIso),
    actions: [{ kind: "open_source" as const, label: "PubMed", href: article.url, requiresConfirmation: false }, { kind: "save" as const, label: "Сохранить", href: null, requiresConfirmation: false }],
    attributes: { question, journal: article.journal, doi: article.doi, publicationTypes: article.publicationTypes.join(", ") },
    partner: null,
    rank: 0,
  };
}

/**
 * The physician named the publication (PMID, PMCID, DOI or a PubMed link):
 * look it up exactly, without the topic search and without the approved-journal
 * filter — the physician chose the article, the result says when its journal is
 * outside the list the physicians validated.
 */
async function researchByIdentifiers(ctx: AgentContext, builder: PlanBuilder, question: string, identifiers: StudyIdentifiers): Promise<ExecutorResult> {
  const asked = describeStudyIdentifiers(identifiers);
  builder.note("Распознали публикацию в запросе", asked);
  const articles = builder.record("Нашли публикацию в PubMed по идентификатору", await tools.searchPubmed(ctx, { term: pubmedTermForIdentifiers(identifiers), retmax: studyIdentifierCount(identifiers), sort: "relevance" }), items => items.length ? countLabel(items.length, ["публикация", "публикации", "публикаций"]) : "не найдена");
  const questionKey = question.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  const approved = new Set(tools.trustedJournals(ctx).map(journal => journal.toLocaleLowerCase("en-US")));
  const drafts = await finishWithChecks(builder, ctx, articles.map(article => {
    const draft = pubmedFindingDraft(ctx, questionKey, question, article, `Вы указали: ${asked}`);
    const outsideList = article.journal && !approved.has(article.journal.toLocaleLowerCase("en-US"));
    return outsideList ? { ...draft, attributes: { ...draft.attributes, journalOutsideApprovedList: true } } : draft;
  }));
  const pubmedUse = builder.toolsUsed.find(use => use.tool === "searchPubmed");
  const unavailable = pubmedUse && pubmedUse.status !== "ok";
  const skipped = pubmedUse?.status === "ok" && !articles.length && pubmedUse.note?.startsWith("PubMed пропущен");
  const synthesis = unavailable
    ? `PubMed недоступен: ${pubmedUse?.note ?? "нет ответа"}. Публикацию (${asked}) проверить не удалось, разбор не выполнен.`
    : skipped
      ? `${pubmedUse?.note}. Публикацию (${asked}) не искали: включите международные источники и исследования в настройках разбора.`
      : drafts.length
      ? `Разбор публикации по ${asked}: ${drafts.map(draft => `«${truncate(draft.title, 140)}» (${draft.source.source})`).join("; ")}.`
      : `В PubMed нет публикации по ${asked}. Проверьте идентификатор или вставьте ссылку на страницу статьи в PubMed.`;
  builder.note("Собрали разбор публикации", "Параметры исследования — только из текста статьи, с цитатой");
  return { intent: "research_question", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis, notices: builder.notices };
}

/**
 * Words that frame a study request («разбери исследование», «какие данные»,
 * «для пациента»). They say nothing about the topic, so they never match a
 * catalog item: «как приготовить борщ? разбор исследований» finds nothing.
 */
const REQUEST_FRAMING = /(?<![\p{L}])(?:разб\p{L}*|исследова\p{L}*|стать[яиюей]\p{L}*|публикац\p{L}*|данны\p{L}*|результат\p{L}*|показал\p{L}*|известн\p{L}*|пациент\p{L}*|больн\p{L}*|него|неё|нее|ему|ней|подскаж\p{L}*|найди|покажи|что|какие|какой|какая|каков\p{L}*)(?![\p{L}])/giu;

export function researchTopicQuery(question: string): string {
  // Redaction placeholders ([ФИО], [SNILS]) and ages are not topics either.
  return question.replace(/\[[\p{L}_ ]+\]/gu, " ").replace(/(?<![\p{N}])\d{1,3}\s*(?:лет|года|год)(?![\p{L}])/gu, " ").replace(REQUEST_FRAMING, " ").replace(/[?!.,:;«»"]+/gu, " ").replace(/\s+/gu, " ").trim();
}

async function research(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  const question = ctx.inputText?.trim() || topicLabels(ctx.specialty, ctx.preference.topics).join(", ");
  if (!question) {
    builder.note("Нужен вопрос", "Сформулируйте вопрос или выберите темы в профиле");
    return { intent: "research_question", plan: builder.plan, toolsUsed: [], drafts: [], synthesis: null, notices: [] };
  }
  const identifiers = studyIdentifiersIn(question);
  if (hasStudyIdentifiers(identifiers)) return researchByIdentifiers(ctx, builder, question, identifiers);
  // A typed question is searched by its own topics, not by every topic in the profile.
  const questionTopics = ctx.inputText?.trim() ? topicsMentioned(ctx.specialty, question) : ctx.preference.topics;
  const scoped: AgentContext = questionTopics.length ? { ...ctx, preference: { ...ctx.preference, topics: questionTopics } } : ctx;
  builder.note("Сформулировали вопрос и план поиска", `«${truncate(question, 140)}» · ${topicsDetail(scoped)}`);
  const catalogQuery = ctx.inputText?.trim() ? researchTopicQuery(question) : question;
  const hits = catalogQuery || questionTopics.length
    ? builder.record("Искали в каталоге РКО и РКЖ", await tools.searchMedical(ctx, { query: catalogQuery, limit: 6, topics: questionTopics, requireTopicMatch: Boolean(ctx.inputText?.trim()) }), items => countLabel(items.length, ["материал", "материала", "материалов"]))
    : [];
  const topicTerm = tools.pubmedTermForTopics(scoped);
  const englishTerms = question.match(/[A-Za-z][A-Za-z0-9\- ]{2,}/g)?.join(" ").trim();
  const concepts = pubmedConceptsIn(question);
  const conceptTerm = concepts.length ? concepts.map(item => `(${item.term})`).join(" AND ") : null;
  const broadTerm = [topicTerm ? `(${topicTerm})` : null, englishTerms ? `(${englishTerms})` : null].filter(Boolean).join(" AND ") || null;
  const term = [broadTerm, conceptTerm].filter(Boolean).join(" AND ") || null;
  const journals = tools.trustedJournals(ctx);
  const describeArticles = (items: unknown[]) => countLabel(items.length, ["публикация", "публикации", "публикаций"]) + (concepts.length ? ` · запрос: ${concepts.map(item => item.label).join(", ")}` : "");
  let articles = builder.record("Искали публикации в PubMed", await tools.searchPubmed(ctx, { term, retmax: 6, journals }), describeArticles);
  let conceptMatched = concepts.length > 0;
  if (!articles.length && conceptTerm && broadTerm && builder.toolsUsed.at(-1)?.status === "ok") {
    articles = builder.record("Расширили поиск в PubMed до тем вопроса", await tools.searchPubmed(ctx, { term: broadTerm, retmax: 6, journals }), items => countLabel(items.length, ["публикация", "публикации", "публикаций"]));
    conceptMatched = false;
  }
  const pubmedReason = conceptMatched ? `По запросу: ${concepts.map(item => item.label).join(", ")}` : "Совпадает с темами вопроса";

  const questionKey = question.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  const catalogDrafts: ResultDraft[] = hits.map(hit => ({
    key: stableId("research", questionKey, "catalog", hit.content.id),
    agentId: ctx.agentId,
    specialty: ctx.specialty,
    kind: "research_finding" as const,
    category: hit.content.kind,
    title: hit.content.title,
    summary: hit.content.summary,
    reasonShown: [hit.matchedTopics.length ? `Тема: ${topicLabels(ctx.specialty, hit.matchedTopics).join(", ")}` : `Совпадения: ${hit.matchedTerms.slice(0, 3).join(", ")}`, hit.content.source.name],
    observedAt: hit.content.publicationDate ?? (hit.content.publicationYear ? String(hit.content.publicationYear) : null),
    evidence: [factCheckEvidence(evidenceFromCatalog(hit.content), { currentness: hit.content.currentness, editorialStatus: hit.content.editorialStatus })],
    source: catalogProvenance(hit.content),
    actions: [{ kind: "open_internal" as const, label: "Открыть", href: `/${ctx.specialty}/content/${encodeURIComponent(hit.content.id)}`, requiresConfirmation: false }, { kind: "save" as const, label: "Сохранить", href: null, requiresConfirmation: false }],
    attributes: { question },
    partner: null,
    rank: 0,
  }));
  const pubmedDrafts: ResultDraft[] = articles.map(article => pubmedFindingDraft(ctx, questionKey, question, article, pubmedReason));
  const drafts = await finishWithChecks(builder, ctx, [...catalogDrafts, ...pubmedDrafts]);
  const pubmedUse = builder.toolsUsed.find(use => use.tool === "searchPubmed");
  const gaps = [
    pubmedUse && pubmedUse.status !== "ok" ? `PubMed: ${pubmedUse.note ?? "недоступен"}` : null,
    "Полные тексты статей не загружались — выводы исследований не пересказываются",
    ctx.specialty !== "cardiology" ? "Для этой специальности нет проверенного каталога" : null,
  ].filter(Boolean);
  const keyFacts = drafts.filter(draft => draft.evidence.some(item => item.verificationStatus === "SUPPORTED")).slice(0, 4).map(draft => `— ${truncate(draft.title, 120)} (${draft.source.source})`);
  const synthesis = drafts.length
    ? [`По вопросу «${truncate(question, 120)}» найдено: ${countLabel(hits.length, ["материал", "материала", "материалов"])} в каталоге и ${countLabel(articles.length, ["публикация", "публикации", "публикаций"])} в PubMed.`, keyFacts.length ? `С подтверждённым источником:\n${keyFacts.join("\n")}` : "Подтверждённых источником находок нет.", `Чего не хватает: ${gaps.join("; ")}.`].join("\n\n")
    : `По вопросу «${truncate(question, 120)}» в доверенных источниках ничего не найдено. Чего не хватает: ${gaps.join("; ")}.`;
  builder.note("Собрали проверяемый обзор", "Только найденное, с источниками; без выводов сверх них");
  return { intent: "research_question", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis, notices: builder.notices };
}

const FORMAT_WORDS: ReadonlyArray<{ id: EventFormatPref; match: RegExp }> = [
  { id: "online", match: /онлайн|вебинар|дистанц|online/u },
  { id: "moscow", match: /москв/u },
  { id: "spb", match: /петербург|спб|питер/u },
  { id: "regions", match: /регион/u },
  { id: "international", match: /зарубеж|международн|за рубеж|esc|aha/u },
];

const MONTHS = ["январ", "феврал", "март", "апрел", "ма[йяе]", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];

/** Month the physician named («в ноябре»), 1–12, or null. */
export function monthMentioned(text: string): number | null {
  const value = text.toLocaleLowerCase("ru-RU");
  const index = MONTHS.findIndex(stem => new RegExp(`(?<![\\p{L}])${stem}`, "u").test(value));
  return index >= 0 ? index + 1 : null;
}

/** Formats the physician named in the request; none named means any format. */
export function formatsMentioned(text: string): EventFormatPref[] {
  const value = text.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  return FORMAT_WORDS.filter(item => item.match.test(value)).map(item => item.id);
}

async function events(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  // A portal request is scoped by its own words: formats it names, a longer horizon, no hidden saved filters.
  const scoped: AgentContext = ctx.job === "events" && ctx.inputText
    ? { ...ctx, preference: { ...ctx.preference, formats: formatsMentioned(ctx.inputText), horizonDays: Math.max(ctx.preference.horizonDays, 120) } }
    : ctx;
  builder.note("Учли ваши условия", `${topicsDetail(scoped)} · ${scoped.preference.formats.length ? countLabel(scoped.preference.formats.length, ["формат", "формата", "форматов"]) : "любой формат"} · ${scoped.preference.horizonDays} дней`);
  let found = builder.record("Нашли события и привели к единому виду", await tools.searchEvents(scoped), items => countLabel(items.length, ["подходящее событие", "подходящих события", "подходящих событий"]));
  const month = ctx.job === "events" && ctx.inputText ? monthMentioned(ctx.inputText) : null;
  if (month) {
    const inMonth = found.filter(event => Number(event.record.startDate.slice(5, 7)) === month || Number(event.record.endDate.slice(5, 7)) === month);
    builder.note("Оставили события выбранного месяца", inMonth.length ? countLabel(inMonth.length, ["событие", "события", "событий"]) : "В этом месяце подходящих нет — показаны ближайшие");
    if (inMonth.length) found = inMonth;
  }
  // A finite event list reads in date order.
  found = [...found].sort((a, b) => a.record.startDate.localeCompare(b.record.startDate));
  const partner = builder.record("Подобрали партнёрский материал отдельно от выдачи", await tools.matchPartnerContent(scoped), items => items.length ? "1 материал, помечен как партнёрский" : "Совпадений нет");
  const checked = await finishWithChecks(builder, scoped, [...eventDrafts(scoped, found.slice(0, 12)), ...partner]);
  // Ranking decides what is kept; a finite event list is still read in date order.
  const drafts = [...checked.filter(draft => !draft.partner).sort((a, b) => String(a.attributes.startDate ?? "").localeCompare(String(b.attributes.startDate ?? ""))), ...checked.filter(draft => draft.partner)];
  const rejected = rejectedListingCount(scoped);
  if (rejected) builder.notices.push(`Скрыто событий из источников, отклонённых врачами: ${rejected}`);
  const organic = drafts.filter(draft => !draft.partner).length;
  const covered = ctx.specialty === "cardiology";
  builder.note("Подготовили следующий шаг", "Календарь и переход к регистрации — только после вашего подтверждения");
  const synthesis = covered
    ? (organic ? null : "В снимке афиш нет подходящих событий на ближайшие месяцы. Проверьте календари организаторов — ссылки ниже.")
    : `Проверенной афиши событий по специальности «${specialties[ctx.specialty].name}» пока нет. События не подставляются из других специальностей и не придумываются — ниже календари организаторов и портал НМО для самостоятельного поиска.`;
  return { intent: "find_events", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis, notices: builder.notices };
}

async function materials(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  const question = ctx.inputText?.trim();
  const indexed = ctx.materials.filter(material => material.parseStatus === "indexed").length;
  builder.note("Открыли вашу личную базу", `${countLabel(ctx.materials.length, ["материал", "материала", "материалов"])}, проиндексировано ${indexed}. Доступ только у вас`);
  if (!question) return { intent: "ask_my_materials", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts: [], synthesis: null, notices: [] };
  const hits = builder.record("Искали в ваших материалах", await tools.searchUserMaterials(ctx, question), items => countLabel(items.length, ["совпадение", "совпадения", "совпадений"]));
  const questionKey = question.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  const drafts: ResultDraft[] = hits.map(hit => {
    const provenance = materialProvenance(hit.material);
    return {
      key: stableId("material-hit", questionKey, hit.material.id),
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind: "material_hit" as const,
      category: hit.material.kind,
      title: hit.material.title,
      summary: hit.snippet,
      reasonShown: [`Совпадения: ${hit.matchedTerms.slice(0, 4).join(", ")}`, hit.material.ownership === "USER_UPLOADED" ? "Ваш документ" : hit.material.ownership === "GENERATED" ? "Сохранённый результат" : "Сохранённая ссылка"],
      observedAt: hit.material.createdAt,
      evidence: [{
        id: materialEvidenceId(hit.material, hit.snippet),
        claim: hit.snippet,
        sourceId: hit.material.id,
        sourceUrl: hit.material.url,
        sourceType: "user_material" as const,
        publicationDate: null,
        retrievedAt: hit.material.createdAt,
        evidenceLevel: "user_material" as const,
        confidence: 1,
        verificationStatus: "SUPPORTED" as const,
        verificationNote: "Фрагмент из вашего материала; достоверность содержимого на вашей стороне",
        supportText: hit.snippet,
        provenance,
      }],
      source: provenance,
      actions: hit.material.url ? [{ kind: "open_source" as const, label: "Открыть ссылку", href: hit.material.url, requiresConfirmation: false }] : [],
      attributes: { question, materialId: hit.material.id, ownership: hit.material.ownership },
      partner: null,
      rank: 0,
    };
  });
  const synthesis = drafts.length ? `По вопросу «${truncate(question, 120)}» нашлось ${countLabel(drafts.length, ["место", "места", "мест"])} в ваших материалах. Ответ собран только из них.` : `В ваших материалах нет совпадений по вопросу «${truncate(question, 120)}». Добавьте документ или откройте «Разбор по исследованиям».`;
  return { intent: "ask_my_materials", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis, notices: [] };
}

/**
 * Executors behind capabilities. `reference` hosts the evidence_answer
 * capability (source mesh); the others are the existing implementations.
 */
export const EXECUTORS: Record<AgentId, (ctx: AgentContext) => Promise<ExecutorResult>> = {
  reference: evidenceAnswer,
  whats_new: whatsNew,
  guidelines,
  drugs,
  research,
  events,
  learning,
  materials,
};
