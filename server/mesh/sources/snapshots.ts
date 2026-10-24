import { topicById } from "@/lib/agents/vocabulary";
import { nosologyById, titleMatchesNosology } from "@/lib/mesh/domain-graph";
import type { NormalizedClaim, NormalizedDocument, SourceResult } from "@/lib/mesh/evidence";
import type { SourceDescriptor, SourceStatusReport } from "@/lib/mesh/sources";
import { normalizeQuery } from "@/lib/portal/lexicon";
import { DRUG_CHANGES, DRUG_SNAPSHOT_RETRIEVED_AT } from "@/server/agents/snapshots/drug-changes";
import { GUIDELINE_SNAPSHOT_RETRIEVED_AT, GUIDELINE_UPDATES } from "@/server/agents/snapshots/guideline-updates";
import { catalogProvenance, isUnverifiedEditorialDraft } from "@/server/agents/services/evidence";
import { combineFingerprints } from "../fingerprint";
import { coverageOf, drugEntity, emptyResult, invocation, makeChunk, makeClaim, nosologyEntity, polarityOf, verifyQuote } from "./common";
import type { SourceAdapter, SourceRequest } from "./types";

/**
 * Curated snapshots and the canonical catalog, wrapped as sources. They are
 * cardiology-only by construction (AGENTS.md: other specialties never get
 * cardiology catalog objects, snapshots or fixtures).
 */

const SNAPSHOT_USAGE = { robots: null, terms: null, audience: "healthcare_professionals" as const, reuse: "excerpt_with_attribution" as const, maxExcerptChars: 600, attributionRequired: true, rateLimitPerMinute: null, agreement: "not_required" as const, openQuestions: [] };

export const ESC_DESCRIPTOR: SourceDescriptor = {
  id: "esc_guidelines_snapshot",
  name: "Рекомендации ESC (снимок редакции)",
  connectorId: "esc-guidelines",
  domains: ["guideline"],
  specialties: ["cardiology"],
  jobs: ["guideline_check", "guideline_discovery", "updates_digest", "reference_answer", "source_positions"],
  provides: ["specialty_society_guideline", "international_guideline"],
  operations: ["society_guideline"],
  authority: "secondary",
  execution: "snapshot",
  freshnessPolicy: { kind: "snapshot", reverifyAfterHours: 24 * 30, note: "Снимок обновляет редакция; утверждения — цитаты обзора публикации" },
  cachePolicy: { scope: "none", ttlSeconds: 0 },
  usagePolicy: { ...SNAPSHOT_USAGE, jurisdiction: "INT" },
  cost: 0,
  handoffUrl: "https://www.escardio.org/Guidelines",
};

export const REGULATORY_DESCRIPTOR: SourceDescriptor = {
  id: "regulatory_snapshot",
  name: "Регуляторные сообщения (снимок редакции)",
  connectorId: "regulatory-news",
  domains: ["regulatory", "drug"],
  specialties: ["cardiology"],
  jobs: ["drug_reference", "drug_comparison", "reference_answer", "updates_digest"],
  provides: ["drug_safety_signal"],
  operations: ["safety_signals"],
  authority: "secondary",
  execution: "snapshot",
  freshnessPolicy: { kind: "snapshot", reverifyAfterHours: 24 * 7, note: "Публичные сообщения с датой сбора; не замена реестрам" },
  cachePolicy: { scope: "none", ttlSeconds: 0 },
  usagePolicy: { ...SNAPSHOT_USAGE, jurisdiction: "RU" },
  cost: 0,
  handoffUrl: "https://grls.rosminzdrav.ru/",
};

export const CATALOG_DESCRIPTOR: SourceDescriptor = {
  id: "goldenset_catalog",
  name: "Каталог рекомендаций РКО (Golden Set)",
  connectorId: "catalog",
  domains: ["guideline"],
  specialties: ["cardiology"],
  jobs: ["guideline_check", "guideline_discovery", "disease_reference", "reference_answer", "source_positions"],
  provides: ["russian_guideline"],
  operations: ["guideline_discovery", "disease_reference"],
  authority: "professional",
  execution: "snapshot",
  freshnessPolicy: { kind: "snapshot", reverifyAfterHours: 24 * 30, note: "Канонический набор с версиями и статусом актуальности" },
  cachePolicy: { scope: "none", ttlSeconds: 0 },
  usagePolicy: { ...SNAPSHOT_USAGE, reuse: "link_and_metadata", jurisdiction: "RU" },
  cost: 0,
  handoffUrl: null,
};

const snapshotStatus = async (): Promise<SourceStatusReport> => ({ status: "SNAPSHOT", reason: "Снимок редакции", execution: "snapshot" });

