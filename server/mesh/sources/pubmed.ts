import { countLabel } from "@/lib/agents/format";
import { nosologyById, subtypeById } from "@/lib/mesh/domain-graph";
import type { EntityRef, NormalizedClaim, NormalizedDocument, SourceResult } from "@/lib/mesh/evidence";
import type { NormalizedIntent } from "@/lib/mesh/intent";
import type { SourceDescriptor, SourceStatusReport } from "@/lib/mesh/sources";
import { pubmedBroadTermFor, pubmedCoreTermFor, pubmedTermFor, type QueryConcept } from "@/lib/portal/lexicon";
import { entrezDate, type PubmedArticle } from "@/server/agents/adapters/pubmed";
import type { PubmedAbstract } from "@/server/agents/adapters/pubmed-abstracts";
import { approvedJournals } from "@/server/agents/services/source-policy";
import { excerpt } from "../browser/dom";
import { combineFingerprints, deterministicId, fingerprint } from "../fingerprint";
import { coverageOf, drugEntity, emptyResult, invocation, makeChunk, makeClaim, nosologyEntity, polarityOf, subtypeEntity, verifyQuote } from "./common";
import type { SourceAdapter, SourceRequest } from "./types";

/**
 * PubMed (NCBI E-utilities) as a source of current research: recent
 * systematic reviews, meta-analyses and guidelines, quoted verbatim from
 * the authors' conclusions. Reuses the existing live adapter; adds the
 * domain graph's subtype terms and title ranking.
 */

export const REFERENCE_PUBLICATION_TYPES = ["Systematic Review", "Meta-Analysis", "Practice Guideline", "Guideline"];
const GUIDELINE_TYPES = ["Practice Guideline", "Guideline"];
const YEARS = 6;
const MAX_WITH_CONCLUSION = 5;

export const PUBMED_DESCRIPTOR: SourceDescriptor = {
  id: "pubmed",
  name: "PubMed",
  connectorId: "pubmed",
  domains: ["research", "guideline"],
  specialties: "all",
  jobs: ["reference_answer", "guideline_check", "guideline_discovery", "disease_reference", "evidence_review", "updates_digest", "professional_article_search", "drug_reference"],
  provides: ["current_research", "international_guideline"],
  operations: ["literature_search"],
  authority: "primary",
  execution: "api",
  freshnessPolicy: { kind: "live", reverifyAfterHours: 24, note: "Поиск выполняется во время запроса; рефераты кэшируются на 6 часов" },
  cachePolicy: { scope: "process", ttlSeconds: 30 * 60 },
  usagePolicy: { robots: null, terms: { url: "https://www.ncbi.nlm.nih.gov/home/about/policies/", checkedAt: "2026-10-19", summary: "E-utilities: не более 3 запросов в секунду без ключа; рефераты — с указанием источника" }, audience: "public", reuse: "excerpt_with_attribution", maxExcerptChars: 600, attributionRequired: true, rateLimitPerMinute: 180, agreement: "not_required", jurisdiction: "INT", openQuestions: [] },
  cost: 1,
  handoffUrl: "https://pubmed.ncbi.nlm.nih.gov/",
};

function yearOf(article: PubmedArticle): string | null {
  return article.sortDate?.slice(0, 4) ?? article.pubDate?.match(/\d{4}/)?.[0] ?? null;
}

export function studyType(article: Pick<PubmedArticle, "publicationTypes">): string {
  const types = article.publicationTypes;
  if (types.some(type => /guideline/i.test(type))) return "Клинические рекомендации";
  if (types.includes("Meta-Analysis")) return "Метаанализ";
  if (types.includes("Systematic Review")) return "Систематический обзор";
  return "Обзор";
}

/** English words a PubMed term searches for (field tags, operators and wildcards removed). */
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
 * passing. Articles whose title names the question's subjects come first;
 * when at least two do, the rest are dropped as tangential.
 */
