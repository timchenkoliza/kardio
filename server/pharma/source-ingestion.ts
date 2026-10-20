import "server-only";

import type { Evidence, VerificationStatus } from "@/lib/agents/types";
import {
  addSourceEvidence,
  type ClaimComplianceStatus,
  type ContentStudioClaim,
  type ContentStudioPackage,
  type ContentStudioSource,
  type ContentStudioSourceKind,
} from "@/lib/pharma/content-studio";
import { factCheck } from "@/server/agents/services/fact-check";
import { evaluateSourcePolicy } from "@/server/agents/services/source-policy";

const CLAIM_HINT = /(сниж|повыш|увелич|уменьш|риск|эффектив|безопас|рекоменд|показан|противопоказ|доз|терап|лечен|пациент|исследован|частот|смертност|выживаем|госпитал|артериаль|давлен|инфаркт|инсульт|сердеч|препарат|лекарств|adverse|risk|efficacy|safety|recommended|patients|treatment|trial|mortality|hospital)/iu;
const NUMBER_HINT = /\d+(?:[.,]\d+)?\s*(?:%|мг|г|мл|мм\s*рт|mg|g|ml|mmhg)?/iu;

export interface ContentStudioSourceInput {
  kind: ContentStudioSourceKind;
  title: string;
  url: string | null;
  text: string;
}

function compact(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function extractClaimCandidates(text: string): string[] {
  const parts = text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+/u)
    .map(compact)
    .filter(value => value.length >= 30 && value.length <= 700)
    .filter(value => CLAIM_HINT.test(value) || NUMBER_HINT.test(value));
  return [...new Set(parts)].slice(0, 12);
}

function externalEvidence(source: ContentStudioSource, claim: string): Evidence {
  return {
    id: `phev-${crypto.randomUUID()}`,
    claim,
    sourceId: source.id,
    sourceUrl: source.url,
    sourceType: "user_material",
    publicationDate: null,
    retrievedAt: source.ingestedAt,
    evidenceLevel: "user_material",
    confidence: 1,
    verificationStatus: "UNKNOWN",
    verificationNote: null,
    supportText: claim,
    provenance: {
      connectorId: "content-studio-source-ingestion",
      source: source.title,
      sourceUrl: source.url,
      publisher: null,
      retrievedAt: source.ingestedAt,
      publishedAt: null,
      version: null,
      ownership: "PUBLIC_SOURCE",
      dataOrigin: "user_content",
    },
  };
}

function checkSuppliedExternalFragment(source: ContentStudioSource, claim: string): { status: VerificationStatus; note: string | null } {
  const checked = factCheck(externalEvidence(source, claim));
  if (checked.verificationStatus === "SUPPORTED") {
    return {
      status: "PARTIALLY_SUPPORTED",
      note: "Утверждение есть во вставленном фрагменте; оригинал страницы ещё не сверен.",
    };
  }
  return { status: checked.verificationStatus, note: checked.verificationNote };
}

function complianceFor(source: ContentStudioSource, verification: VerificationStatus): { status: ClaimComplianceStatus; reasons: string[] } {
  if (source.standing === "rejected") return { status: "blocked", reasons: ["Источник отклонён врачами при проверке источников."] };
  if (source.kind === "partner_material") {
    return { status: "needs_review", reasons: ["Материал партнёра — основа для утверждений, но не независимое доказательство.", "До публикации утверждение нужно подтвердить внешним источником."] };
  }
  if (!source.url) return { status: "blocked", reasons: ["У внешнего источника нет URL для проверки."] };
  if (verification === "UNSUPPORTED") return { status: "blocked", reasons: ["Утверждение не совпадает с переданным фрагментом."] };
  const reasons = ["Текст вставлен вручную и ещё не сверен с оригиналом."];
  if (source.standing === "approved") reasons.push("Источник одобрен врачами; фрагмент нужно сверить с оригиналом.");
  else if (source.standing === "conditional") reasons.push("Источник одобрен врачами с условием.");
  else if (source.standing === "reviewed_not_whitelisted") reasons.push("Источник проверен врачами, но не входит в белый список.");
  else reasons.push("Источник ещё не проверен врачами.");
  return { status: "needs_review", reasons };
}

export function ingestContentStudioSource(
  pkg: ContentStudioPackage,
  input: ContentStudioSourceInput,
  now = new Date().toISOString(),
): ContentStudioPackage {
  if (pkg.status !== "draft") throw new Error("package_not_editable");
  const text = input.text.trim();
  const title = compact(input.title);
  if (!title || text.length < 20) throw new Error("source_content_required");
  const policy = evaluateSourcePolicy(input.url);
  const source: ContentStudioSource = {
    id: `phsrc-${crypto.randomUUID()}`,
    kind: input.kind,
    title,
    url: input.url,
    suppliedText: text,
    standing: policy.standing,
    policyLabel: policy.label,
    policyNote: policy.note,
    ingestedAt: now,
  };

  const claims: ContentStudioClaim[] = extractClaimCandidates(text).map(candidate => {
    let verificationStatus: VerificationStatus = "UNKNOWN";
    let verificationNote: string | null = "Партнёрский исходник не является независимым evidence.";
    if (source.kind === "external_reference") {
      const checked = checkSuppliedExternalFragment(source, candidate);
      verificationStatus = checked.status;
      verificationNote = checked.note;
    }
    const compliance = complianceFor(source, verificationStatus);
    return {
      id: `phclaim-${crypto.randomUUID()}`,
      text: candidate,
      sourceId: source.id,
      supportText: candidate,
      verificationStatus,
      verificationNote,
      complianceStatus: compliance.status,
      complianceReasons: compliance.reasons,
      allowedFormats: [],
      createdAt: now,
    };
  });

  return addSourceEvidence(pkg, source, claims, now);
}