export function createEscAdapter(): SourceAdapter {
  async function execute(request: SourceRequest): Promise<SourceResult> {
    const started = Date.now();
    const nosology = nosologyById(request.intent.context.nosology?.id);
    if (!nosology) return emptyResult(request, { sourceId: "esc_guidelines_snapshot", outcome: "empty", status: "SNAPSHOT", execution: "snapshot", started, note: "Тема вопроса не распознана" });
    const records = GUIDELINE_UPDATES.filter(record => (nosology.topicId && record.topics[0] === nosology.topicId) || record.title.toLowerCase().includes(nosology.en.toLowerCase()));
    const documents: NormalizedDocument[] = records.map(record => {
      const id = `esc:${record.id}`;
      const nosologyRef = nosologyEntity(nosology.id)!;
      const chunks = record.assertions.map((assertion, index) => makeChunk({ documentId: id, path: [record.title, `assertion ${index + 1}`], fullText: assertion.quote, maxChars: 600, keepText: true, entityIds: [nosologyRef.id] }));
      const claims: NormalizedClaim[] = record.assertions.map((assertion, index) => {
        const check = verifyQuote({ connectorId: "esc-guidelines", url: record.summarySource.url, sourceName: `${record.summarySource.name} о ${record.title}`, statement: assertion.claim, quote: assertion.quote, language: assertion.quoteLanguage, level: "guideline", secondary: true, verifyIn: record.primaryUrl, retrievedAt: GUIDELINE_SNAPSHOT_RETRIEVED_AT, publishedAt: record.summarySource.publishedAt });
        const drugs = request.intent.entities.drugs.filter(drug => assertion.quote.toLowerCase().includes(drug.inn.toLowerCase()));
        return makeClaim({ documentId: id, chunkId: chunks[index].id, kind: "society_assertion", statement: assertion.claim, quote: assertion.quote, language: "ru", polarity: polarityOf(assertion.quote), entityIds: [nosologyRef.id, ...drugs.map(drug => drugEntity(drug.inn, drug.ru).id)], covers: coverageOf(assertion.quote, nosology.id), method: "verbatim", confidence: 0.85, verification: check.verification, verificationNote: check.note });
      });
      return {
        id, sourceId: "esc_guidelines_snapshot", kind: "society_guideline_summary", title: record.title, url: record.primaryUrl, language: "en", publisher: `${record.society} · обзор ${record.summarySource.name}`,
        publishedAt: record.publishedAt, retrievedAt: GUIDELINE_SNAPSHOT_RETRIEVED_AT,
        version: { fingerprint: combineFingerprints(chunks.map(chunk => chunk.fingerprint)), label: record.title.match(/^\d{4}/u)?.[0] ?? null, date: record.publishedAt },
        jurisdiction: "INT", authority: "secondary", state: "SNAPSHOT",
        attributes: { society: record.society, previousVersion: record.previousVersion, summarySource: record.summarySource.name, summaryUrl: record.summarySource.url, doi: record.doi, titleRu: record.titleRu },
        chunks, claims, entities: [nosologyRef],
      };
    });
    return { invocation: invocation(request, { sourceId: "esc_guidelines_snapshot", outcome: documents.length ? "ok" : "empty", status: "SNAPSHOT", execution: "snapshot", started, documentIds: documents.map(document => document.id) }), documents };
  }
  return { ...ESC_DESCRIPTOR, status: snapshotStatus, execute };
}

export function createRegulatoryAdapter(): SourceAdapter {
  async function execute(request: SourceRequest): Promise<SourceResult> {
    const started = Date.now();
    const names = request.intent.entities.drugs.map(drug => normalizeQuery(drug.ru));
    const records = DRUG_CHANGES.filter(record => names.some(name => normalizeQuery(record.inn).includes(name) || normalizeQuery(record.title).includes(name)));
    const documents: NormalizedDocument[] = records.map(record => {
      const id = `regulatory:${record.id}`;
      const drug = request.intent.entities.drugs.find(item => normalizeQuery(record.inn).includes(normalizeQuery(item.ru)) || normalizeQuery(record.title).includes(normalizeQuery(item.ru)));
      const drugRef = drug ? drugEntity(drug.inn, drug.ru) : null;
      const chunks = record.claims.map((claim, index) => makeChunk({ documentId: id, path: [record.title, `claim ${index + 1}`], fullText: claim.quote, maxChars: 600, keepText: true, entityIds: drugRef ? [drugRef.id] : [] }));
      const claims = record.claims.map((claim, index) => {
        const check = verifyQuote({ connectorId: "regulatory-news", url: record.source.url, sourceName: record.source.name, statement: claim.claim, quote: claim.quote, language: claim.quoteLanguage, level: "regulatory", secondary: record.source.kind === "secondary", verifyIn: record.verifyIn, retrievedAt: DRUG_SNAPSHOT_RETRIEVED_AT, publishedAt: record.source.publishedAt });
        return makeClaim({ documentId: id, chunkId: chunks[index].id, kind: "regulatory_signal", statement: claim.claim, quote: claim.quote, language: claim.quoteLanguage, polarity: "neutral", entityIds: drugRef ? [drugRef.id] : [], covers: [], method: "verbatim", confidence: claim.quoteKind === "verbatim" ? 1 : 0.85, verification: check.verification, verificationNote: check.note });
      });
      return {
        id, sourceId: "regulatory_snapshot", kind: "regulatory_signal", title: record.title, url: record.source.url, language: "ru", publisher: record.source.name, publishedAt: record.changeDate, retrievedAt: DRUG_SNAPSHOT_RETRIEVED_AT,
        version: { fingerprint: combineFingerprints(chunks.map(chunk => chunk.fingerprint)), label: record.status, date: record.changeDate },
        jurisdiction: record.region === "RU" ? "RU" : record.region === "US" ? "US" : "INT", authority: "secondary", state: "SNAPSHOT",
        attributes: { changeType: record.type, region: record.region, verifyIn: record.verifyIn },
        chunks, claims, entities: drugRef ? [drugRef] : [],
      };
    });
    // «Nothing found» is said of the editorial snapshot only: the registries themselves were not asked (R1 C-10).
    const snapshotDate = DRUG_SNAPSHOT_RETRIEVED_AT.slice(0, 10).split("-").reverse().join(".");
    const note = documents.length ? null : `в снимке редакции от ${snapshotDate} ничего не нашлось; реестры Росздравнадзора и FDA не запрашивались`;
    return { invocation: invocation(request, { sourceId: "regulatory_snapshot", outcome: documents.length ? "ok" : "empty", status: "SNAPSHOT", execution: "snapshot", started, documentIds: documents.map(document => document.id), note }), documents };
  }
  return { ...REGULATORY_DESCRIPTOR, status: snapshotStatus, execute };
}

