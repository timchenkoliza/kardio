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

/**
 * The verification label for what was actually checked. When only the
 * citation was compared with PubMed, the label says so, never «Совпадает с
 * текстом источника» — no text was read.
 */
export function verificationLabelFor(status: VerificationStatus, evidence: readonly { claim: string }[]): { label: string; tone: "supported" | "partial" | "unsupported" | "unknown" } {
  if (isBibliographicOnly(evidence) && status === "SUPPORTED") return { label: "Сверены данные публикации", tone: "supported" };
  if (isBibliographicOnly(evidence) && status === "PARTIALLY_SUPPORTED") return { label: "Данные публикации совпадают частично", tone: "partial" };
  return VERIFICATION_LABEL[status];
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
