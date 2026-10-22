import type { CaseAnonymizationStatus } from "./types";

type Rule = { label: string; pattern: RegExp; replacement: string };

const REDACTION_RULES: Rule[] = [
  { label: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, replacement: "[EMAIL]" },
  { label: "phone", pattern: /(?<!\d)(?:\+7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}(?!\d)/gu, replacement: "[PHONE]" },
  { label: "snils", pattern: /(?<!\d)\d{3}-?\d{3}-?\d{3}[\s-]?\d{2}(?!\d)/gu, replacement: "[SNILS]" },
  { label: "oms", pattern: /(?<!\d)\d{16}(?!\d)/gu, replacement: "[OMS]" },
  { label: "passport", pattern: /(?<!\d)\d{2}\s?\d{2}\s?\d{6}(?!\d)/gu, replacement: "[PASSPORT]" },
  { label: "fio", pattern: /(?<![\p{L}\p{N}])(?:ФИО|Пациент|Пациентка)\s*[:—-]\s*[^\n,;]{4,80}/giu, replacement: "ФИО: [REDACTED]" },
  { label: "address", pattern: /(?<![\p{L}\p{N}])(?:адрес|место жительства)\s*[:—-]\s*[^\n]{5,120}/giu, replacement: "Адрес: [REDACTED]" },
  { label: "birth_date", pattern: /(?<![\p{L}\p{N}])(?:дата рождения|д\.\s*р\.)\s*[:—-]?\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?![\p{L}\p{N}_])/giu, replacement: "Дата рождения: [REDACTED]" },
];

const REVIEW_HINTS = [
  /(?<![\p{L}\p{N}_])(?:ФИО|фамили[яи]|имя|отчество)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:адрес|улица|дом|квартира)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:номер карты|медицинская карта|история болезни)(?![\p{L}\p{N}_])/iu,
];

export type RedactionRuleId = "email" | "phone" | "snils" | "oms" | "passport" | "fio" | "address" | "birth_date";

/** The rules in the order they run; the de-identification tool lets a physician switch them per preset. */
export const REDACTION_RULE_IDS: readonly RedactionRuleId[] = REDACTION_RULES.map(rule => rule.label as RedactionRuleId);

export interface LocalRedactionResult {
  redactedText: string;
  detectedMarkers: string[];
  status: CaseAnonymizationStatus;
  /** Replacements made per rule (only rules that matched). */
  counts: Partial<Record<RedactionRuleId, number>>;
  /** Rules that ran on this text. */
  rulesApplied: RedactionRuleId[];
}

export function redactDirectIdentifiers(text: string, options: { rules?: readonly RedactionRuleId[] } = {}): LocalRedactionResult {
  let redactedText = text;
  const detectedMarkers: string[] = [];
  const counts: Partial<Record<RedactionRuleId, number>> = {};
  const enabled = options.rules ? new Set(options.rules) : null;
  const rulesApplied: RedactionRuleId[] = [];

  for (const rule of REDACTION_RULES) {
    const id = rule.label as RedactionRuleId;
    if (enabled && !enabled.has(id)) continue;
    rulesApplied.push(id);
    const matches = redactedText.match(rule.pattern)?.length ?? 0;
    rule.pattern.lastIndex = 0;
    if (matches) {
      detectedMarkers.push(rule.label);
      counts[id] = matches;
      redactedText = redactedText.replace(rule.pattern, rule.replacement);
    }
    rule.pattern.lastIndex = 0;
  }

  const needsReview = REVIEW_HINTS.some(pattern => pattern.test(redactedText));
  return {
    redactedText,
    detectedMarkers,
    status: needsReview ? "needs_review" : "clean",
    counts,
    rulesApplied,
  };
}

export function isLocallyReadableClinicalFile(file: File): boolean {
  return /\.(?:txt|csv|md)$/iu.test(file.name) || /^(?:text\/plain|text\/csv|text\/markdown)$/iu.test(file.type);
}

export function attachmentKind(file: File): "text" | "pdf" | "dicom" | "image" | "other" {
  if (isLocallyReadableClinicalFile(file)) return "text";
  if (file.type === "application/pdf" || /\.pdf$/iu.test(file.name)) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  if (/\.(?:dcm|dicom)$/iu.test(file.name) || /dicom/iu.test(file.type)) return "dicom";
  return "other";
}
