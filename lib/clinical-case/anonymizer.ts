import type { CaseAnonymizationStatus } from "./types";

type Rule = { label: string; pattern: RegExp; replacement: string };

// A street name: one or two words or a number with a word («Ленина», «Красных Зорь», «8 Марта»), never the rest of the sentence.
const STREET = String.raw`(?:\d{1,3}(?:-?(?:го|я|й))?\s+)?[А-ЯЁ][\p{L}-]+(?:\s+[А-ЯЁ][\p{L}-]+)?`;
// House, building and flat after a street or on their own («д. 5», «д. 5/2 корп. 1», «кв. 3»).
const HOUSE = String.raw`(?:,?\s*(?:д\.|дом)\s*\d+[а-яА-Я]?(?:\s*\/\s*\d+)?)?(?:,?\s*(?:корп\.|к\.|стр\.|строение)\s*\d+)?(?:,?\s*(?:кв\.|квартира)\s*\d+)?`;
// Surname suffixes, so that a single initial after a capitalised word is taken for a name only when the word is a surname.
const SURNAME = String.raw`[А-ЯЁ][а-яё]+(?:ов|ев|ёв|ин|ын|ова|ева|ёва|ина|ына|ский|цкий|ская|цкая|ко|ук|юк|ич|ян|дзе|швили|ых|их)`;

