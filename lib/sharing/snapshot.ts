import { editorialVerification } from "@/lib/presentation/physician";
import { detectRiskSignals } from "@/lib/agents/risk-rules";
import type { AgentResult } from "@/lib/agents/types";
import { redactDirectIdentifiers } from "@/lib/clinical-case/anonymizer";
import type { SharedSnapshot, SharedSource } from "./types";

/**
 * What may leave the workspace through a link, and in what form.
 *
 * Shared: results built from public sources — a frozen copy of the title, the
 * short text and the sources (with their verification label). Never shared:
 * the physician's own files and notes, partner material, anything in which a
 * personal identifier or a description of one patient is detected.
 */

export const SHARE_TTL_DAYS = 30;

const TYPE_LABEL: Record<AgentResult["kind"], string> = {
  update: "Публикация",
  guideline_change: "Клинические рекомендации",
  drug_change: "Изменение по препарату",
  event: "Профессиональное событие",
  research_finding: "Исследование",
  learning_module: "Материал для обучения",
  material_hit: "Материал",
  reference_answer: "Ответ по источникам",
  drug_label: "Инструкция по препарату",
  partner: "Партнёрский материал",
};

export type ShareBlocker = "private_material" | "partner" | "personal_data" | "no_public_source";

export const SHARE_BLOCKER_COPY: Record<ShareBlocker, string> = {
  private_material: "Материалы из вашей библиотеки по ссылке не публикуются: их видите только вы.",
  partner: "Партнёрские материалы по ссылке не публикуются.",
  personal_data: "В тексте найдены персональные данные или описание конкретного пациента — ссылку создать нельзя.",
  no_public_source: "У результата нет публичного источника, на который можно сослаться.",
};

/** Placeholders left by masking earlier in the pipeline: the original held an identifier. */
const MASKED_MARKER = /\[(?:EMAIL|PHONE|SNILS|OMS|PASSPORT|REDACTED)\]/u;

function texts(result: AgentResult): string[] {
  return [result.title, result.summary, ...result.evidence.map(item => item.claim)];
}

/** Why a result cannot be shared, or null. Checked again on the server at creation. */
export function shareBlocker(result: AgentResult): ShareBlocker | null {
  if (result.partner || result.kind === "partner") return "partner";
  if (result.agentId === "materials" || result.kind === "material_hit" || result.source.ownership === "USER_UPLOADED" || result.evidence.some(item => item.provenance.ownership === "USER_UPLOADED")) return "private_material";
  for (const text of texts(result)) {
    // Conservative on purpose: a digit run that looks like a document number blocks the link too.
    if (MASKED_MARKER.test(text) || redactDirectIdentifiers(text).detectedMarkers.length) return "personal_data";
    if (detectRiskSignals(text).patientSpecific) return "personal_data";
  }
  const sources = sharedSources(result);
  if (!sources.some(source => source.url)) return "no_public_source";
  return null;
}

export function sharedSources(result: AgentResult): SharedSource[] {
  const seen = new Set<string>();
  const out: SharedSource[] = [];
  const add = (source: SharedSource) => {
    // Only web links leave the workspace: internal paths and other schemes are dropped.
    if (source.url && !/^https?:\/\//iu.test(source.url)) source = { ...source, url: null };
    const key = source.url ?? source.title;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(source);
  };
  if (result.source.sourceUrl) add({ title: result.source.source, url: result.source.sourceUrl, publisher: result.source.publisher, date: result.source.publishedAt, verification: null });
  for (const item of result.evidence) {
    if (!item.sourceUrl || item.provenance.ownership !== "PUBLIC_SOURCE") continue;
    add({ title: item.provenance.source, url: item.sourceUrl, publisher: item.provenance.publisher, date: item.publicationDate, verification: editorialVerification(item.verificationStatus).label });
  }
  return out.slice(0, 8);
}

export function buildSharedSnapshot(result: AgentResult, now: Date): SharedSnapshot {
  return {
    schema: "kardio.shared/1",
    kind: "result",
    specialty: result.specialty,
    typeLabel: TYPE_LABEL[result.kind],
    title: result.title.slice(0, 240),
    summary: result.summary.slice(0, 600),
    sources: sharedSources(result),
    sharedAt: now.toISOString(),
  };
}

/** Unguessable token: 24 random bytes, base64url. */
export function newShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export const SHARE_TOKEN = /^[A-Za-z0-9_-]{32}$/u;

export function sharePath(token: string): string {
  return `/s/${token}`;
}
