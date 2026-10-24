import { DRUGS } from "@/lib/portal/lexicon";
import type { CaseAnonymizationStatus } from "./types";

/** `keep` leaves a match as it is (a drug or an eponym that looks like a surname). */
type Rule = { label: string; pattern: RegExp; replacement: string; keep?: (match: string, offset: number, text: string) => boolean };

const fold = (word: string) => word.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
const DRUG_STEMS = [...new Set(DRUGS.flatMap(drug => [drug.ru, ...drug.stems]).filter(stem => !/\s/u.test(stem)).map(fold))];
// Drug and laboratory word endings that read like a surname («Аспирин», «Варфарина», «Креатинин», «Инсулин»).
const TERM_ENDING = /(?:статин|прил|сартан|олол|дипин|парин|фарин|ксабан|гатран|флозин|глиптин|формин|оксин|пирин|сулин|мицин|циллин|азол|тиазид|семид|амин|глобин|тинин|терин|ритин|понин|бумин|рубин|теин|тонин|цин|мидин|фен|зепам|тидин|кислот)\p{L}{0,3}$/u;
// An eponym: the surname names a disease, a sign or a method («Эпилепсия Кожевникова», «болезнь Паркинсона»).
const EPONYM_BEFORE = /(?<![\p{L}])(?:болезн|синдром|эпилепси|кардиомиопати|аномали|триад|феномен|тетрад|пентад|опухол|лимфом|саркома|рефлекс|симптом|признак|шкал|индекс|критери|метод|операци|проб|тест|узел|пучок|закон|классификаци|формул|маневр|манёвр|при[её]м|точк|лини|треугольник|петл|киста|гипотез|теори|эффект|реакци|окраск)\p{L}*\s+$/iu;
/** A capitalised word that is a drug, a laboratory term or an eponym — never a person. */
function notAPerson(match: string, offset: number, text: string): boolean {
  const word = fold(match.trim().split(/[\s,]+/u)[0] ?? "");
  if (DRUG_STEMS.some(stem => word.startsWith(stem.length > 6 ? stem.slice(0, stem.length - 1) : stem)) || TERM_ENDING.test(word)) return true;
  return EPONYM_BEFORE.test(text.slice(Math.max(0, offset - 40), offset));
}

