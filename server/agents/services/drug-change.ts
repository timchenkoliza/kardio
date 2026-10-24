import { assessDrugChange, drugAssessmentToAttributes, type DrugChangeAssessment } from "@/lib/agents/drug-change-assessment";
import { stableId, truncate } from "@/lib/agents/text";
import type { DrugChangeType, Evidence, ResultAction } from "@/lib/agents/types";
import { topicById, topicLabels } from "@/lib/agents/vocabulary";
import type { PubmedArticle } from "../adapters/pubmed";
import { entrezDate } from "../adapters/pubmed";
import type { AgentContext } from "../context";
import type { ResultDraft } from "../drafts";
import { DRUG_CHANGES, DRUG_SNAPSHOT_RETRIEVED_AT, type DrugChangeRecord } from "../snapshots/drug-changes";
import { evidenceFromPubmed, evidenceFromQuote, pubmedProvenance, unavailableEvidence } from "./evidence";
import { factCheck } from "./fact-check";

/**
 * DrugChangeService: change detection, not a drug directory.
 *
 * Official-status rule for Russia is strict: when the claim is about
 * registration, withdrawal, restriction or label change, GRLS is the required
 * official verification target. Because the GRLS connector is UNAVAILABLE,
 * secondary/public reports are never upgraded to an officially verified RU
 * status. They remain signals with an explicit needs_grls gate.
 */

const REGION_LABEL: Record<DrugChangeRecord["region"], string> = { RU: "Россия", US: "США", EU: "ЕС", INTL: "Международно" };

const PRACTICE_IMPACT: Record<string, string> = {
  "baxdrostat-ru-registration": "До сверки ГРЛС считать запись сигналом о возможной регистрации; не использовать её как подтверждённый официальный статус или основание для вывода о российской инструкции.",
  "baxdrostat-fda-approval": "До сверки Drugs@FDA трактовать это как сообщение об одобрении; результаты BaxHTN не заменяют официальную инструкцию.",
  "aficamten-fda-approval": "До сверки Drugs@FDA не использовать вторичное сообщение как единственный источник официального показания.",
  "aficamten-fda-rems": "Safety-сигнал требует сверки первичной инструкции и REMS; вторичный источник не заменяет официальный label.",
  "selexipag-ru-announced": "Это анонс. Не считать селексипаг зарегистрированным в РФ до появления подтверждаемой записи ГРЛС.",
  "esc-hf-2026-glp1-hfpef": "Это контекст клинической рекомендации; он не означает автоматического изменения российской инструкции или регистрационного статуса.",
  "esc-hf-2026-sglt2-inhospital": "Это контекст клинической рекомендации; он не равен изменению российской инструкции препарата.",
  "single-af-2026": "Результат исследования сам по себе не меняет официальную инструкцию или клиническую рекомендацию.",
  "staree-2026": "Результат исследования сам по себе не меняет официальную инструкцию или клиническую рекомендацию.",
};

function regulatoryActions(record: DrugChangeRecord, assessment: DrugChangeAssessment): ResultAction[] {
  const actions: ResultAction[] = [{ kind: "open_source", label: `Источник · ${record.source.name}`, href: record.source.url, requiresConfirmation: false }];
  if (assessment.grlsRequired) actions.push({ kind: "open_source", label: "Проверить в ГРЛС", href: "https://grls.rosminzdrav.ru/", requiresConfirmation: false });
  actions.push({ kind: "save", label: "Сохранить", href: null, requiresConfirmation: false });
  return actions;
}

/**
 * Title and summary carry only the reported claim. The official-verification
 * gate is shown once by the card (drugAssessment.officialVerificationLabel),
 * so it is not repeated here.
 */
function summaryFor(record: DrugChangeRecord): string {
  return record.claims[0]?.claim ?? record.title;
}

function officialEvidence(record: DrugChangeRecord, assessment: DrugChangeAssessment, nowIso: string): Evidence | null {
  if (assessment.officialVerification === "needs_grls") {
    return unavailableEvidence(
      `Официальный статус в РФ: ${record.inn}`,
      "grls",
      "ГРЛС не подключён. Регистрация, отзыв, ограничение или изменение инструкции в РФ по вторичному источнику не подтверждаются.",
      nowIso,
    );
  }
  if (assessment.officialVerification === "needs_primary_source") {
    return unavailableEvidence(
      `Официальный регуляторный статус: ${record.inn}`,
      "regulatory-primary",
      `Первичный регуляторный источник не подключён к этому сигналу${assessment.verificationTarget ? `; требуется сверка: ${assessment.verificationTarget}` : ""}.`,
      nowIso,
    );
  }
  return null;
}

export function findDrugChanges(ctx: AgentContext): ResultDraft[] {
  if (ctx.specialty !== "cardiology") return [];
  if (ctx.preference.excludedSources.includes("regulators")) return [];
  const topics = ctx.preference.topics;
  const horizonStart = ctx.now.getTime() - ctx.preference.horizonDays * 86_400_000;
  return DRUG_CHANGES
    .filter(record => !topics.length || record.topics.some(topic => topics.includes(topic)))
    .filter(record => new Date(`${record.changeDate}T00:00:00Z`).getTime() >= horizonStart)
    .map(record => drugChangeDraft(ctx, record, topics.filter(topic => record.topics.includes(topic))));
}

/**
 * Regulatory signals about drugs the physician named, in any specialty: the
 * record is about the drug, not about the specialty that collected it.
 */
