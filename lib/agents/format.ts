import type { DrugChangeType, VerificationStatus } from "./types";

/** Russian plural forms: [one, few, many]. */
export function plural(count: number, forms: readonly [string, string, string]): string {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function countLabel(count: number, forms: readonly [string, string, string]): string {
  return `${count} ${plural(count, forms)}`;
}

export const DRUG_CHANGE_LABEL: Record<DrugChangeType, { title: string; forms: readonly [string, string, string] }> = {
  NEW_REGISTRATION: { title: "Новые регистрации", forms: ["регистрация", "регистрации", "регистраций"] },
  WITHDRAWAL: { title: "Отзывы", forms: ["отзыв", "отзыва", "отзывов"] },
  NEW_RESTRICTION: { title: "Новые ограничения", forms: ["новое ограничение", "новых ограничения", "новых ограничений"] },
  GUIDELINE_CHANGE: { title: "Изменения в рекомендациях", forms: ["изменение в рекомендациях", "изменения в рекомендациях", "изменений в рекомендациях"] },
  LABEL_CHANGE: { title: "Изменения инструкций", forms: ["изменение инструкции", "изменения инструкций", "изменений инструкций"] },
  IMPORTANT_NEW_STUDY: { title: "Значимые исследования", forms: ["исследование", "исследования", "исследований"] },
};

export const VERIFICATION_LABEL: Record<VerificationStatus, { label: string; tone: "supported" | "partial" | "unsupported" | "unknown" }> = {
  // What was checked is the statement against the source text — not whether the source answers the question.
  SUPPORTED: { label: "Совпадает с текстом источника", tone: "supported" },
  PARTIALLY_SUPPORTED: { label: "Совпадает с источником частично", tone: "partial" },
  UNSUPPORTED: { label: "Нет в тексте источника", tone: "unsupported" },
  UNKNOWN: { label: "Сверить с источником не удалось", tone: "unknown" },
};

/** A record whose only evidence is its bibliographic entry («Опубликовано: «…» — журнал»): no text of the article was read. */
export function isBibliographicOnly(evidence: readonly { claim: string }[]): boolean {
  return evidence.length > 0 && evidence.every(item => /^Опубликовано: «/u.test(item.claim));
}

/** The fact check lowers a record whose journal is not on the physicians' list; that is the journal's standing, not a mismatch. */
const OUTSIDE_LIST = /Не в белом списке врачей/u;

export function outsideApprovedList(evidence: readonly { verificationNote?: string | null }[]): boolean {
  return evidence.some(item => OUTSIDE_LIST.test(item.verificationNote ?? ""));
}

/**
 * Why a record that matched its source was still marked «частично», in the fact check's own reasons
 * (server/agents/services/fact-check.ts). None of these says the text differs from the source.
 */
const PROCEDURAL: ReadonlyArray<[RegExp, string]> = [
  [/^Карточка составлена по документу/u, "карточка по документу — сверьте с полным текстом"],
  [/^Есть более новая версия документа/u, "есть более новая версия"],
  [/^Актуальность версии требует проверки/u, "версию сверьте"],
  [/^Архивный материал/u, "архивный материал"],
  [/^Дата указана не полностью/u, "дата указана не полностью"],
  [/^Вторичный источник/u, "сверьте в первоисточнике"],
  [/^Не в белом списке врачей/u, "журнал не из списка врачей-экспертов"],
];

/** Reasons that do say the statement and the source differ, or could only be compared in part. */
const MISMATCH = /совпадает с источником не полностью|не совпад|на разных языках|не содержит/iu;

function reasonsOf(evidence: readonly { verificationNote?: string | null }[]): string[] {
  return evidence.flatMap(item => (item.verificationNote ?? "").split(/\.\s+/u).map(part => part.trim()).filter(Boolean));
}

/**
 * The verification label for what was actually checked. When only the
 * citation was compared with PubMed, the label says so, never «Совпадает с
 * текстом источника» — no text was read. When the text matched but the record
 * still needs a check (its version, the journal's standing, the primary
 * source), the label says that check, never that the data «совпадают частично».
 */
export function verificationLabelFor(status: VerificationStatus, evidence: readonly { claim: string; verificationNote?: string | null }[]): { label: string; tone: "supported" | "partial" | "unsupported" | "unknown" } {
  const reasons = reasonsOf(evidence);
  const mismatch = reasons.some(reason => MISMATCH.test(reason));
  const checks = [...new Set(reasons.flatMap(reason => PROCEDURAL.find(([pattern]) => pattern.test(reason))?.[1] ?? []))];
  const base = isBibliographicOnly(evidence) ? "Сверены данные публикации" : "Совпадает с источником";
  if (status === "SUPPORTED") return isBibliographicOnly(evidence) ? { label: base, tone: "supported" } : VERIFICATION_LABEL.SUPPORTED;
  if (status === "PARTIALLY_SUPPORTED" && !mismatch && checks.length) return { label: `${base} · ${checks.slice(0, 2).join(" · ")}`, tone: "partial" };
  if (status === "PARTIALLY_SUPPORTED" && isBibliographicOnly(evidence)) return { label: "Данные публикации совпадают частично", tone: "partial" };
  return VERIFICATION_LABEL[status];
}

/** A record whose text or citation matched its source, whatever procedural check it still needs. */
export function matchedSource(status: VerificationStatus, evidence: readonly { claim: string; verificationNote?: string | null }[]): boolean {
  return status === "SUPPORTED" || (status === "PARTIALLY_SUPPORTED" && !reasonsOf(evidence).some(reason => MISMATCH.test(reason)) && verificationLabelFor(status, evidence).label !== VERIFICATION_LABEL.PARTIALLY_SUPPORTED.label);
}

const VERIFICATION_ORDER: Record<VerificationStatus, number> = { SUPPORTED: 3, PARTIALLY_SUPPORTED: 2, UNKNOWN: 1, UNSUPPORTED: 0 };

/** The weakest link decides how a multi-claim result is labelled. */
export function weakestVerification(statuses: readonly VerificationStatus[]): VerificationStatus {
  if (!statuses.length) return "UNKNOWN";
  return [...statuses].sort((a, b) => VERIFICATION_ORDER[a] - VERIFICATION_ORDER[b])[0];
}

export function formatDateRu(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }): string | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: "UTC" }).format(date);
}

export function formatRelativeRu(value: string | null | undefined, now = new Date()): string {
  if (!value) return "ещё не запускался";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "время неизвестно";
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} ${plural(minutes, ["минуту", "минуты", "минут"])} назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, ["час", "часа", "часов"])} назад`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${plural(days, ["день", "дня", "дней"])} назад`;
  return formatDateRu(value) ?? "давно";
}

export function daysUntil(dateIso: string, now = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((target - start) / 86_400_000);
}
