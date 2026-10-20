import { countLabel } from "@/lib/agents/format";
import { stableId, truncate } from "@/lib/agents/text";
import type { AgentId, PlanStep, ToolUse } from "@/lib/agents/types";
import { pubmedConceptsIn, topicLabels } from "@/lib/agents/vocabulary";
import type { AgentContext } from "./context";
import type { ResultDraft, ToolOutput } from "./drafts";
import { drugStudyDrafts, drugStudyTerm, pubmedWindow } from "./services/drug-change";
import { evidenceFromCatalog, evidenceFromPubmed, catalogProvenance, pubmedProvenance } from "./services/evidence";
import { eventDrafts } from "./services/event";
import { factCheck as factCheckEvidence } from "./services/fact-check";
import { materialEvidenceId, materialProvenance } from "./services/material";
import * as tools from "./tools";

/**
 * Agent executors: each agent owns a goal and composes shared tools into a
 * plan. Plan step labels are written for the physician; tool names stay
 * internal and are only recorded for audit.
 */

export interface ExecutorResult {
  intent: string;
  plan: PlanStep[];
  toolsUsed: ToolUse[];
  drafts: ResultDraft[];
  synthesis: string | null;
  notices: string[];
}

class PlanBuilder {
  plan: PlanStep[] = [];
  toolsUsed: ToolUse[] = [];
  notices: string[] = [];

  note(label: string, detail: string | null = null) {
    this.plan.push({ id: `step-${this.plan.length + 1}`, label, tool: null, status: "done", detail, connectorIds: [] });
  }

  record<T>(label: string, output: ToolOutput<T>, describe: (items: T[]) => string): T[] {
    this.toolsUsed.push(output.use);
    const status: PlanStep["status"] = output.use.status === "failed" ? "failed" : output.use.status === "unavailable" ? "skipped" : output.use.status === "blocked" ? "blocked" : "done";
    const detail = output.use.status === "unavailable" || output.use.status === "failed"
      ? (output.use.note ?? "Источник недоступен — шаг пропущен")
      : [describe(output.items), output.use.note].filter(Boolean).join(" · ");
    this.plan.push({ id: `step-${this.plan.length + 1}`, label, tool: output.use.tool, status, detail, connectorIds: output.use.connectorIds });
    return output.items;
  }
}

function verificationSummary(drafts: readonly ResultDraft[]): string {
  const evidence = drafts.flatMap(draft => draft.evidence);
  const supported = evidence.filter(item => item.verificationStatus === "SUPPORTED").length;
  const partial = evidence.filter(item => item.verificationStatus === "PARTIALLY_SUPPORTED").length;
  const unknown = evidence.filter(item => item.verificationStatus === "UNKNOWN").length;
  const unsupported = evidence.filter(item => item.verificationStatus === "UNSUPPORTED").length;
  return [`${supported} подтверждено`, partial ? `${partial} частично` : null, unknown ? `${unknown} не удалось проверить` : null, unsupported ? `${unsupported} не подтверждено` : null].filter(Boolean).join(", ");
}

async function finishWithChecks(builder: PlanBuilder, ctx: AgentContext, drafts: ResultDraft[]): Promise<ResultDraft[]> {
  const checked = builder.record("Проверили утверждения по источникам", await tools.factCheck(drafts), items => verificationSummary(items));
  return builder.record("Упорядочили по силе источников", await tools.rankEvidence(ctx, checked), items => countLabel(items.length, ["находка", "находки", "находок"]));
}

