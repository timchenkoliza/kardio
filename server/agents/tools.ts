import { approvedJournals } from "./services/source-policy";
import { topicById } from "@/lib/agents/vocabulary";
import { specialties } from "@/lib/specialty";
import type { ContentObject } from "@/lib/domain/types";
import type { DrugLabel } from "./adapters/openfda";
import type { PubmedArticle } from "./adapters/pubmed";
import type { PubmedAbstract } from "./adapters/pubmed-abstracts";
import type { AgentContext } from "./context";
import { timedTool, type ResultDraft, type ToolOutput } from "./drafts";
import { findDrugChanges as findDrugChangeDrafts } from "./services/drug-change";
import { evidenceLevelWeight } from "./services/evidence";
import { searchEvents as searchEventRecords, type NormalizedEvent } from "./services/event";
import { checkInputRisk, type InputRiskDecision } from "./services/risk";
import { catalogGuidelineChanges, societyGuidelineChanges } from "./services/guideline-diff";
import { generateLearningPlan as buildLearningPlan } from "./services/learning";
import { searchUserMaterials as searchMaterials, type MaterialHit } from "./services/material";
import { matchPartnerContent as matchPartner } from "./services/partner";
import { retrieveDocument as retrieveCatalogDocument, searchMedical as searchCatalog, searchSources as searchCatalogSources, sourcePreferenceMatches, type CatalogHit } from "./services/search";
import { filterCatalogForResearch, pubmedAllowedForResearch, researchRunOptionsFor } from "./services/research-runtime-policy";
import { SOURCE_OPTIONS } from "@/lib/agents/vocabulary";
import { factCheck as factCheckEvidence } from "./services/fact-check";

/**
 * Tool layer: capability interfaces shared by all agents. Agents never talk to
 * connectors directly; every call is timed and records the connectors it used
 * and their integration mode (LIVE / MOCK / UNAVAILABLE).
 */

export function searchMedical(ctx: AgentContext, args: { query?: string | null; kinds?: ReadonlyArray<ContentObject["kind"]>; limit?: number; topics?: string[]; requireTopicMatch?: boolean }): Promise<ToolOutput<CatalogHit>> {
  return timedTool("searchMedical", ["catalog"], () => {
    const researchOptions = ctx.agentId === "research" ? researchRunOptionsFor(ctx.profile) : null;
    const content = researchOptions ? filterCatalogForResearch(ctx.catalog.content, researchOptions) : ctx.catalog.content;
    const baseArgs = {
      specialty: ctx.specialty,
      content,
      topicIds: args.topics ?? ctx.preference.topics,
      query: args.query,
      trustedSources: ctx.preference.trustedSources,
      excludedSources: ctx.preference.excludedSources,
      requireTopicMatch: args.requireTopicMatch,
    };
    const limit = args.limit ?? 12;
    const main = searchCatalog({ ...baseArgs, kinds: args.kinds, limit });

    if (!researchOptions || researchOptions.contentScope !== "all") return { items: main };

    const guidelines = searchCatalog({ ...baseArgs, kinds: ["guideline", "clinical"], limit: Math.min(2, limit) });
    const seen = new Set<string>();
    const items = [...guidelines, ...main].filter(hit => {
      if (seen.has(hit.content.id)) return false;
      seen.add(hit.content.id);
      return true;
    }).slice(0, limit);
    return { items };
  });
}

/**
 * PubMed scope of the physician's specialty, used when no topic narrows the
 * search. Matched on titles: an abstract that merely mentions children is not
 * a pediatric guideline, and «why you see this» must stay true.
 */
export function specialtyScopeTerm(ctx: AgentContext): string {
  return specialties[ctx.specialty].pubmedScope.replace(/\[tiab\]/g, "[ti]");
}

export function pubmedTermForTopics(ctx: AgentContext, topics: readonly string[] = ctx.preference.topics): string | null {
  const terms = topics.map(id => topicById(ctx.specialty, id)?.pubmed).filter((value): value is string => Boolean(value)).slice(0, 5);
  if (!terms.length) return null;
  return terms.map(term => `(${term})`).join(" OR ");
}

