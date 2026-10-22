import type { EvidenceLevel, VerificationStatus } from "@/lib/agents/types";
import type { EntityRef, NormalizedClaim, SemanticChunk, SourceInvocation, SourceOutcome, SourceResult } from "@/lib/mesh/evidence";
import { nosologyById, SUBTYPES } from "@/lib/mesh/domain-graph";
import type { SourceExecution, SourceStatus } from "@/lib/mesh/sources";
import { evidenceFromQuote } from "@/server/agents/services/evidence";
import { factCheck } from "@/server/agents/services/fact-check";
import { excerpt } from "../browser/dom";
import { deterministicId, fingerprint } from "../fingerprint";
import type { SourceRequest } from "./types";

/** Deterministic polarity cues (Russian and English). Never a model. */
const NEGATIVE = /(?:не рекомендуется|не рекомендован|не показан|не следует|противопоказан|отсутствуют (?:убедительные )?доказательства|нет (?:убедительных )?доказательств|не доказан|not recommended|no (?:significant )?(?:benefit|difference)|did not (?:reduce|improve)|insufficient evidence)/iu;
const POSITIVE = /(?:рекомендуется|рекомендован|показан[аоы]? (?:для|при|к)|для снижения риска|следует назначать|снижает риск|reduced? the risk|is recommended|should be considered|improved?|significantly (?:reduced|lower))/iu;

export function polarityOf(text: string): NormalizedClaim["polarity"] {
  if (NEGATIVE.test(text)) return "negative";
  if (POSITIVE.test(text)) return "positive";
  return "neutral";
}

const ALL_EF = /независимо от (?:величины )?(?:фракции выброса|фв)|regardless of (?:left ventricular )?ejection fraction|across the (?:full )?(?:spectrum|range) of ejection fraction/iu;

/** Subtype coverage a text states about a nosology («независимо от ФВ» covers every subtype). */
export function coverageOf(text: string, nosologyId: string): string[] {
  const subtypes = SUBTYPES.filter(subtype => subtype.nosology === nosologyId);
  if (ALL_EF.test(text)) return subtypes.map(subtype => subtype.id);
  const value = text.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
  return subtypes.filter(subtype => subtype.match.some(pattern => new RegExp(pattern, "u").test(value)) || subtype.sectionTerms.some(term => value.includes(term))).map(subtype => subtype.id);
}

export function drugEntity(inn: string, ru: string): EntityRef {
  return { id: `drug:${inn.toLowerCase().replace(/\s+/gu, "-")}`, kind: "drug", label: ru, codes: { inn } };
}

export function nosologyEntity(id: string): EntityRef | null {
  const node = nosologyById(id);
  return node ? { id: `nosology:${node.id}`, kind: "nosology", label: node.label, codes: { icd10: [...node.icd10] } } : null;
}

export function subtypeEntity(id: string): EntityRef | null {
  const node = SUBTYPES.find(item => item.id === id);
  return node ? { id: `subtype:${node.id}`, kind: "subtype", label: node.label } : null;
}

export function makeChunk(args: { documentId: string; path: string[]; fullText: string; maxChars: number | null; keepText: boolean; entityIds?: string[] }): SemanticChunk {
  const cut = args.keepText ? (args.maxChars ? excerpt(args.fullText, args.maxChars) : { text: args.fullText, truncated: false }) : { text: "", truncated: true };
  return {
    id: deterministicId("chunk", args.documentId, args.path.join(" > ")),
    documentId: args.documentId,
    path: args.path,
    heading: args.path.at(-1) ?? "",
    text: cut.text,
    fingerprint: fingerprint(args.fullText),
    entityIds: args.entityIds ?? [],
    truncated: cut.truncated,
  };
}

/** Verification of a quoted claim through the existing FactCheck gate (provenance, numbers, lexical support, source standing). */
export function verifyQuote(args: { connectorId: string; url: string; sourceName: string; statement: string; quote: string; language: "ru" | "en"; level: EvidenceLevel; secondary: boolean; verifyIn: string | null; retrievedAt: string; publishedAt: string | null; journal?: string | null }): { verification: VerificationStatus; note: string | null } {
  const evidence = evidenceFromQuote({
    connectorId: args.connectorId,
    sourceName: args.sourceName,
    sourceUrl: args.url,
    publisher: null,
    retrievedAt: args.retrievedAt,
    publishedAt: args.publishedAt,
    claim: args.statement,
    quote: args.quote,
    quoteLanguage: args.language,
    quoteKind: "verbatim",
    level: args.level,
    secondary: args.secondary,
    verifyIn: args.verifyIn,
    dataOrigin: "runtime_api",
  });
  const checked = factCheck(args.journal ? { ...evidence, provenance: { ...evidence.provenance, journal: args.journal } } : evidence);
  return { verification: checked.verificationStatus, note: checked.verificationNote };
}

export function makeClaim(args: Omit<NormalizedClaim, "id"> & { idParts?: string[] }): NormalizedClaim {
  const { idParts, ...claim } = args;
  return { id: deterministicId("claim", claim.documentId, claim.kind, claim.chunkId ?? "", ...(idParts ?? [claim.statement])), ...claim };
}

export function invocation(request: SourceRequest, args: { sourceId: SourceInvocation["sourceId"]; outcome: SourceOutcome; status: SourceStatus; execution: SourceExecution; started: number; errorCode?: string | null; note?: string | null; documentIds?: string[]; urls?: string[] }): SourceInvocation {
  return {
    stepId: request.stepId,
    sourceId: args.sourceId,
    operation: request.operation,
    requirement: request.requirement,
    outcome: args.outcome,
    status: args.status,
    execution: args.execution,
    durationMs: Date.now() - args.started,
    errorCode: args.errorCode ?? null,
    note: args.note ?? null,
    documentIds: args.documentIds ?? [],
    urls: args.urls ?? [],
  };
}

export function emptyResult(request: SourceRequest, args: Parameters<typeof invocation>[1]): SourceResult {
  return { invocation: invocation(request, args), documents: [] };
}