export function drugChangesForDrugs(ctx: AgentContext, russianNames: readonly string[]): ResultDraft[] {
  if (ctx.preference.excludedSources.includes("regulators") || !russianNames.length) return [];
  const names = russianNames.map(name => name.toLocaleLowerCase("ru-RU").replace(/ё/g, "е"));
  return DRUG_CHANGES
    .filter(record => names.some(name => record.inn.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").includes(name)))
    .map(record => ({ ...drugChangeDraft(ctx, record, []), reasonShown: [`Препарат из вашего вопроса: ${record.inn}`] }));
}

function drugChangeDraft(ctx: AgentContext, record: DrugChangeRecord, matched: readonly string[]): ResultDraft {
  const assessment = assessDrugChange({
    type: record.type,
    region: record.region,
    status: record.status,
    sourceKind: record.source.kind,
    verificationTarget: record.verifyIn,
    practiceImpact: PRACTICE_IMPACT[record.id] ?? null,
  });
  const evidence = record.claims.map(claim => factCheck(evidenceFromQuote({
    connectorId: "regulatory-news",
    sourceName: record.source.name,
    sourceUrl: record.source.url,
    publisher: record.source.name,
    retrievedAt: DRUG_SNAPSHOT_RETRIEVED_AT,
    publishedAt: record.source.publishedAt,
    claim: claim.claim,
    quote: claim.quote,
    quoteLanguage: claim.quoteLanguage,
    quoteKind: claim.quoteKind,
    level: record.type === "IMPORTANT_NEW_STUDY" ? "secondary_news" : record.type === "GUIDELINE_CHANGE" ? "guideline" : "regulatory",
    secondary: record.source.kind === "secondary",
    verifyIn: record.verifyIn,
  }), { dateUncertain: Boolean(record.changeDateNote && /не указан/u.test(record.changeDateNote)) }));
  const official = officialEvidence(record, assessment, ctx.nowIso);
  if (official) evidence.push(official);

  // Source basis and official verification are shown once in the card facts line.
  const reasonShown = [matched.length ? `Тема: ${topicLabels(ctx.specialty, matched).join(", ")}` : "Все темы специальности"];

  return {
    key: stableId("drug", record.id),
    agentId: ctx.agentId,
    specialty: ctx.specialty,
    kind: "drug_change" as const,
    category: record.type,
    title: record.title,
    summary: summaryFor(record),
    reasonShown,
    observedAt: record.changeDate,
    evidence,
    source: {
      connectorId: "regulatory-news",
      source: record.source.name,
      sourceUrl: record.source.url,
      publisher: record.source.name,
      retrievedAt: DRUG_SNAPSHOT_RETRIEVED_AT,
      publishedAt: record.source.publishedAt,
      version: null,
      ownership: "PUBLIC_SOURCE" as const,
      dataOrigin: "curated_snapshot" as const,
    },
    actions: regulatoryActions(record, assessment),
    attributes: {
      inn: record.inn,
      brand: record.brand,
      holder: record.holder,
      region: REGION_LABEL[record.region],
      status: record.status,
      changeDate: record.changeDate,
      changeDateNote: record.changeDateNote,
      verifyIn: record.verifyIn,
      ...drugAssessmentToAttributes(assessment),
    },
    partner: null,
    rank: 0,
  };
}

/** Builds a PubMed term for randomized trials in the user's topics. */
export function drugStudyTerm(ctx: AgentContext): string | null {
  const terms = ctx.preference.topics.map(id => topicById(ctx.specialty, id)?.pubmed).filter((value): value is string => Boolean(value)).slice(0, 4);
  if (!terms.length) return null;
  return `(${terms.map(term => `(${term})`).join(" OR ")}) AND ("randomized controlled trial"[pt] OR "drug therapy"[sh])`;
}

export function drugStudyDrafts(ctx: AgentContext, articles: readonly PubmedArticle[]): ResultDraft[] {
  return articles.map(article => {
    const evidence = factCheck(evidenceFromPubmed(article, ctx.nowIso));
    const assessment: DrugChangeAssessment = {
      basis: "pubmed_metadata",
      officialVerification: "not_applicable",
      sourceBasisLabel: "Библиографическая запись PubMed",
      officialVerificationLabel: null,
      verificationTarget: article.doi ? `DOI ${article.doi}` : "полный текст публикации",
      grlsRequired: false,
      practiceImpact: "Публикация сама по себе не меняет инструкцию, регистрацию или клинические рекомендации.",
    };
    return {
      key: stableId("drug-study", article.pmid),
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind: "drug_change" as const,
      category: "IMPORTANT_NEW_STUDY" satisfies DrugChangeType,
      title: truncate(article.title, 180),
      summary: `${article.journal}${article.pubDate ? `, ${article.pubDate}` : ""}. Выводы — в тексте исследования.`,
      reasonShown: ["Рандомизированное исследование или лекарственная терапия в ваших темах"],
      observedAt: article.sortDate,
      evidence: [evidence],
      source: pubmedProvenance(article, ctx.nowIso),
      actions: [
        { kind: "open_source", label: "PubMed", href: article.url, requiresConfirmation: false },
        { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
      ],
      attributes: {
        journal: article.journal,
        pmid: article.pmid,
        doi: article.doi,
        publicationTypes: article.publicationTypes.slice(0, 3).join(", "),
        ...drugAssessmentToAttributes(assessment),
      },
      partner: null,
      rank: 0,
    };
  });
}

/** Date window for "since last check": last seen, otherwise the horizon. */
export function pubmedWindow(ctx: AgentContext, maxDays = 30): { minDate: string; maxDate: string } {
  const fallback = new Date(ctx.now.getTime() - Math.min(ctx.preference.horizonDays, maxDays) * 86_400_000);
  const since = ctx.lastSeenAt ? new Date(ctx.lastSeenAt) : fallback;
  const start = since.getTime() > fallback.getTime() ? since : fallback;
  return { minDate: entrezDate(start), maxDate: entrezDate(ctx.now) };
}