export function rerankByTitle<T extends { title: string }>(articles: readonly T[], subjectTerms: readonly string[], modifierTerms: readonly string[] = []): T[] {
  if (!subjectTerms.length) return [...articles];
  const count = (terms: readonly string[]) => {
    const groups = terms.map(termWords).filter(words => words.length);
    return (title: string) => {
      const value = title.toLowerCase();
      return groups.filter(words => words.some(word => value.includes(word.replace(/s$/u, "")))).length;
    };
  };
  const hits = count(subjectTerms);
  // What was asked about the condition («длительность», «нетяжёлое течение») breaks ties among on-topic titles.
  const asked = count(modifierTerms);
  const scored = articles.map((article, index) => ({ article, index, hits: hits(article.title), asked: asked(article.title) }));
  const onTopic = scored.filter(item => item.hits > 0);
  const pool = onTopic.length >= 2 ? onTopic : scored;
  return pool.sort((a, b) => b.hits - a.hits || b.asked - a.asked || a.index - b.index).map(item => item.article);
}

/**
 * Whether a publication was found with every condition of the question
 * (topic, qualifiers, population, what was asked) or only with part of them
 * after the search was widened. A partial match is never the answer itself.
 */
export type QuestionMatch = "all_conditions" | "partial";

/** Search concepts for an intent: the lexicon's concepts plus the domain graph's nosology and subtype. */
export function conceptsForIntent(intent: NormalizedIntent): QueryConcept[] {
  const concepts = [...intent.entities.concepts];
  const nosology = nosologyById(intent.context.nosology?.id);
  const subtype = subtypeById(intent.context.subtype?.id);
  if (nosology && !concepts.some(concept => concept.term === nosology.pubmed || termWords(concept.term).some(word => termWords(nosology.pubmed).includes(word)))) {
    concepts.unshift({ id: `nosology:${nosology.id}`, label: nosology.label, term: nosology.pubmed, kind: "topic" });
  }
  if (subtype) concepts.push({ id: `subtype:${subtype.id}`, label: subtype.label, term: subtype.pubmed, kind: "concept" });
  return concepts.slice(0, 8);
}

function entitiesFor(intent: NormalizedIntent, text: string): EntityRef[] {
  const value = text.toLowerCase();
  const refs: EntityRef[] = [];
  for (const drug of intent.entities.drugs) if (value.includes(drug.inn.toLowerCase())) refs.push(drugEntity(drug.inn, drug.ru));
  const nosology = nosologyById(intent.context.nosology?.id);
  if (nosology && nosology.rankingTerms.some(term => value.includes(term))) refs.push(nosologyEntity(nosology.id)!);
  const subtype = subtypeById(intent.context.subtype?.id);
  if (subtype && subtype.rankingTerms.some(term => value.includes(term))) refs.push(subtypeEntity(subtype.id)!);
  return refs;
}

/**
 * PubMed's sort date fills a missing month or day with 01 («2024» → 2024-01-01).
 * Keep only the precision the record actually has: YYYY, YYYY-MM or YYYY-MM-DD.
 */
export function pubmedVersionDate(pubDate: string | null, sortDate: string | null): string | null {
  if (!sortDate) return null;
  const value = (pubDate ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/u.test(value) || /^\d{4}\s+[A-Za-z]{3}\s+\d{1,2}(?!\d)/u.test(value)) return sortDate.slice(0, 10);
  if (/^\d{4}\s+[A-Za-z]{3}(?![A-Za-z-])/u.test(value)) return sortDate.slice(0, 7);
  return sortDate.slice(0, 4);
}

