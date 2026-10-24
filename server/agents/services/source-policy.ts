import "server-only";

import validation from "@/data/source-validation-b2d.json";
import { STANDING_LABEL, type SourceDecision, type SourceStanding, type SourceWhitelist } from "@/lib/agents/source-policy";

export { STANDING_LABEL };
export type { SourceDecision, SourceStanding, SourceWhitelist };

/**
 * Physician source validation ("Валидация источников B2D", medical trainers).
 * The sheet is data (data/source-validation-b2d.json); this module only reads
 * it and turns each row into a standing the agents can act on:
 *
 *   approved                 whitelist «Да»                      → ranked first
 *   conditional              «Условно» (or confirmed, unstated)  → only what the condition allows
 *   reviewed_not_whitelisted confirmed / partial, whitelist «Нет» → at most «частично подтверждено»
 *   rejected                 «опровергнуто»                       → never used as evidence
 *   unreviewed               not in the sheet                     → labelled, no automatic upgrade
 */


export interface SourceValidationRow {
  host: string;
  brand: string;
  path?: string;
  journal?: string;
  decision: SourceDecision;
  product: string;
  whitelist: SourceWhitelist;
  condition?: string;
  verdict: { reliable: string; medical: string; practical: string };
  note: string;
}

export interface SourceAssessment {
  standing: SourceStanding;
  label: string;
  brand: string | null;
  host: string | null;
  decision: SourceDecision | null;
  condition: string | null;
  note: string | null;
}

export const SOURCE_VALIDATION = validation as unknown as {
  version: number;
  title: string;
  updatedAt: string;
  sources: SourceValidationRow[];
};

const STANDING_ORDER: Record<SourceStanding, number> = { approved: 0, conditional: 1, unreviewed: 2, reviewed_not_whitelisted: 3, rejected: 4 };

export function standingRank(standing: SourceStanding): number {
  return STANDING_ORDER[standing];
}

export function standingOf(row: SourceValidationRow): SourceStanding {
  if (row.decision === "refuted") return "rejected";
  if (row.whitelist === "yes") return "approved";
  if (row.whitelist === "conditional") return "conditional";
  if (row.whitelist === "unspecified" && row.decision === "confirmed") return "conditional";
  return "reviewed_not_whitelisted";
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./u, "");
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return normalizeHost(new URL(url).hostname); } catch { return null; }
}

function pathOf(url: string | null | undefined): string {
  if (!url) return "";
  try { return new URL(url).pathname.toLowerCase(); } catch { return ""; }
}

/**
 * Sections of one host that the sheet assesses separately. Matching by path is
 * an implementation detail, so it lives here and not in the trainers' data.
 */
const PATH_HINTS: Array<{ host: string; prefix: string; brand: string }> = [
  { host: "fda.gov", prefix: "/safety/medwatch", brand: "MedWatch" },
  { host: "roszdravnadzor.gov.ru", prefix: "/drugs", brand: "Росздравнадзор — лекарственные средства" },
  { host: "roszdravnadzor.gov.ru", prefix: "/medproducts", brand: "Росздравнадзор — медицинские изделия" },
  { host: "nature.com", prefix: "/nm", brand: "Nature Medicine" },
  { host: "nature.com", prefix: "/nbt", brand: "Nature Biotechnology" },
  { host: "nature.com", prefix: "/ncomms", brand: "Nature Communications" },
  { host: "nature.com", prefix: "/natbiomedeng", brand: "Nature Biomedical Engineering" },
  { host: "ssrn.com", prefix: "/sol3/papers.cfm", brand: "SSRN" },
];

const rowsByHost = new Map<string, SourceValidationRow[]>();
for (const row of SOURCE_VALIDATION.sources) {
  const key = normalizeHost(row.host);
  rowsByHost.set(key, [...(rowsByHost.get(key) ?? []), row]);
}

const rowsByJournal = new Map<string, SourceValidationRow>();
for (const row of SOURCE_VALIDATION.sources) if (row.journal) rowsByJournal.set(row.journal.toLowerCase(), row);

