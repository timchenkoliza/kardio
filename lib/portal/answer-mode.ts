/**
 * AnswerMode — how deep one request goes. Not an agent and not a job: the job
 * is routed from the words, the mode travels with the request into run
 * metadata and shapes execution (representation density, structured-evidence
 * depth). The profile holds the physician's default; a request may override it.
 */

export const ANSWER_MODES = ["short", "full", "research"] as const;
export type AnswerMode = (typeof ANSWER_MODES)[number];

export const DEFAULT_ANSWER_MODE: AnswerMode = "full";

export interface AnswerModeCopy {
  id: AnswerMode;
  label: string;
  secondary: string;
  /** What the mode does with the run, in the physician's words (profile help). */
  detail: string;
  icon: "zap" | "list" | "chart";
}

export const ANSWER_MODE_COPY: Record<AnswerMode, AnswerModeCopy> = {
  // The same three names as «Что получить» on the review and on its result: one setting, one vocabulary.
  short: { id: "short", label: "Найти статьи", secondary: "Сводная таблица без длинного отчёта", detail: "В разборе исследований — список статей по вопросу.", icon: "zap" },
  full: { id: "full", label: "Краткий обзор", secondary: "Короткая сводка + проверяемые находки", detail: "В разборе исследований — краткий обзор: что нашли, почему можно доверять, ограничения.", icon: "list" },
  research: { id: "research", label: "Академическая основа", secondary: "Читает до 4 статей вместо 3; можно уйти и вернуться", detail: "В разборе исследований — основа для академического текста; занимает больше времени.", icon: "chart" },
};

export function isAnswerMode(value: unknown): value is AnswerMode {
  return typeof value === "string" && (ANSWER_MODES as readonly string[]).includes(value);
}

/** The mode of a request: what was asked for, else the profile default, else the product default. */
export function resolveAnswerMode(profile: { answerMode?: AnswerMode | null } | null | undefined, requested?: AnswerMode | null): AnswerMode {
  if (requested && isAnswerMode(requested)) return requested;
  if (profile?.answerMode && isAnswerMode(profile.answerMode)) return profile.answerMode;
  return DEFAULT_ANSWER_MODE;
}

/** Representation density the compiler uses for a mode (the claim count decides otherwise). */
export function densityForMode(mode: AnswerMode | null | undefined): "compact" | "standard" | null {
  if (mode === "short") return "compact";
  if (mode === "research") return "standard";
  return null;
}