function topicsDetail(ctx: AgentContext): string {
  const labels = topicLabels(ctx.specialty, ctx.preference.topics);
  return labels.length ? `Темы: ${labels.join(", ")}` : "Темы не выбраны — смотрим всю специальность";
}

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
    const articles = builder.record("Искали новые публикации в PubMed", await tools.searchPubmed(ctx, { term: tools.pubmedTermForTopics(ctx), ...window, retmax: 5, journals: tools.trustedJournals(ctx) }), items => countLabel(items.length, ["публикация", "публикации", "публикаций"]) + ` с ${window.minDate}`);
    pubmedDrafts = articles.map(article => ({
      key: stableId("update", "pubmed", article.pmid),
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind: "update" as const,
      category: "publication",
      title: truncate(article.title, 180),
      summary: `${article.journal}${article.pubDate ? ` · ${article.pubDate}` : ""}${article.authors.length ? ` · ${article.authors.slice(0, 3).join(", ")}${article.authors.length > 3 ? " и др." : ""}` : ""}`,
      reasonShown: ["Новая публикация по вашим темам", tools.trustedJournals(ctx).length ? "Из доверенных журналов" : "PubMed"],
      observedAt: article.sortDate,
      evidence: [factCheckEvidence(evidenceFromPubmed(article, ctx.nowIso))],
      source: pubmedProvenance(article, ctx.nowIso),
      actions: [{ kind: "open_source" as const, label: "PubMed", href: article.url, requiresConfirmation: false }, { kind: "save" as const, label: "Сохранить", href: null, requiresConfirmation: false }],
      attributes: { journal: article.journal, pmid: article.pmid, doi: article.doi },
      partner: null,
      rank: 0,
    }));
  }
  const partner = builder.record("Подобрали партнёрский материал отдельно от выдачи", await tools.matchPartnerContent(ctx), items => items.length ? "1 материал, помечен как партнёрский" : "Совпадений нет");
  const drafts = await finishWithChecks(builder, ctx, [...catalogDrafts, ...guidelineDrafts, ...drugDrafts, ...pubmedDrafts, ...partner]);
  return { intent: "monitor_updates", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis: null, notices: builder.notices };
}

async function guidelines(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  builder.note("Определили область", `${topicsDetail(ctx)} · период ${ctx.preference.horizonDays} дней`);
  const diffs = builder.record("Нашли новые версии и сравнили с прежними", await tools.guidelineDiff(ctx), items => {
    const changed = items.filter(item => item.category !== "needs_check").length;
    const check = items.length - changed;
    return [countLabel(changed, ["изменение", "изменения", "изменений"]), check ? `${check} требуют проверки актуальности` : null].filter(Boolean).join(", ");
  });
  const drafts = await finishWithChecks(builder, ctx, diffs);
  return { intent: "compare_guidelines", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis: null, notices: builder.notices };
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
  builder.notices.push("Агент сообщает об изменениях и не подбирает терапию.");
  return { intent: "track_drugs", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis: null, notices: builder.notices };
}

async function research(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  const question = ctx.inputText?.trim() || topicLabels(ctx.specialty, ctx.preference.topics).join(", ");
  if (!question) {
    builder.note("Нужен вопрос", "Сформулируйте вопрос или выберите темы в настройках агента");
    return { intent: "research_question", plan: builder.plan, toolsUsed: [], drafts: [], synthesis: null, notices: [] };
  }
  builder.note("Сформулировали вопрос и план поиска", `«${truncate(question, 140)}» · ${topicsDetail(ctx)}`);
  const hits = builder.record("Искали в каталоге РКО и РКЖ", await tools.searchMedical(ctx, { query: question, limit: 6, topics: ctx.preference.topics }), items => countLabel(items.length, ["материал", "материала", "материалов"]));
  const topicTerm = tools.pubmedTermForTopics(ctx);
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
  const pubmedDrafts: ResultDraft[] = articles.map(article => ({
    key: stableId("research", questionKey, "pubmed", article.pmid),
    agentId: ctx.agentId,
    specialty: ctx.specialty,
    kind: "research_finding" as const,
    category: "publication",
    title: truncate(article.title, 180),
    summary: `${article.journal}${article.pubDate ? ` · ${article.pubDate}` : ""}${article.publicationTypes.length ? ` · ${article.publicationTypes.slice(0, 2).join(", ")}` : ""}`,
    reasonShown: [pubmedReason, article.journal || "PubMed"],
    observedAt: article.sortDate,
    evidence: [factCheckEvidence(evidenceFromPubmed(article, ctx.nowIso))],
    source: pubmedProvenance(article, ctx.nowIso),
    actions: [{ kind: "open_source" as const, label: "PubMed", href: article.url, requiresConfirmation: false }, { kind: "save" as const, label: "Сохранить", href: null, requiresConfirmation: false }],
    attributes: { question, journal: article.journal, doi: article.doi },
    partner: null,
    rank: 0,
  }));
  const drafts = await finishWithChecks(builder, ctx, [...catalogDrafts, ...pubmedDrafts]);
  const pubmedUse = builder.toolsUsed.find(use => use.tool === "searchPubmed");
  const gaps = [
    pubmedUse && pubmedUse.status !== "ok" ? `PubMed: ${pubmedUse.note ?? "недоступен"}` : null,
    "Полные тексты статей не загружались — агент не пересказывает выводы исследований",
    ctx.specialty !== "cardiology" ? "Для этой специальности нет проверенного каталога" : null,
  ].filter(Boolean);
  const keyFacts = drafts.filter(draft => draft.evidence.some(item => item.verificationStatus === "SUPPORTED")).slice(0, 4).map(draft => `— ${truncate(draft.title, 120)} (${draft.source.source})`);
  const synthesis = drafts.length
    ? [`По вопросу «${truncate(question, 120)}» найдено: ${countLabel(hits.length, ["материал", "материала", "материалов"])} в каталоге и ${countLabel(articles.length, ["публикация", "публикации", "публикаций"])} в PubMed.`, keyFacts.length ? `С подтверждённым источником:\n${keyFacts.join("\n")}` : "Подтверждённых источником находок нет.", `Чего не хватает: ${gaps.join("; ")}.`].join("\n\n")
    : `По вопросу «${truncate(question, 120)}» в доверенных источниках ничего не найдено. Чего не хватает: ${gaps.join("; ")}.`;
  builder.note("Собрали проверяемый обзор", "Только найденное, с источниками; без выводов сверх них");
  return { intent: "research_question", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis, notices: builder.notices };
}

