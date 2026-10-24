/**
 * Context rules for words that mean different things in a clinical question
 * and in a request for professional services. They are routing and search aids:
 * a rule here never states anything about medicine, it only stops one word from
 * being read in the wrong sense.
 *
 * Patterns run on normalizeText() output (NFKC, lowercase, ё → е) unless they
 * say otherwise; abbreviations that collide with ordinary words («ИМ» — «им»)
 * are matched on the original text, case-sensitively.
 */

const L = "\\p{L}";
const before = `(?<![${L}\\p{N}])`;
const after = `(?![${L}\\p{N}])`;

/**
 * «события» as an outcome of treatment or a study end point, not as a congress:
 * «частота сердечно-сосудистых событий», «нежелательные события на фоне …»,
 * «MACE после ЧКВ», «риск событий у пациентов с …».
 */
/** Outcome events: what trials count as end points. */
const OUTCOME_EVENT_QUALIFIERS = [
  "сердечно-?сосудист", "кардиоваскулярн", "коронарн", "цереброваскулярн", "тромбоэмболическ", "тромботическ", "ишемическ", "геморрагическ",
  "неблагоприятн", "жизнеугрожающ", "фатальн", "нефатальн", "повторн", "почечн", "клиническ", "конечн", "сосудист", "аритмическ", "кардиальн",
];
/** Adverse events: what a drug label lists under safety. */
const ADVERSE_EVENT_QUALIFIERS = ["нежелательн", "побочн", "серьезн"];

const qualified = (qualifiers: readonly string[]) => new RegExp(`${before}(?:${qualifiers.join("|")})${L}*(?:\\s+${L}+)?\\s+событи`, "u");
const OUTCOME_EVENTS: readonly RegExp[] = [
  // qualifier + up to one word + «событи…»: «сердечно-сосудистых событий», «повторных коронарных событий»
  qualified(OUTCOME_EVENT_QUALIFIERS),
  // «события» followed by a clinical frame
  new RegExp(`${before}событи${L}*\\s+(?:в\\s+группе|на\\s+фоне|у\\s+(?:пациент|больн|лиц|женщин|мужчин|детей|пожил)|при\\s+(?:при[её]м|терапи|лечени|применени)|после\\s+(?:чкв|акш|инфаркт|операци|стентир|имплантац|тави)|за\\s+(?:период|время)\\s+наблюдени|в\\s+исследовани)`, "u"),
  // measures of events: «частота событий», «риск … событий», «снижение числа событий»
  new RegExp(`${before}(?:частот|риск|числ|количеств|снижени|отношени|накопленн|кумулятивн)${L}*\\s+(?:${L}+\\s+){0,2}событи`, "u"),
];
const ADVERSE_EVENTS = qualified(ADVERSE_EVENT_QUALIFIERS);
/** Latin end-point acronyms and English wording (matched case-insensitively on the original text). */
const OUTCOME_EVENT_LATIN = /(?<![A-Za-z])(?:MACE|MACCE|MALE|MAKE|cardiovascular\s+events?|clinical\s+events?)(?![A-Za-z])/iu;
const ADVERSE_EVENT_LATIN = /(?<![A-Za-z])adverse\s+events?(?![A-Za-z])/iu;

export type ClinicalEventKind = "outcome" | "adverse";

/**
 * «события» in a clinical sense: «outcome» (an end point — a question about
 * evidence), «adverse» (a safety question — the drug label answers it), or null.
 */
export function clinicalEventKind(normalized: string, original: string = normalized): ClinicalEventKind | null {
  // A named end point wins («нежелательные и сердечно-сосудистые события» is an outcome question).
  if (OUTCOME_EVENTS[0].test(normalized) || OUTCOME_EVENT_LATIN.test(original)) return "outcome";
  // «нежелательные события на фоне …» is a safety question even in a clinical frame.
  if (ADVERSE_EVENTS.test(normalized) || ADVERSE_EVENT_LATIN.test(original)) return "adverse";
  if (OUTCOME_EVENTS.slice(1).some(pattern => pattern.test(normalized))) return "outcome";
  return null;
}

export function mentionsClinicalEvents(normalized: string, original: string = normalized): boolean {
  return clinicalEventKind(normalized, original) !== null;
}

/**
 * Words that make «события» a request for congresses, schools and webinars even
 * when a clinical phrase is also present («конференции про сердечно-сосудистые события»).
 */