/**
 * Journal filter for PubMed: journals the physicians approved (or approved
 * with a condition) plus journals the user explicitly trusts. PubMed itself is
 * a catalogue, not a quality mark («частично» in the physicians' validation).
 */
export function trustedJournals(ctx: AgentContext): string[] {
  const chosen = ctx.preference.trustedSources.map(id => SOURCE_OPTIONS.find(option => option.id === id)?.pubmedJournal).filter((value): value is string => Boolean(value));
  return [...new Set([...approvedJournals(), ...chosen])];
}

export function searchPubmed(ctx: AgentContext, args: { term: string | null; minDate?: string; maxDate?: string; retmax?: number; journals?: string[]; publicationTypes?: string[]; sort?: "pub_date" | "relevance" }): Promise<ToolOutput<PubmedArticle>> {
  return timedTool("searchPubmed", ["pubmed"], async () => {
    if (ctx.agentId === "research") {
      const researchOptions = researchRunOptionsFor(ctx.profile);
      if (researchOptions.sourceScope === "russia") return { items: [], status: "ok", note: "PubMed пропущен: выбран поиск только по источникам РФ" };
      if (researchOptions.contentScope === "guidelines") return { items: [], status: "ok", note: "PubMed пропущен: выбран поиск только по клиническим рекомендациям" };
      if (!pubmedAllowedForResearch(researchOptions)) return { items: [], status: "ok", note: "PubMed пропущен фильтром конкретных сайтов" };
    }
    if (ctx.preference.excludedSources.includes("pubmed")) return { items: [], status: "unavailable", note: "PubMed исключён в вашем профиле" };
    if (!args.term) return { items: [], status: "partial", note: "Нет тем для поиска" };
    const result = await ctx.pubmed({ term: args.term, minDate: args.minDate, maxDate: args.maxDate, retmax: args.retmax, journals: args.journals, publicationTypes: args.publicationTypes, ...(args.sort ? { sort: args.sort } : {}) });
    return { items: result.articles, status: result.status === "ok" ? "ok" : result.status === "unavailable" ? "unavailable" : "failed", note: result.error };
  });
}

export function searchSources(ctx: AgentContext) {
  return timedTool("searchSources", ["catalog"], () => ({ items: searchCatalogSources(ctx.catalog.sources, ctx.preference.trustedSources, ctx.preference.excludedSources) }));
}

export function retrieveDocument(ctx: AgentContext, id: string) {
  return timedTool("retrieveDocument", ["catalog"], () => {
    const document = retrieveCatalogDocument(ctx.catalog.content, id);
    return { items: document ? [document] : [] };
  });
}

/** rankEvidence(): organic ranking only — partner items are ranked separately. */
export function rankEvidence(ctx: AgentContext, drafts: ResultDraft[]): Promise<ToolOutput<ResultDraft>> {
  return timedTool("rankEvidence", [], () => {
    const scored = drafts.filter(draft => !draft.partner).map(draft => {
      const levelScore = Math.max(0, ...draft.evidence.map(item => evidenceLevelWeight(item.evidenceLevel)));
      const trusted = sourcePreferenceMatches(draft.source.connectorId, ctx.preference.trustedSources) || draft.evidence.some(item => sourcePreferenceMatches(item.sourceId, ctx.preference.trustedSources)) ? 3 : 0;
      const supported = draft.evidence.filter(item => item.verificationStatus === "SUPPORTED").length;
      const standing = draft.source.standing ?? draft.evidence.find(item => item.provenance.standing)?.provenance.standing;
      const physicians = standing === "approved" ? 3 : standing === "conditional" ? 2 : standing === "reviewed_not_whitelisted" ? -2 : 0;
      const recency = draft.observedAt ? Math.max(0, 4 - Math.floor((ctx.now.getTime() - new Date(draft.observedAt.length === 4 ? `${draft.observedAt}-01-01` : draft.observedAt).getTime()) / (30 * 86_400_000))) : 0;
      return { draft, score: levelScore + trusted + supported + recency + physicians };
    });
    const ranked = scored.sort((a, b) => b.score - a.score || a.draft.key.localeCompare(b.draft.key)).map((entry, index) => ({ ...entry.draft, rank: entry.draft.rank || index + 1 }));
    return { items: [...ranked, ...drafts.filter(draft => draft.partner)] };
  });
}