const REDACTION_RULES: Rule[] = [
  { label: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, replacement: "[EMAIL]" },
  { label: "phone", pattern: /(?<!\d)(?:\+7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}(?!\d)/gu, replacement: "[PHONE]" },
  { label: "snils", pattern: /(?<!\d)\d{3}-?\d{3}-?\d{3}[\s-]?\d{2}(?!\d)/gu, replacement: "[SNILS]" },
  { label: "oms", pattern: /(?<!\d)\d{16}(?!\d)/gu, replacement: "[OMS]" },
  { label: "passport", pattern: /(?<!\d)\d{2}\s?\d{2}\s?\d{6}(?!\d)/gu, replacement: "[PASSPORT]" },
  // Medical record or case history number («медкарта № 123456», «история болезни 45/2021», «амб. карта N 778»).
  { label: "record", pattern: /(?<![\p{L}\p{N}])(?:мед(?:ицинск\p{L}*)?\.?\s*карт\p{L}*|амб(?:улаторн\p{L}*)?\.?\s*карт\p{L}*|карт\p{L}*\s+пациент\p{L}*|истори\p{L}*\s+болезни|номер\s+карты|№\s*карты|ИБ)\s*(?:№|N|#|номер)?\s*[:\-—]?\s*[\p{L}]{0,3}[-\s]?\d[\d/\-]{1,15}/giu, replacement: "[НОМЕР КАРТЫ]" },
  { label: "fio", pattern: /(?<![\p{L}\p{N}])(?:ФИО|Пациент|Пациентка)\s*[:—-]\s*[^\n,;]{4,80}/giu, replacement: "ФИО: [REDACTED]" },
  // «ФИО» without a colon, followed by a name («ФИО Кузнецов Пётр»).
  { label: "fio", pattern: /(?<![\p{L}\p{N}])ФИО(?:\s+пациент\p{L}*)?\s+[А-ЯЁ][а-яё]+(?:[-‐][А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+|\s+[А-ЯЁ]\.\s?(?:[А-ЯЁ]\.)?){0,2}/gu, replacement: "ФИО: [REDACTED]" },
  // A surname with two initials, either order («Иванов И.И.», «Иванов И. И.», «И.И. Иванов»), or a surname by its suffix with one initial («Петрова А.»).
  { label: "fio", pattern: new RegExp(String.raw`(?<![\p{L}])(?:[А-ЯЁ][а-яё]+(?:[-‐][А-ЯЁ][а-яё]+)?\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.?|[А-ЯЁ]\.\s?[А-ЯЁ]\.\s?[А-ЯЁ][а-яё]{2,}(?:[-‐][А-ЯЁ][а-яё]+)?|${SURNAME}\s+[А-ЯЁ]\.)(?![\p{L}])`, "gu"), replacement: "[ФИО]" },
  { label: "address", pattern: /(?<![\p{L}\p{N}])(?:адрес|место жительства)\s*[:—-]\s*[^\n]{5,120}/giu, replacement: "Адрес: [REDACTED]" },
  // A street with its house and flat («ул. Ленина д. 5 кв. 3», «проспект Мира, 12», «пер. Садовый»).
  { label: "address", pattern: new RegExp(String.raw`(?<![\p{L}\p{N}])(?:ул\.|улица|пр-т|пр-кт|просп\.|проспект|пер\.|переулок|ш\.|шоссе|б-р|бульвар|наб\.|набережная|пл\.|площадь|мкр\.?|микрорайон)\s*${STREET}(?:,?\s*\d+[а-яА-Я]?(?![\p{L}\p{N}]))?${HOUSE}`, "gu"), replacement: "[АДРЕС]" },
  // A house with a flat on its own («д. 5, кв. 3»).
  { label: "address", pattern: /(?<![\p{L}\p{N}])(?:д\.|дом)\s*\d+[а-яА-Я]?(?:\s*\/\s*\d+)?(?:,?\s*(?:корп\.|к\.|стр\.)\s*\d+)?,?\s*(?:кв\.|квартира)\s*\d+/gu, replacement: "[АДРЕС]" },
  { label: "birth_date", pattern: /(?<![\p{L}\p{N}])(?:дата рождения|д\.\s*р\.)\s*[:—-]?\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?![\p{L}\p{N}_])/giu, replacement: "Дата рождения: [REDACTED]" },
  // A year of birth («1956 г.р.», «1956 г. р.», «1956 года рождения», «г.р. 1956»).
  { label: "birth_date", pattern: /(?<![\p{N}])(?:(?:19|20)\d{2}\s*(?:г\.?\s*р\.?|года?\s+рождения|гр\.)|(?:г\.\s*р\.|год\s+рождения)\s*[:—-]?\s*(?:19|20)\d{2})(?![\p{L}\p{N}])/giu, replacement: "[ГОД РОЖДЕНИЯ]" },
];

/** A placeholder left by redaction («[ФИО]», «ФИО: [REDACTED]»): never a word of the question. */
export const REDACTION_PLACEHOLDER = /(?:(?:ФИО|Адрес|Дата рождения):\s*)?\[(?:REDACTED|EMAIL|PHONE|SNILS|OMS|PASSPORT|ФИО|АДРЕС|ГОД РОЖДЕНИЯ|НОМЕР КАРТЫ)\]/gu;

const REVIEW_HINTS = [
  /(?<![\p{L}\p{N}_])(?:ФИО|фамили[яи]|имя|отчество)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:адрес|улица|дом|квартира)(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])(?:номер карты|медицинская карта|история болезни)(?![\p{L}\p{N}_])/iu,
];

export type RedactionRuleId = "email" | "phone" | "snils" | "oms" | "passport" | "record" | "fio" | "address" | "birth_date";

/** The rules in the order they run; the de-identification tool lets a physician switch them per preset. */
export const REDACTION_RULE_IDS: readonly RedactionRuleId[] = [...new Set(REDACTION_RULES.map(rule => rule.label as RedactionRuleId))];

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
    if (!rulesApplied.includes(id)) rulesApplied.push(id);
    const matches = redactedText.match(rule.pattern)?.length ?? 0;
    rule.pattern.lastIndex = 0;
    if (matches) {
      if (!detectedMarkers.includes(rule.label)) detectedMarkers.push(rule.label);
      counts[id] = (counts[id] ?? 0) + matches;
      redactedText = redactedText.replace(rule.pattern, rule.replacement);
    }
    rule.pattern.lastIndex = 0;
  }

  // The placeholders themselves («ФИО: [REDACTED]») are not hints of what is left.
  const remaining = redactedText.replace(REDACTION_PLACEHOLDER, " ");
  const needsReview = REVIEW_HINTS.some(pattern => pattern.test(remaining));
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