const CURRENTNESS: Record<string, string> = { current: "действующая версия по каталогу", review: "актуальность версии требует проверки", superseded: "есть более новая версия", archived: "архивная версия" };

export function createCatalogAdapter(): SourceAdapter {
  async function execute(request: SourceRequest): Promise<SourceResult> {
    const started = Date.now();
    const nosology = nosologyById(request.intent.context.nosology?.id);
    if (!nosology) return emptyResult(request, { sourceId: "goldenset_catalog", outcome: "empty", status: "SNAPSHOT", execution: "snapshot", started, note: "Тема вопроса не распознана" });
    const catalogTopics = nosology.topicId ? topicById("cardiology", nosology.topicId)?.catalogTopics ?? [] : [];
    const items = request.ctx.catalog.content
      .filter(item => item.kind === "guideline" && !isUnverifiedEditorialDraft(item))
      .filter(item => item.topics.some(topic => catalogTopics.includes(topic)) || titleMatchesNosology(item.title, nosology))
      .sort((a, b) => (b.publicationYear ?? 0) - (a.publicationYear ?? 0))
      .slice(0, 3);
    const documents: NormalizedDocument[] = items.map(item => {
      const id = `catalog:${item.id}`;
      const provenance = catalogProvenance(item);
      const nosologyRef = nosologyEntity(nosology.id)!;
      const chunk = makeChunk({ documentId: id, path: [item.title], fullText: [item.title, item.summary, item.version].filter(Boolean).join(". "), maxChars: 400, keepText: true, entityIds: [nosologyRef.id] });
      const statement = `«${item.title}»${item.publicationYear ? `, ${item.publicationYear}` : ""}: ${CURRENTNESS[item.currentness] ?? "статус версии не указан"}`;
      return {
        id, sourceId: "goldenset_catalog", kind: "guideline", title: item.title, url: provenance.sourceUrl ?? `/cardiology/content/${encodeURIComponent(item.id)}`, language: "ru", publisher: provenance.publisher,
        publishedAt: provenance.publishedAt, retrievedAt: provenance.retrievedAt,
        version: { fingerprint: combineFingerprints([chunk.fingerprint]), label: item.version, date: item.publicationYear ? String(item.publicationYear) : null },
        jurisdiction: "RU", authority: "professional", state: "SNAPSHOT",
        attributes: { contentId: item.id, currentness: item.currentness, supersedes: item.supersedesId, supersededBy: item.supersededById, internalHref: `/cardiology/content/${encodeURIComponent(item.id)}` },
        chunks: [chunk],
        claims: [makeClaim({ documentId: id, chunkId: chunk.id, kind: item.currentness === "current" ? "guideline_metadata" : "currentness", statement, quote: [item.title, item.version].filter(Boolean).join(" "), language: "ru", polarity: "neutral", entityIds: [nosologyRef.id], covers: coverageOf(item.title, nosology.id), method: "metadata", confidence: 1, verification: item.currentness === "current" ? "SUPPORTED" : "PARTIALLY_SUPPORTED", verificationNote: item.currentness === "current" ? null : CURRENTNESS[item.currentness] ?? null })],
        entities: [nosologyRef],
      };
    });
    return { invocation: invocation(request, { sourceId: "goldenset_catalog", outcome: documents.length ? "ok" : "empty", status: "SNAPSHOT", execution: "snapshot", started, note: documents.length ? null : `В каталоге нет рекомендаций по теме «${nosology.label}»`, documentIds: documents.map(document => document.id) }), documents };
  }
  return { ...CATALOG_DESCRIPTOR, status: snapshotStatus, execute };
}