function assessment(row: SourceValidationRow | null, host: string | null): SourceAssessment {
  if (!row) return { standing: "unreviewed", label: STANDING_LABEL.unreviewed, brand: null, host, decision: null, condition: null, note: null };
  const standing = standingOf(row);
  return {
    standing,
    label: STANDING_LABEL[standing],
    brand: row.brand,
    host,
    decision: row.decision,
    condition: row.condition ?? (standing === "conditional" ? row.note || null : null),
    note: row.note || null,
  };
}

/** Journal-level assessment for literature found through PubMed (ISO abbreviation, e.g. "Nat Med"). */
export function assessJournal(journal: string | null | undefined): SourceAssessment | null {
  if (!journal) return null;
  const key = journal.trim().toLowerCase().replace(/\.$/u, "");
  const exact = rowsByJournal.get(key);
  if (exact) return assessment(exact, null);
  if (key.startsWith("lancet ")) {
    const specialty = SOURCE_VALIDATION.sources.find(row => row.brand === "The Lancet — specialty journals") ?? null;
    return assessment(specialty, "thelancet.com");
  }
  if (key === "bmj evid based med") return assessment(SOURCE_VALIDATION.sources.find(row => row.host === "ebm.bmj.com") ?? null, "ebm.bmj.com");
  return null;
}

/** Assess a source by URL (and, for literature, by journal). */
export function assessSource(input: { url?: string | null; journal?: string | null }): SourceAssessment {
  const byJournal = assessJournal(input.journal);
  if (byJournal) return byJournal;
  const host = hostOf(input.url);
  // A publication's standing is its journal's: a journal the physicians did not assess is «не оценивался», never
  // the standing of the catalogue it was found in (PubMed's own row) (R1 C-7).
  if (input.journal?.trim()) return assessment(null, host);
  if (!host) return assessment(null, null);
  const rows = rowsByHost.get(host);
  if (!rows?.length) return assessment(null, host);
  if (rows.length === 1) return assessment(rows[0], host);
  const path = pathOf(input.url);
  const explicit = rows.find(row => row.path && path.startsWith(row.path.toLowerCase()));
  if (explicit) return assessment(explicit, host);
  const hint = PATH_HINTS.find(item => item.host === host && path.startsWith(item.prefix));
  const hinted = hint ? rows.find(row => row.brand === hint.brand) : undefined;
  if (hinted) return assessment(hinted, host);
  // Several sections, none identified: take the most conservative assessment.
  const conservative = [...rows].sort((a, b) => standingRank(standingOf(b)) - standingRank(standingOf(a)))[0];
  return assessment(conservative, host);
}

/** Journals the physicians approved (or approved with a condition) for literature monitoring. */
export function approvedJournals(): string[] {
  const journals = SOURCE_VALIDATION.sources
    .filter(row => row.journal && (standingOf(row) === "approved" || standingOf(row) === "conditional"))
    .map(row => row.journal as string);
  return [...new Set(journals)];
}

export function rowsByStanding(): Record<SourceStanding, SourceValidationRow[]> {
  const groups: Record<SourceStanding, SourceValidationRow[]> = { approved: [], conditional: [], reviewed_not_whitelisted: [], rejected: [], unreviewed: [] };
  for (const row of SOURCE_VALIDATION.sources) groups[standingOf(row)].push(row);
  return groups;
}

export interface SourcePolicyEvaluation {
  standing: SourceStanding;
  label: string;
  note: string | null;
  matchedBrand: string | null;
}

/** URL-only evaluation used by pharma source ingestion; same resolver as the agents. */
export function evaluateSourcePolicy(url: string | null): SourcePolicyEvaluation {
  if (!url) return { standing: "unreviewed", label: STANDING_LABEL.unreviewed, note: "URL не указан: источник нельзя сопоставить с врачебной валидацией.", matchedBrand: null };
  try { new URL(url); } catch { return { standing: "unreviewed", label: STANDING_LABEL.unreviewed, note: "Некорректный URL источника.", matchedBrand: null }; }
  const assessment = assessSource({ url });
  if (!assessment.brand) return { standing: "unreviewed", label: STANDING_LABEL.unreviewed, note: "Источник отсутствует в таблице врачебной валидации B2D.", matchedBrand: null };
  return { standing: assessment.standing, label: assessment.label, note: assessment.condition ?? assessment.note, matchedBrand: assessment.brand };
}
