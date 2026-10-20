import { stableId, truncate } from "@/lib/agents/text";
import type { DrugChangeType, ResultAction } from "@/lib/agents/types";
import { topicById, topicLabels } from "@/lib/agents/vocabulary";
import type { PubmedArticle } from "../adapters/pubmed";
import { entrezDate } from "../adapters/pubmed";
import type { AgentContext } from "../context";
import type { ResultDraft } from "../drafts";
import { DRUG_CHANGES, DRUG_SNAPSHOT_RETRIEVED_AT, type DrugChangeRecord } from "../snapshots/drug-changes";
import { evidenceFromPubmed, evidenceFromQuote, pubmedProvenance } from "./evidence";
import { factCheck } from "./fact-check";

/**
 * DrugChangeService: change detection, not a drug directory. It answers
 * "what changed around drugs in my topics" and never suggests a treatment.
 */

const REGION_LABEL: Record<DrugChangeRecord["region"], string> = { RU: "Россия", US: "США", EU: "ЕС", INTL: "Международно" };

function regulatoryActions(record: DrugChangeRecord): ResultAction[] {
  const actions: ResultAction[] = [{ kind: "open_source", label: `Источник · ${record.source.name}`, href: record.source.url, requiresConfirmation: false }];
  if (record.region === "RU") actions.push({ kind: "open_source", label: "Проверить в ГРЛС", href: "https://grls.rosminzdrav.ru/", requiresConfirmation: false });
  actions.push({ kind: "save", label: "Сохранить", href: null, requiresConfirmation: false });
  return actions;
}

export function findDrugChanges(ctx: AgentContext): ResultDraft[] {
  if (ctx.specialty !== "cardiology") return [];
  if (ctx.preference.excludedSources.includes("regulators")) return [];
  const topics = ctx.preference.topics;
  const horizonStart = ctx.now.getTime() - ctx.preference.horizonDays * 86_400_000;
  return DRUG_CHANGES
    .filter(record => !topics.length || record.topics.some(topic => topics.includes(topic)))
    .filter(record => new Date(`${record.changeDate}T00:00:00Z`).getTime() >= horizonStart)
    .map(record => {
      const matched = topics.filter(topic => record.topics.includes(topic));
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
      return {
        key: stableId("drug", record.id),
        agentId: ctx.agentId,
        specialty: ctx.specialty,
        kind: "drug_change" as const,
        category: record.type,
        title: record.title,
        summary: record.claims[0]?.claim ?? record.title,
        reasonShown: [matched.length ? `Тема: ${topicLabels(ctx.specialty, matched).join(", ")}` : "Все темы специальности", record.status === "announced" ? "Анонс, не вступившее в силу решение" : "Вступило в силу по данным источника"],
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
        actions: regulatoryActions(record),
        attributes: { inn: record.inn, brand: record.brand, holder: record.holder, region: REGION_LABEL[record.region], status: record.status, changeDate: record.changeDate, changeDateNote: record.changeDateNote, verifyIn: record.verifyIn },
        partner: null,
        rank: 0,
      };
    });
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
    return {
      key: stableId("drug-study", article.pmid),
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind: "drug_change" as const,
      category: "IMPORTANT_NEW_STUDY" satisfies DrugChangeType,
      title: truncate(article.title, 180),
      summary: `Новая публикация в ${article.journal}${article.pubDate ? ` (${article.pubDate})` : ""}. Агент показывает библиографию; выводы — в тексте статьи.`,
      reasonShown: ["Рандомизированное исследование или лекарственная терапия в ваших темах", "Появилось в PubMed после прошлой проверки"],
      observedAt: article.sortDate,
      evidence: [evidence],
      source: pubmedProvenance(article, ctx.nowIso),
      actions: [
        { kind: "open_source", label: "PubMed", href: article.url, requiresConfirmation: false },
        { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
      ],
      attributes: { journal: article.journal, pmid: article.pmid, doi: article.doi, publicationTypes: article.publicationTypes.slice(0, 3).join(", ") },
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