function articleDocument(intent: NormalizedIntent, article: PubmedArticle, abstract: PubmedAbstract | undefined, args: { approved: boolean; relevance: number; retrievedAt: string; maxExcerpt: number; match: QuestionMatch; unmatched: readonly string[] }): NormalizedDocument {
  const id = `pubmed:${article.pmid}`;
  const type = studyType(article);
  const conclusion = abstract?.conclusion ?? null;
  const full = abstract?.sections.find(section => section.label === abstract.conclusionLabel)?.text ?? conclusion ?? "";
  const entities = entitiesFor(intent, `${article.title} ${full}`);
  const nosology = nosologyById(intent.context.nosology?.id);
  const chunk = conclusion ? makeChunk({ documentId: id, path: ["Abstract", abstract?.conclusionLabel ?? "Conclusions"], fullText: full, maxChars: args.maxExcerpt, keepText: true, entityIds: entities.map(entity => entity.id) }) : null;
  const claims: NormalizedClaim[] = [];
  if (conclusion && chunk) {
    const check = verifyQuote({ connectorId: "pubmed", url: article.url, sourceName: `${article.journal || "PubMed"}${yearOf(article) ? ` · ${yearOf(article)}` : ""}`, statement: conclusion, quote: full, language: "en", level: type === "Клинические рекомендации" ? "guideline" : "peer_reviewed", secondary: false, verifyIn: null, retrievedAt: args.retrievedAt, publishedAt: article.sortDate, journal: article.journal });
    // The full section verifies the claim and fingerprints the version; only a policy-sized excerpt is kept as the quote.
    claims.push(makeClaim({ documentId: id, chunkId: chunk.id, kind: "review_conclusion", statement: conclusion, quote: excerpt(full, args.maxExcerpt).text, language: "en", polarity: polarityOf(conclusion), entityIds: entities.map(entity => entity.id), covers: nosology ? coverageOf(`${article.title} ${full}`, nosology.id) : [], method: "verbatim", confidence: 1, verification: check.verification, verificationNote: check.note }));
  }
  return {
    id, sourceId: "pubmed", kind: type === "Клинические рекомендации" ? "guideline_publication" : "review", title: article.title, url: article.url, language: "en",
    publisher: article.journalFull ?? article.journal, publishedAt: article.sortDate ?? article.pubDate, retrievedAt: args.retrievedAt,
    version: { fingerprint: chunk ? combineFingerprints([chunk.fingerprint]) : fingerprint(article.title), label: null, date: pubmedVersionDate(article.pubDate, article.sortDate) },
    jurisdiction: "INT", authority: "primary", state: "LIVE",
    attributes: { pmid: article.pmid, journal: article.journal, year: yearOf(article), studyType: type, approvedJournal: args.approved, conclusionLabel: abstract?.conclusionLabel ?? null, relevance: args.relevance, questionMatch: args.match, unmatchedConditions: args.unmatched.join(", ") || null },
    chunks: chunk ? [chunk] : [], claims, entities,
  };
}