/** factCheck(): re-validates any evidence that has not been checked yet. */
export function factCheck(drafts: ResultDraft[]): Promise<ToolOutput<ResultDraft>> {
  return timedTool("factCheck", [], () => ({
    items: drafts.map(draft => ({ ...draft, evidence: draft.evidence.map(item => item.verificationStatus === "UNKNOWN" && item.supportText ? factCheckEvidence(item) : item) })),
  }));
}

export function riskCheck(text: string): Promise<ToolOutput<InputRiskDecision>> {
  return timedTool("riskCheck", [], () => {
    const decision = checkInputRisk(text);
    return { items: [decision], status: decision.allowed ? "ok" : "blocked", note: decision.blockedReason };
  });
}

export function guidelineDiff(ctx: AgentContext): Promise<ToolOutput<ResultDraft>> {
  const connectors = ctx.specialty === "cardiology" ? ["catalog", "esc-guidelines"] : ["catalog"];
  return timedTool("guidelineDiff", connectors, () => ({ items: [...societyGuidelineChanges(ctx), ...catalogGuidelineChanges(ctx)] }));
}

export function findDrugChanges(ctx: AgentContext): Promise<ToolOutput<ResultDraft>> {
  return timedTool("findDrugChanges", ["regulatory-news", "grls"], () => {
    const items = findDrugChangeDrafts(ctx);
    return { items, status: "partial", note: "ГРЛС не подключён: записи из публичных сообщений требуют сверки с реестром" };
  });
}

export function searchEvents(ctx: AgentContext): Promise<ToolOutput<NormalizedEvent>> {
  return timedTool("searchEvents", ["events-listings", "nmo-portal"], () => ctx.specialty === "cardiology"
    ? { items: searchEventRecords(ctx), status: "partial", note: "Портал НМО не подключён — используется снимок афиш" }
    : { items: [], status: "unavailable", note: "Для этой специальности нет проверенной афиши событий" });
}

export function generateLearningPlan(ctx: AgentContext): Promise<ToolOutput<ResultDraft>> {
  return timedTool("generateLearningPlan", ["catalog", "esc-guidelines", "events-listings"], () => ({ items: buildLearningPlan(ctx) }));
}

export function searchUserMaterials(ctx: AgentContext, query: string): Promise<ToolOutput<MaterialHit>> {
  return timedTool("searchUserMaterials", ["user-uploads"], () => ({ items: searchMaterials(ctx.materials, query) }));
}

export function matchPartnerContent(ctx: AgentContext): Promise<ToolOutput<ResultDraft>> {
  return timedTool("matchPartnerContent", ["partner-channel"], () => ({ items: matchPartner(ctx) }));
}

/** lookupDrugLabel(): verbatim sections of the current US label (openFDA, LIVE). */
export function lookupDrugLabel(ctx: AgentContext, genericName: string): Promise<ToolOutput<DrugLabel>> {
  return timedTool("lookupDrugLabel", ["openfda-labels"], async () => {
    const result = await ctx.drugLabel(genericName);
    if (result.status === "ok" && result.label) return { items: [result.label], status: "ok", note: null };
    if (result.status === "not_found") return { items: [], status: "ok", note: `В базе FDA нет инструкции для «${genericName}»` };
    return { items: [], status: result.status === "failed" ? "failed" : "unavailable", note: result.error };
  });
}

/** readAbstracts(): conclusions of the found reviews and guidelines (NCBI efetch, LIVE). */
export function readAbstracts(ctx: AgentContext, pmids: readonly string[]): Promise<ToolOutput<PubmedAbstract>> {
  return timedTool("readAbstracts", ["pubmed"], async () => {
    if (!pmids.length) return { items: [], status: "ok", note: null };
    const result = await ctx.abstracts(pmids);
    return { items: result.abstracts, status: result.status === "ok" ? "ok" : "unavailable", note: result.error };
  });
}