async function events(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  builder.note("Учли ваши условия", `${topicsDetail(ctx)} · ${ctx.preference.formats.length ? countLabel(ctx.preference.formats.length, ["формат", "формата", "форматов"]) : "любой формат"} · ${ctx.preference.horizonDays} дней`);
  const found = builder.record("Нашли события и привели к единому виду", await tools.searchEvents(ctx), items => countLabel(items.length, ["подходящее событие", "подходящих события", "подходящих событий"]));
  const partner = builder.record("Подобрали партнёрский материал отдельно от выдачи", await tools.matchPartnerContent(ctx), items => items.length ? "1 материал, помечен как партнёрский" : "Совпадений нет");
  const drafts = await finishWithChecks(builder, ctx, [...eventDrafts(ctx, found.slice(0, 12)), ...partner]);
  builder.note("Подготовили следующий шаг", "Календарь и переход к регистрации — только после вашего подтверждения");
  return { intent: "find_events", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis: null, notices: builder.notices };
}

async function learning(ctx: AgentContext): Promise<ExecutorResult> {
  const builder = new PlanBuilder();
  builder.note("Учли цели и темы", topicsDetail(ctx));
  const modules = builder.record("Собрали маршрут из рекомендаций, лекций и событий", await tools.generateLearningPlan(ctx), items => countLabel(items.length, ["модуль", "модуля", "модулей"]));
  const checked = builder.record("Проверили версии и источники", await tools.factCheck(modules), items => verificationSummary(items));
  return { intent: "plan_learning", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts: checked, synthesis: null, notices: builder.notices };
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
      reasonShown: [`Совпадения: ${hit.matchedTerms.slice(0, 4).join(", ")}`, hit.material.ownership === "USER_UPLOADED" ? "Ваш документ" : hit.material.ownership === "GENERATED" ? "Сохранённый результат агента" : "Сохранённая ссылка"],
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
  const synthesis = drafts.length ? `По вопросу «${truncate(question, 120)}» нашлось ${countLabel(drafts.length, ["место", "места", "мест"])} в ваших материалах. Ответ собран только из них.` : `В ваших материалах нет совпадений по вопросу «${truncate(question, 120)}». Добавьте документ или задайте вопрос агенту «Исследовать тему».`;
  return { intent: "ask_my_materials", plan: builder.plan, toolsUsed: builder.toolsUsed, drafts, synthesis, notices: [] };
}

export const EXECUTORS: Record<AgentId, (ctx: AgentContext) => Promise<ExecutorResult>> = {
  whats_new: whatsNew,
  guidelines,
  drugs,
  research,
  events,
  learning,
  materials,
};