export function createPubmedAdapter(): SourceAdapter {
  async function status(): Promise<SourceStatusReport> {
    return process.env.PUBMED_DISABLED === "1" ? { status: "UNAVAILABLE", reason: "PubMed отключён в окружении", execution: "api" } : { status: "LIVE", reason: "NCBI E-utilities", execution: "api" };
  }

  async function execute(request: SourceRequest): Promise<SourceResult> {
    const started = Date.now();
    const report = await status();
    const { ctx, intent } = request;
    if (report.status === "UNAVAILABLE" || ctx.preference.excludedSources.includes("pubmed")) {
      return emptyResult(request, { sourceId: "pubmed", outcome: "unavailable", status: "UNAVAILABLE", execution: "api", started, note: report.status === "UNAVAILABLE" ? report.reason : "PubMed исключён в вашем профиле" });
    }
    const concepts = conceptsForIntent(intent);
    const latin = intent.entities.latin;
    const term = pubmedTermFor(concepts, latin);
    if (!term) return emptyResult(request, { sourceId: "pubmed", outcome: "empty", status: report.status, execution: "api", started, note: "В вопросе нет распознанных терминов для поиска" });

    const types = request.requirement === "international_guideline" ? GUIDELINE_TYPES : REFERENCE_PUBLICATION_TYPES;
    const minDate = request.since ? entrezDate(new Date(Date.UTC(request.since, 0, 1))) : entrezDate(new Date(Date.UTC(ctx.now.getUTCFullYear() - YEARS, ctx.now.getUTCMonth(), ctx.now.getUTCDate())));
    const maxDate = entrezDate(ctx.now);
    const approved = approvedJournals();
    const approvedPmids = new Set<string>();
    const articles: PubmedArticle[] = [];
    const notes: string[] = [];
    let failure: string | null = null;
    const search = async (searchTerm: string, journals?: string[], retmax = 6) => {
      const result = await ctx.pubmed({ term: searchTerm, minDate, maxDate, retmax, journals, publicationTypes: types, sort: "relevance" });
      if (result.status !== "ok") failure = result.error ?? result.status;
      return result.status === "ok" ? result.articles : [];
    };
    // Which search found an article: the strict one (every condition) or a widened one (and what it dropped).
    const matches = new Map<string, { match: QuestionMatch; unmatched: string[] }>();
    const add = (items: readonly PubmedArticle[], match: QuestionMatch = "all_conditions", unmatched: string[] = []) => {
      for (const article of items) {
        if (articles.some(item => item.pmid === article.pmid)) continue;
        articles.push(article);
        matches.set(article.pmid, { match, unmatched });
      }
    };
    const subjects = concepts.filter(concept => concept.kind === "topic" || concept.kind === "concept" || concept.kind === "drug").map(concept => concept.term);
    const modifiers = concepts.filter(concept => concept.kind === "modifier");
    const onTopic = () => rerankByTitle(articles, subjects).length;

    const first = await search(term, approved, 4);
    for (const article of first) approvedPmids.add(article.pmid);
    add(first);
    if (!failure && onTopic() < 3) add(await search(term));
    const core = pubmedCoreTermFor(concepts, latin);
    if (!failure && onTopic() < 2 && core) {
      const relaxed = await search(core);
      if (relaxed.length) notes.push(`по всем условиям вопроса нашлось мало обзоров — поиск расширен без условий: ${modifiers.map(concept => concept.label).join(", ")}`);
      add(relaxed, "partial", modifiers.map(concept => concept.label));
    }
    const broad = pubmedBroadTermFor(concepts, latin);
    if (!failure && !articles.length && broad) {
      const broader = await search(broad);
      if (broader.length) notes.push("совпадения всех терминов нет — показаны обзоры по части вопроса");
      add(broader, "partial", modifiers.map(concept => concept.label));
    }
    if (failure && !articles.length) {
      return emptyResult(request, { sourceId: "pubmed", outcome: /недоступ|unavailable/iu.test(failure) ? "unavailable" : "failed", status: report.status, execution: "api", started, errorCode: "pubmed_error", note: `PubMed: ${failure}` });
    }

    const level = (article: PubmedArticle) => Number(matches.get(article.pmid)?.match !== "all_conditions");
    // Every-condition matches first: a widened match never displaces one that answers the question.
    const ranked = rerankByTitle(articles, subjects, modifiers.map(concept => concept.term)).map((article, index) => ({ article, index })).sort((a, b) => level(a.article) - level(b.article) || a.index - b.index).map(item => item.article);
    const top = ranked.slice(0, MAX_WITH_CONCLUSION + 1);
    const read = top.length ? await ctx.abstracts(top.map(article => article.pmid)) : { status: "ok" as const, abstracts: [], error: null, durationMs: 0 };
    if (read.status !== "ok") notes.push(`выводы рефератов не прочитаны: ${read.error ?? "PubMed недоступен"}`);
    const byPmid = new Map(read.abstracts.map(item => [item.pmid, item]));
    const documents: NormalizedDocument[] = [];
    let withConclusion = 0;
    for (const [index, article] of top.entries()) {
      const abstract = byPmid.get(article.pmid);
      if (abstract?.conclusion) {
        if (withConclusion >= MAX_WITH_CONCLUSION) continue;
        withConclusion += 1;
      } else if (documents.length - withConclusion >= 2) continue;
      const found = matches.get(article.pmid) ?? { match: "all_conditions" as const, unmatched: [] };
      documents.push(articleDocument(intent, article, abstract, { approved: approvedPmids.has(article.pmid), relevance: index, retrievedAt: ctx.nowIso, maxExcerpt: PUBMED_DESCRIPTOR.usagePolicy.maxExcerptChars!, match: found.match, unmatched: found.unmatched }));
    }
    if (ranked.length < articles.length) notes.push(`${countLabel(articles.length - ranked.length, ["публикация упоминает", "публикации упоминают", "публикаций упоминают"])} тему вопроса только вскользь — скрыты`);
    return {
      invocation: invocation(request, { sourceId: "pubmed", outcome: documents.length ? "ok" : "empty", status: report.status, execution: "api", started, note: notes.join("; ") || null, documentIds: documents.map(document => document.id), urls: [`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`] }),
      documents,
    };
  }

  return { ...PUBMED_DESCRIPTOR, status, execute };
}

/** Stable key of a question for result identity (never logged). */
export function questionKey(intent: NormalizedIntent): string {
  return deterministicId("q", intent.id);
}