// A street name: one or two words or a number with a word («Ленина», «Красных Зорь», «8 Марта»), never the rest of the sentence.
const STREET = String.raw`(?:\d{1,3}(?:-?(?:го|я|й))?\s+)?[А-ЯЁ][\p{L}-]+(?:\s+[А-ЯЁ][\p{L}-]+)?`;
// House, building and flat after a street or on their own («д. 5», «д. 5/2 корп. 1», «кв. 3», «кв 7»).
const HOUSE = String.raw`(?:,?\s*(?:д\.|дом)\s*\d+[а-яА-Я]?(?:\s*\/\s*\d+)?)?(?:,?\s*(?:корп\.|к\.|стр\.|строение)\s*\d+)?(?:,?\s*(?:кв\.?|квартира)\s*\d+)?`;
// A house number, with a flat after a hyphen or a slash («32», «5-3», «12-45», «5/2»); never a range with a unit after it.
const NUMBER = String.raw`\d{1,3}[а-яА-Я]?(?:\s*[-/]\s*\d{1,4})?(?![\p{N}])(?!\s*(?:%|мг|мкг|мл|мкмоль|ммоль|г\/|ед|лет|года|мм|кг|раз|мин|ч\b))`;
// Street types, written before the name («ул. Ленина») or after it («Ленинский проспект»).
const STREET_TYPE = String.raw`(?:ул\.|ул(?=\s)|улица|пр-т|пр-кт|просп\.|проспект|пер\.|переулок|ш\.|шоссе|б-р|бульвар|наб\.|набережная|пл\.|площадь|проезд|мкр\.?|микрорайон)`;
// A patronymic in any case («Иванович», «Ивановичу», «Сергеевна», «Сергеевной»).
const PATRONYMIC = String.raw`[А-ЯЁ][а-яё]*(?:(?:ович|евич|ьич)(?:а|у|ем|е)?|(?:овн|евн|ичн|иничн)(?:а|ы|е|у|ой))`;
const MONTHS = "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря";
// Surname suffixes, so that a single initial after a capitalised word is taken for a name only when the word is a surname.
const SURNAME = String.raw`[А-ЯЁ][а-яё]+(?:ов|ев|ёв|ин|ын|ова|ева|ёва|ина|ына|ский|цкий|ская|цкая|ко|ук|юк|ич|ян|дзе|швили|ых|их)`;
// The same surnames in any case («Сидоровой», «Иванову», «Петровским»).
const SURNAME_ANY = String.raw`[А-ЯЁ][а-яё]+(?:(?:ов|ев|ёв|ин|ын)(?:а|у|ым|ом|ой|ую|е)?|(?:ск|цк)(?:ий|ая|ого|ому|им|ом|ой|ую)|ко|ук|юк|ич|ян|дзе|швили|ых|их)`;
// A number that is a dose, a value or a stage, not a house: a unit or a scale word comes after it.
const NOT_A_HOUSE = String.raw`(?!\s*(?:%|мг|мкг|мл|мкмоль|ммоль|г\/|ед|лет|года|мм|кг|раз|мин|ч\b|мно|стади|степен|класс|ст\.|балл|недел|мес|дн|сут|час|случа|пункт))`;

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
  // A role word with the name after it, in any case («Пациентка Петрова Анна Сергеевна», «больному Кузнецову»): the
  // role stays, the name goes. Cyrillic names only: «Patient Reported Outcomes» is a term, not a person.
  { label: "fio", pattern: /(?<![\p{L}])([Пп]ациент(?:ка|ки|ке|ку|кой|а|у|ом|е)?|[Бб]ольн(?:ой|ого|ому|ым|ом|ая|ую))\s+[А-ЯЁ][а-яё]+(?:[-‐][А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){0,2}(?:\s+[А-ЯЁ]\.\s?(?:[А-ЯЁ]\.)?)?/gu, replacement: "$1 [ФИО]" },
  // A full name with a patronymic in any case, without a role word: «Петрова Анна Сергеевна», «Кузнецову Петру Ивановичу».
  { label: "fio", pattern: new RegExp(String.raw`(?<![\p{L}])(?:[А-ЯЁ][а-яё]+\s+){1,2}${PATRONYMIC}(?:\s+[А-ЯЁ][а-яё]+)?(?![\p{L}])`, "gu"), replacement: "[ФИО]" },
  // A surname with an age after it («Сидорова 72 лет»): the age stays.
  { label: "fio", pattern: new RegExp(String.raw`(?<![\p{L}])${SURNAME_ANY}(?=,?\s+\d{1,3}\s*(?:лет|года|год)(?![\p{L}]))`, "gu"), replacement: "[ФИО]", keep: notAPerson },
  // A surname with two initials, either order («Иванов И.И.», «Иванов И. И.», «И.И. Иванов»), or a surname by its suffix with one initial («Петрова А.»).
  { label: "fio", pattern: new RegExp(String.raw`(?<![\p{L}])(?:[А-ЯЁ][а-яё]+(?:[-‐][А-ЯЁ][а-яё]+)?\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.?|[А-ЯЁ]\.\s?[А-ЯЁ]\.\s?[А-ЯЁ][а-яё]{2,}(?:[-‐][А-ЯЁ][а-яё]+)?|${SURNAME}\s+[А-ЯЁ]\.)(?![\p{L}])`, "gu"), replacement: "[ФИО]" },
  { label: "address", pattern: /(?<![\p{L}\p{N}])(?:адрес|место жительства)\s*[:—-]\s*[^\n]{5,120}/giu, replacement: "Адрес: [REDACTED]" },
  // A street with its house and flat («ул. Ленина д. 5 кв. 3», «проспект Мира, 12», «пер. Садовый»).
  { label: "address", pattern: new RegExp(String.raw`(?<![\p{L}\p{N}])${STREET_TYPE}\s*${STREET}(?:,?\s*${NUMBER}(?![\p{L}]))?${HOUSE}`, "gu"), replacement: "[АДРЕС]" },
  // «пр. Мира 12-45»: «пр.» is a street only with a name and a house after it.
  { label: "address", pattern: new RegExp(String.raw`(?<![\p{L}\p{N}])пр\.\s*${STREET},?\s*${NUMBER}${HOUSE}`, "gu"), replacement: "[АДРЕС]" },
  // The street type after the name («Ленинский проспект 32, кв 7», «Садовая улица, д. 4»).
  // A house number is required: «Эффективная площадь отверстия» is not an address (R1 round 3, A №2).
  { label: "address", pattern: new RegExp(String.raw`(?<![\p{L}\p{N}])[А-ЯЁ][\p{L}-]+\s+(?:улица|проспект|переулок|шоссе|бульвар|набережная|площадь|проезд|ул\.|пр-т|просп\.),?\s*(?:(?:д\.|дом)\s*)?${NUMBER}(?![\p{L}])${HOUSE}`, "gu"), replacement: "[АДРЕС]" },
  // A street name in the genitive with a house and flat and no type («Ленина 5-3», «Гагарина 12/4»).
  { label: "address", pattern: new RegExp(String.raw`(?<![\p{L}\p{N}])[А-ЯЁ][а-яё]+(?:ина|ына|ова|ева|ского|цкого|ой)\s+\d{1,3}[а-яА-Я]?\s*[-/]\s*\d{1,4}(?![\p{N}])${NOT_A_HOUSE}${HOUSE}`, "gu"), replacement: "[АДРЕС]", keep: notAPerson },
  // A street name in the nominative with a house and flat («Садовая 12-4», «Лесной 3/1»).
  { label: "address", pattern: new RegExp(String.raw`(?<![\p{L}\p{N}])[А-ЯЁ][а-яё]+(?:ая|ый|ий|ой|ое)\s+\d{1,3}[а-яА-Я]?\s*[-/]\s*\d{1,4}(?![\p{N}])${NOT_A_HOUSE}${HOUSE}`, "gu"), replacement: "[АДРЕС]" },
  // A house with a flat on its own («д. 5, кв. 3»).
  { label: "address", pattern: /(?<![\p{L}\p{N}])(?:д\.|дом)\s*\d+[а-яА-Я]?(?:\s*\/\s*\d+)?(?:,?\s*(?:корп\.|к\.|стр\.)\s*\d+)?,?\s*(?:кв\.?|квартира)\s*\d+/gu, replacement: "[АДРЕС]" },
  // A surname right next to an address («[АДРЕС], Иванов»; «Иванов, [АДРЕС]»): a surname by its suffix, here a person.
  { label: "fio", pattern: new RegExp(String.raw`(?<=\[АДРЕС\],?[ \t]*)${SURNAME_ANY}(?![\p{L}])|${SURNAME_ANY}(?=,?[ \t]*\[АДРЕС\])`, "gu"), replacement: "[ФИО]", keep: notAPerson },
  { label: "birth_date", pattern: /(?<![\p{L}\p{N}])(?:дата рождения|д\.\s*р\.)\s*[:—-]?\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?![\p{L}\p{N}_])/giu, replacement: "Дата рождения: [REDACTED]" },
  // A date of birth in words or digits after «родился» («родился 12 марта 1956 г.», «родилась 03.04.1950»).
  { label: "birth_date", pattern: new RegExp(String.raw`(?<![\p{L}])(?:родил(?:ся|ась)|дата\s+рождения|д\.\s*р\.)\s*[:—-]?\s*(?:\d{1,2}\s+(?:${MONTHS})\s+(?:19|20)\d{2}|\d{1,2}[./-]\d{1,2}[./-](?:19|20)?\d{2})(?:\s*(?:г\.|года?)(?![\p{L}]))?`, "giu"), replacement: "Дата рождения: [REDACTED]" },
  { label: "birth_date", pattern: /(?<![\p{L}])родил(?:ся|ась)\s+в\s+(?:19|20)\d{2}(?:\s*(?:г\.|году))?/giu, replacement: "[ГОД РОЖДЕНИЯ]" },
  // A year of birth («1956 г.р.», «1956 г. р.», «1956 года рождения», «г.р. 1956»).
  { label: "birth_date", pattern: /(?<![\p{N}])(?:(?:19|20)\d{2}\s*(?:г\.?\s*р\.?|года?\s+рождения|гр\.)|(?:г\.\s*р\.|год\s+рождения)\s*[:—-]?\s*(?:19|20)\d{2})(?![\p{L}\p{N}])/giu, replacement: "[ГОД РОЖДЕНИЯ]" },
  // «Фамилия Имя» next to an age, a year or date of birth or an address («Смирнов Алексей, [ГОД РОЖДЕНИЯ]», «Иванов Иван
  // 70 лет»). Runs last, after the identifiers it stands next to were replaced.
  { label: "fio", pattern: new RegExp(String.raw`(?<![\p{L}])${SURNAME_ANY}[ \t]+[А-ЯЁ][а-яё]{2,}(?=[ \t]*,?[ \t]*(?:\d{1,3}\s*(?:лет|года|год)(?![\p{L}])|\[ГОД РОЖДЕНИЯ\]|Дата рождения: \[REDACTED\]|\[АДРЕС\]))`, "gu"), replacement: "[ФИО]", keep: notAPerson },
];