const PROFESSIONAL_EVENT_CUES = new RegExp(`${before}(?:конференц|конгресс|вебинар|мероприят|форум|симпозиум|съезд|школ[аыуеи]${after}|нмо${after}|афиш|регистрац|зарегистрир|онлайн-?трансляц)`, "u");

export function mentionsProfessionalEventCue(normalized: string): boolean {
  return PROFESSIONAL_EVENT_CUES.test(normalized);
}

/** «события» should count as a request for professional events. */
export function eventsWordMeansProfessionalEvents(normalized: string, original: string = normalized): boolean {
  if (mentionsProfessionalEventCue(normalized)) return true;
  return !mentionsClinicalEvents(normalized, original);
}

/**
 * Spans that contain «ишем…» or «инфаркт…» but are not coronary disease:
 * ischaemic stroke, cerebral and other organ infarction or ischaemia.
 * They are masked before the coronary vocabulary is matched, so «ИБС и
 * ишемический инсульт» still finds ИБС through «ИБС».
 */
export const NON_CORONARY_ISCHEMIA: readonly string[] = [
  `ишемическ${L}*\\s+инсульт`,
  `транзиторн${L}*\\s+ишемическ${L}*\\s+атак`,
  `ишемическ${L}*\\s+(?:колит|нейропати|оптическ|поражени${L}*\\s+(?:головного\\s+)?мозг|энцефалопат|гепатит)`,
  `инфаркт${L}*\\s+(?:головного\\s+)?(?:мозг|мозжечк|ствол|почк|селез[её]нк|легк|кишечник|кишки|миометр|плацент|сетчатк|спинного)`,
  `ишеми${L}*\\s+(?:головного\\s+)?(?:мозг|мозжечк|ствол|почк|кишечник|кишки|сетчатк|зрительн|спинного)`,
  `ишеми${L}*\\s+(?:нижн${L}*\\s+|верхн${L}*\\s+)?конечност`,
  `(?:хроническ|критическ|остр)${L}*\\s+ишеми${L}*\\s+(?:головного\\s+)?(?:мозг|конечност|нижн|кишечник)`,
  `ишемическ${L}*\\s+(?:болезн${L}*\\s+)?(?:нижн${L}*\\s+)?конечност`,
];
const NON_CORONARY_ISCHEMIA_RE = new RegExp(`${before}(?:${NON_CORONARY_ISCHEMIA.join("|")})`, "gu");

/** Replace non-coronary ischaemia phrases with spaces (positions kept). */
export function maskNonCoronaryIschemia(normalized: string): string {
  return normalized.replace(NON_CORONARY_ISCHEMIA_RE, match => " ".repeat(match.length));
}

/**
 * Shunting: coronary artery bypass grafting is «АКШ», «аортокоронарное» or
 * «маммарокоронарное шунтирование», «коронарное шунтирование». Gastric bypass,
 * ventriculoperitoneal, portosystemic or vascular access shunts are not.
 */
const CORONARY_BYPASS = new RegExp(`${before}(?:акш${after}|мкш${after}|аортокоронарн|маммарокоронарн|коронарн${L}*\\s+шунтир|шунтировани${L}*\\s+коронарн)`, "u");

export function mentionsCoronaryBypass(normalized: string): boolean {
  return CORONARY_BYPASS.test(normalized);
}

/**
 * «ИМ» (инфаркт миокарда) and its forms «ИМпST», «ИМбпST», «ИМпСТ» — upper case only,
 * so the pronoun «им» and «ИМТ» (индекс массы тела) never match.
 */
export const MI_ABBREVIATION = /(?<![\p{L}\p{N}])ИМ(?:\s?[пП]\s?(?:ST|СТ)|\s?[бБ][пП]\s?(?:ST|СТ))?(?![\p{L}\p{N}])/u;

export function mentionsMiAbbreviation(original: string): boolean {
  return MI_ABBREVIATION.test(original.normalize("NFKC"));
}

/** Version labels («v2.0», «версия 2.1», «ред. 3») are document metadata, never doses or terms. */
const VERSION_LABEL = /(?<![\p{L}\p{N}])(?:v|ver\.?|версия|ред\.?|редакция)\s?\d+(?:[.,]\d+){0,2}(?![\p{L}\p{N}])/giu;

export function stripVersionLabels(text: string): string {
  return text.replace(VERSION_LABEL, match => " ".repeat(match.length));
}
