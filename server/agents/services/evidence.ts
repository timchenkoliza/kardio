import { stableId } from "@/lib/agents/text";
import type { DataOrigin, Evidence, EvidenceLevel, Provenance, SourceOwnership } from "@/lib/agents/types";
import type { ContentObject } from "@/lib/domain/types";
import type { PubmedArticle } from "../adapters/pubmed";
import { GOLDENSET_SNAPSHOT_AT } from "../connectors";

/**
 * EvidenceService: provenance is a first-class object. Every evidence item
 * keeps source, URL, publisher, retrieval and publication dates and version.
 * Verification status starts as UNKNOWN; FactCheckService decides it.
 */

export function isUnverifiedEditorialDraft(content: ContentObject): boolean {
  return content.sourceId.startsWith("hardcoded-editorial") || content.source.trustStatus === "requires_review";
}

function catalogEvidenceLevel(content: ContentObject): EvidenceLevel {
  if (content.kind === "guideline" || content.kind === "clinical") return "guideline";
  if (content.kind === "event") return "event_listing";
  if (content.kind === "service") return "catalog_metadata";
  return "professional_news";
}

export function catalogProvenance(content: ContentObject): Provenance {
  return {
    connectorId: "catalog",
    source: content.source.name,
    sourceUrl: content.canonicalUrl ?? content.source.url,
    publisher: content.source.publisher ?? content.source.name,
    retrievedAt: content.lastCheckedAt ? `${content.lastCheckedAt}T00:00:00.000Z` : GOLDENSET_SNAPSHOT_AT,
    publishedAt: content.publicationDate ?? (content.publicationYear ? String(content.publicationYear) : null),
    version: content.version,
    ownership: "PUBLIC_SOURCE",
    dataOrigin: "catalog_snapshot",
  };
}

export function evidenceFromCatalog(content: ContentObject, claim?: string): Evidence {
  const provenance = catalogProvenance(content);
  const statement = claim ?? (content.summary && content.summary.length > 24 ? content.summary : `${content.type}: ${content.title}`);
  return {
    id: stableId("ev", "catalog", content.id, statement),
    claim: statement,
    sourceId: content.sourceId,
    sourceUrl: provenance.sourceUrl,
    sourceType: catalogEvidenceLevel(content),
    publicationDate: provenance.publishedAt,
    retrievedAt: provenance.retrievedAt,
    evidenceLevel: catalogEvidenceLevel(content),
    confidence: 1,
    verificationStatus: "UNKNOWN",
    verificationNote: null,
    supportText: [content.title, content.summary, content.type, content.source.name, content.version ? `версия ${content.version}` : "", content.publicationYear ? String(content.publicationYear) : ""].filter(Boolean).join(". "),
    provenance,
  };
}

export function pubmedProvenance(article: PubmedArticle, retrievedAt: string): Provenance {
  return {
    connectorId: "pubmed",
    source: article.journalFull ?? article.journal ?? "PubMed",
    sourceUrl: article.url,
    publisher: "PubMed / NCBI",
    retrievedAt,
    publishedAt: article.sortDate ?? article.pubDate,
    version: null,
    ownership: "PUBLIC_SOURCE",
    dataOrigin: "runtime_api",
  };
}

export function evidenceFromPubmed(article: PubmedArticle, retrievedAt: string): Evidence {
  const provenance = pubmedProvenance(article, retrievedAt);
  const claim = `Опубликовано: «${article.title}» — ${article.journal}${article.pubDate ? `, ${article.pubDate}` : ""}`;
  return {
    id: stableId("ev", "pubmed", article.pmid),
    claim,
    sourceId: `pubmed:${article.pmid}`,
    sourceUrl: article.url,
    sourceType: "peer_reviewed",
    publicationDate: provenance.publishedAt,
    retrievedAt,
    evidenceLevel: "peer_reviewed",
    confidence: 1,
    verificationStatus: "UNKNOWN",
    verificationNote: null,
    supportText: `Опубликовано: «${article.title}» — ${article.journal}${article.pubDate ? `, ${article.pubDate}` : ""}`,
    provenance,
  };
}

export interface QuoteEvidenceInput {
  connectorId: string;
  sourceName: string;
  sourceUrl: string;
  publisher: string | null;
  retrievedAt: string;
  publishedAt: string | null;
  version?: string | null;
  claim: string;
  quote: string;
  quoteLanguage: "en" | "ru";
  quoteKind: "verbatim" | "page_extract";
  level: EvidenceLevel;
  ownership?: SourceOwnership;
  dataOrigin?: DataOrigin;
  secondary: boolean;
  verifyIn?: string | null;
}

export interface QuoteEvidence extends Evidence {
  quoteLanguage: "en" | "ru";
  quoteKind: "verbatim" | "page_extract";
  secondary: boolean;
  verifyIn: string | null;
}

export function evidenceFromQuote(input: QuoteEvidenceInput): QuoteEvidence {
  const provenance: Provenance = {
    connectorId: input.connectorId,
    source: input.sourceName,
    sourceUrl: input.sourceUrl,
    publisher: input.publisher,
    retrievedAt: input.retrievedAt,
    publishedAt: input.publishedAt,
    version: input.version ?? null,
    ownership: input.ownership ?? "PUBLIC_SOURCE",
    dataOrigin: input.dataOrigin ?? "curated_snapshot",
  };
  return {
    id: stableId("ev", input.connectorId, input.sourceUrl, input.claim),
    claim: input.claim,
    sourceId: input.connectorId,
    sourceUrl: input.sourceUrl,
    sourceType: input.level,
    publicationDate: input.publishedAt,
    retrievedAt: input.retrievedAt,
    evidenceLevel: input.level,
    confidence: input.quoteKind === "verbatim" ? 1 : 0.85,
    verificationStatus: "UNKNOWN",
    verificationNote: null,
    supportText: input.quote,
    provenance,
    quoteLanguage: input.quoteLanguage,
    quoteKind: input.quoteKind,
    secondary: input.secondary,
    verifyIn: input.verifyIn ?? null,
  };
}

/** Evidence placeholder for a capability that could not run. Never SUPPORTED. */
export function unavailableEvidence(claim: string, connectorId: string, note: string, retrievedAt: string): Evidence {
  return {
    id: stableId("ev", "unavailable", connectorId, claim),
    claim,
    sourceId: connectorId,
    sourceUrl: null,
    sourceType: "unknown",
    publicationDate: null,
    retrievedAt,
    evidenceLevel: "unknown",
    confidence: 0,
    verificationStatus: "UNKNOWN",
    verificationNote: note,
    supportText: null,
    provenance: { connectorId, source: connectorId, sourceUrl: null, publisher: null, retrievedAt, publishedAt: null, version: null, ownership: "PUBLIC_SOURCE", dataOrigin: "none" },
  };
}

const LEVEL_WEIGHT: Record<EvidenceLevel, number> = {
  guideline: 6,
  regulatory: 5,
  peer_reviewed: 5,
  professional_news: 3,
  secondary_news: 2,
  event_listing: 2,
  catalog_metadata: 1,
  user_material: 3,
  unknown: 0,
};

export function evidenceLevelWeight(level: EvidenceLevel): number {
  return LEVEL_WEIGHT[level];
}