/** A placeholder left by redaction («[ФИО]», «ФИО: [REDACTED]»): never a word of the question. */
export const REDACTION_PLACEHOLDER = /(?:(?:ФИО|Адрес|Дата рождения):\s*)?\[(?:REDACTED|EMAIL|PHONE|SNILS|OMS|PASSPORT|ФИО|АДРЕС|ГОД РОЖДЕНИЯ|НОМЕР КАРТЫ)\]/gu;

// A capitalised word right next to a placeholder may be the rest of a name or an address (R1 round 3, C Р3-1).
const ROLE_WORD = /^(?:Пациент\p{L}*|Больн\p{L}*|ФИО|Адрес|Дата)$/u;
function nextToPlaceholder(text: string): boolean {
  for (const match of text.matchAll(/([А-ЯЁ][а-яё]{2,})[ \t]*,?[ \t]*\[(?:ФИО|ГОД РОЖДЕНИЯ|АДРЕС)\]|\[(?:ФИО|АДРЕС)\][ \t]*,?[ \t]*([А-ЯЁ][а-яё]{2,})/gu)) {
    const word = match[1] ?? match[2];
    if (word && !ROLE_WORD.test(word) && !notAPerson(word, 0, "")) return true;
  }
  return false;
}

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
    let matches = 0;
    const source = redactedText;
    redactedText = source.replace(rule.pattern, (...args: unknown[]) => {
      const match = String(args[0]);
      const offset = Number(args.at(-2));
      if (rule.keep?.(match, offset, source)) return match;
      matches += 1;
      return rule.replacement.replace(/\$(\d)/gu, (_, index: string) => String(args[Number(index)] ?? ""));
    });
    rule.pattern.lastIndex = 0;
    if (matches) {
      if (!detectedMarkers.includes(rule.label)) detectedMarkers.push(rule.label);
      counts[id] = (counts[id] ?? 0) + matches;
    }
  }

  // The placeholders themselves («ФИО: [REDACTED]») are not hints of what is left.
  const remaining = redactedText.replace(REDACTION_PLACEHOLDER, " ");
  const needsReview = REVIEW_HINTS.some(pattern => pattern.test(remaining)) || nextToPlaceholder(redactedText);
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
