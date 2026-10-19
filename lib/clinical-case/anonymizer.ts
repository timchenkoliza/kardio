import type { CaseAnonymizationStatus } from "./types";

type Rule = { label: string; pattern: RegExp; replacement: string };

const REDACTION_RULES: Rule[] = [
  { label: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, replacement: "[EMAIL]" },
  { label: "phone", pattern: /(?<!\d)(?:\+7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}(?!\d)/gu, replacement: "[PHONE]" },
  { label: "snils", pattern: /(?<!\d)\d{3}-?\d{3}-?\d{3}[\s-]?\d{2}(?!\d)/gu, replacement: "[SNILS]" },
  { label: "oms", pattern: /(?<!\d)\d{16}(?!\d)/gu, replacement: "[OMS]" },
  { label: "passport", pattern: /(?<!\d)\d{2}\s?\d{2}\s?\d{6}(?!\d)/gu, replacement: "[PASSPORT]" },
  { label: "fio", pattern: /\b(?:ФИО|Пациент|Пациентка)\s*[:—-]\s*[^\n,;]{4,80}/giu, replacement: "ФИО: [REDACTED]" },
  { label: "address", pattern: /\b(?:адрес|место жительства)\s*[:—-]\s*[^\n]{5,120}/giu, replacement: "Адрес: [REDACTED]" },
  { label: "birth_date", pattern: /\b(?:дата рождения|д\.\s*р\.)\s*[:—-]?\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/giu, replacement: "Дата рождения: [REDACTED]" },
];

const REVIEW_HINTS = [
  /\b(?:ФИО|фамили[яи]|имя|отчество)\b/iu,
  /\b(?:адрес|улица|дом|квартира)\b/iu,
  /\b(?:номер карты|медицинская карта|история болезни)\b/iu,
];

export interface LocalRedactionResult {
  redactedText: string;
  detectedMarkers: string[];
  status: CaseAnonymizationStatus;
}

export function redactDirectIdentifiers(text: string): LocalRedactionResult {
  let redactedText = text;
  const detectedMarkers: string[] = [];

  for (const rule of REDACTION_RULES) {
    if (rule.pattern.test(redactedText)) {
      detectedMarkers.push(rule.label);
      rule.pattern.lastIndex = 0;
      redactedText = redactedText.replace(rule.pattern, rule.replacement);
    }
    rule.pattern.lastIndex = 0;
  }

  const needsReview = REVIEW_HINTS.some(pattern => pattern.test(redactedText));
  return {
    redactedText,
    detectedMarkers,
    status: needsReview ? "needs_review" : "clean",
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
