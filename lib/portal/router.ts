import type { RoutedIntent, IntentKind } from "@/lib/agents/intent";
import { detectRiskSignals, type RiskSignals } from "@/lib/agents/risk-rules";
import type { AgentId } from "@/lib/agents/types";
import { describeStudyIdentifiers, hasStudyIdentifiers, studyIdentifiersIn } from "@/lib/agents/study-identifiers";
import { topicsMentioned } from "@/lib/agents/vocabulary";
import type { SpecialtyId } from "@/lib/domain/types";
import { hostForFamily } from "@/lib/mesh/capabilities";
import { JOBS, type PortalJob } from "./jobs";
import { conceptsIn, drugsIn, hasDrugCue, normalizeQuery, type DrugEntry, type QueryConcept } from "./lexicon";

/**
 * Deterministic portal router: text → physician job. It routes by what the
 * physician wants done, not by medical meaning, and never by an LLM. The
 * default for a clinical question is the reference answer — not research.
 */

export interface PortalRoute {
  job: PortalJob;
  /** Persistence host of the capability that serves the job (implementation detail). */
  agentId: AgentId;
  /** Router matching confidence, never a statement about medicine. */
  confidence: number;
  /** Physician-language explanation of the route. */
  reasons: string[];
  drugs: DrugEntry[];
  concepts: QueryConcept[];
  /** Topic ids of the physician's own specialty named in the request. */
  topics: string[];
  risk: RiskSignals;
  wantsCalendar: boolean;
  wantsRegistration: boolean;
  /** True when nothing searchable was recognised: the result explains how to rephrase. */
  vague: boolean;
  /** RoutedIntent for the supervisor (implementation detail). */
  routed: RoutedIntent;
}

const L = "\\p{L}";
const re = (source: string) => new RegExp(source, "u");
const word = (source: string) => re(`(?<![${L}])(?:${source})`);

/** `once`: the rule scores its weight once, however many of its synonyms match. */
interface Rule { job: PortalJob; weight: number; patterns: RegExp[]; once?: boolean }

const RULES: readonly Rule[] = [
  { job: "materials", weight: 5, patterns: [word("мо(?:их|ем|и|ём) (?:материал|файл|документ|заметк)"), word("в сохран[её]нн"), word("загруженн"), word("мой (?:файл|документ)"), word("по моему (?:файлу|документу)")] },
  { job: "events", weight: 4, patterns: [word("конференц"), word("конгресс"), word("вебинар"), word("мероприят"), word("школ[аыуе](?![" + L + "])"), word("форум"), word("симпозиум"), word("зарегистрир"), word("в календар"), word("съезд")] },
  { job: "learning", weight: 4, patterns: [word("обучени"), word("курс(?:ы|ов)? (?:по|для|повышени)"), word("учебн"), word("лекци"), word("нмо"), word("баллы"), word("аккредитац"), word("подготов" + `${L}*` + " к (?:экзамен|аккредитац|сертификац)"), word("хочу (?:разобраться|освежить|изучить|подтянуть)"), word("что почитать"), word("с чего начать изучени")] },
  { job: "guidelines", weight: 4, patterns: [word("клиническ" + `${L}*` + " рекомендац"), word("рекомендаци"), word("гайдлайн"), word("guideline"), word("клинреком"), word("кр(?![" + L + "])"), word("стандарт" + `${L}*` + " (?:медицинск|оказани)"), word("порядок оказани"), word("рубрикатор"), word("приказ" + `${L}*` + " минздрав"), re("\\b(?:ESC|AHA|ACC|NICE|ADA|EASD|GINA|GOLD|KDIGO|ACOG|FIGO|AAP|ILAE|EAN|EULAR|IDSA)\\b")] },
  { job: "research", weight: 3, once: true, patterns: [word("разб(?:ери|ерите|ор|рать)" + " (?:эт" + `${L}*` + " )?(?:исследовани|стать|публикаци|рки|испытани|метаанализ)"), word("что показали (?:исследовани|испытани|рки|метаанализ)"), re("(?<![\\p{L}])(?:исследовани|испытани)[еяюи]\\s+[A-Z0-9]{2,}(?:-[A-Z0-9]+)*(?:-[A-Z][a-z]+)?(?![A-Za-z0-9-])"), word("исследуй"), word("исследовани(?:я|й|ям|ях)"), word("доказательн"), word("доказательств"), word("метаанализ"), word("рки"), word("сравни"), word("обзор литератур"), word("что известно"), word("какие данные"), word("pubmed"), word("найди (?:данные|статьи|публикации)"), word("эффективн" + `${L}*` + " .{1,40} (?:vs|против|по сравнению)")] },
  { job: "updates", weight: 3, patterns: [word("что нового"), word("новост"), word("обновлени"), word("за (?:последн" + `${L}*` + " )?(?:неделю|месяц)"), word("свеж"), word("что появилось"), word("последние (?:публикаци|данные|исследовани)")] },
  { job: "answer", weight: 2, patterns: [word("что такое"), word("как (?:лечить|диагностир|вести|отличить|оценить)"), word("каки(?:е|х) (?:критери|показани|противопоказани)"), word("сколько"), word("когда (?:назнача|начина|показан)"), word("можно ли"), word("показани"), word("критери"), word("норм[аыу](?![" + L + "])"), word("первой линии|первая линия"), word("тактика"), word("алгоритм"), word("дифференциальн"), word("длительност")] },
];

const EVENTS_WORD = re(`(?<![${L}])событи`);
/**
 * Clinical adjectives of «события»: only these make the events clinical («мозговые», «нежелательные»);
 * any other adjective («грядущие», «очные», «акушерские») says nothing about it.
 */
const CLINICAL_ADJECTIVES = "сосудист|неблагоприятн|нежелательн|побочн|коронарн|кардиальн|сердечн|цереброваскулярн|церебральн|мозгов|интракраниальн|внутричерепн|аритмическ|аритмогенн|почечн|тромботическ|тромбоэмболическ|эмболическ|кардиоваскулярн|ишемическ|геморрагическ|жизнеугрожающ|серь[её]зн|повторн|гипогликемическ|отдал[её]нн|тяж[её]л|эпилептическ|пароксизмальн|судорожн|моторн|тератогенн|дыхательн|респираторн|метаболическ|первичн|вторичн|конечн|ранн|поздн|остр|желудочно-кишечн|гастроинтестинальн|печ[её]ночн|летальн|фатальн|смертельн|ятрогенн|интраоперационн|послеоперационн|периоперационн|перипроцедурн|гипертензивн|гипотензивн|аллергическ|синкопальн|вегетативн|венозн|артериальн";
const CLINICAL_EVENTS = re(`(?<![${L}])(?:${CLINICAL_ADJECTIVES})${L}*(?:-${L}+)?\\s+(?:(?:и|или)\\s+${L}+\\s+|${L}+\\s+)?событи|(?<![${L}])(?:риск|частот|числ|количеств)${L}*\\s+(?:${L}+\\s+){0,2}событи`);
/** Adverse events are always a clinical question («Нежелательные события в мае»), unless conferences are asked for. */
const ADVERSE_EVENTS = re(`(?<![${L}])(?:нежелательн|неблагоприятн|побочн|серь[её]зн|жизнеугрожающ)${L}*\\s+(?:${L}+\\s+)?событи`);
/** Adjectives that name a field as well as a kind of events («неврологические», «перинатальные»): a date or another adjective makes them the listing. */
const FIELD_EVENTS = re(`(?<![${L}])(?:неврологическ|инфекционн|перинатальн|неонатальн|материнск)${L}*\\s+(?:${L}+\\s+)?событи`);
const FIELD_LISTING = re(`(?<![${L}])(?:(?:главн|крупн|региональн|всероссийск|российск|международн|научн|образовательн|очн|ежегодн|московск|петербургск)${L}*\\s+(?:неврологическ|инфекционн|перинатальн|неонатальн|материнск)|(?:эт|текущ|следующ|прошл)${L}*\\s+года|событи${L}*\\s+года|20[0-9]{2}|в\\s+(?:москв|санкт|петербург|казан|новосибирск|екатеринбург|регион)|весн|летом|осень|зимой)`);
const MONTHS = `январ|феврал|март|апрел|ма[йяе](?![${L}])|июн|июл|август|сентябр|октябр|ноябр|декабр`;
/**
 * The subject of a clinical question: a group of patients, a study, a trial or registry, the prognosis.
 * «события у детей с эпилепсией», «в регистре ХСН», «в группе плацебо» — never the listing.
 */
const CLINICAL_SUBJECT = re(`(?<![${L}])(?:у\\s+(?:пациент|больн|пожил|дет|ребен|беременн|женщин|мужчин|подростк|новорожд|недоношенн|младенц|взросл|спортсмен|лиц|людей)|(?:в лечени|в исследовани|по данным|беременност|прогноз|характерн|предиктор|исход|чаще|реже|плацебо|пациенто-лет|рки|со стороны|конечн${L}*\\s+точк|шкал|предотвращ|снижа|уменьша|увеличива|повыша|вызыва|провоциру|предшеству|сопровожда|сопутству|привод|ведущ${L}*\\s+к(?![${L}])|следу(?:ют|ет)\\s+за)${L}*|регистр(?:е|а|у|ы|ов|ом|ам|ах)?(?![${L}])|как\\s+событи|(?:считать|учитывать|регистрировать)\\s+событи|mace(?![${L}]))`);
/** A trial written as its acronym («DAPA-HF», «EMPEROR-Reduced»). */
const TRIAL = /(?<![A-Za-z])[A-Z]{2,}[A-Z0-9]*-[A-Za-z][A-Za-z0-9]*/u;
/**
 * A clinical turn of the question: «события при ХСН», «после ЧКВ», «на фоне апиксабана».
 * «при поддержке», «после Нового года», «после 1 ноября», «в течение ноября» are dates and patrons, not turns.
 */
const CLINICAL_TURN = re(`(?<![${L}])(?:при(?!\\s+(?:поддержк|участи|содействи|партн[её]рств))|после(?!\\s+(?:нового|новогодн|праздник|отпуск|выходн|конгресс|конференц|[0-9]))|на фоне|в течение(?!\\s+(?:${MONTHS}|эт|следующ|ближайш|текущ|недел|месяц|год))|следующ${L}*\\s+за)(?![${L}])`);
/** Turns that need a recognised subject to make a question («перед инсультом», «накануне ИМ», «до инфаркта», «во время ЧКВ»). */
const SUBJECT_TURN = new RegExp(`${CLINICAL_TURN.source}|(?<![${L}])(?:перед|накануне|во время|до(?!\\s*[0-9])|связан${L}*\\s+с)(?![${L}])`, "giu");
/** Words that ask for the listing whatever else is said: «ближайшие события по СД 2 типа у детей» (not «в ближайшие 30 дней»). */
const LISTING_STRONG = re(`(?<![${L}])(?:конференц|конгресс|вебинар|мероприят|календар|регистрац${L}*\\s+на|зарегистр|посетить|посещени|расписани|анонс|афиш|(?:ближайш|предстоящ|грядущ)${L}*\\s+(?:[${L}-]+\\s+)?(?:событи|мероприят|конференц|конгресс))`);
/** Adjectives of the listing («главные», «обучающие», «очные»): the listing unless the question has a clinical subject or turn. */
const LISTING_ADJECTIVE = re(`(?<![${L}])(?:обучающ|образовательн|научн|главн|крупн|аккредитованн|бесплатн|очн|онлайн|международн|всероссийск|ежегодн)${L}*\\s+(?:[${L}-]+\\s+)?событи`);
/** A month or a date, the audience, a patron: they keep the listing over a clinical turn («События при ФП в марте»). */
const LISTING_DATE = re(`(?<![${L}])(?:${MONTHS}|для\\s+(?:кардиолог|эндокринолог|невролог|терапевт|педиатр|гинеколог|акушер|врач|специалист|ординатор|студент|молод)|при\\s+(?:поддержк|участи|содействи|партн[её]рств))`);
/** Near dates («на этой неделе», «в 2026 году»): the listing's words unless a clinical turn names its subject («в ближайший год после инфаркта»). */
const LISTING_NEAR = re(`(?<![${L}])(?:(?:на|в)\\s+(?:эт|следующ|ближайш)${L}*\\s+(?:недел|месяц|год)|в\\s+20[0-9]{2}\\s+год)`);
const SOCIETY = /(?<![A-Za-zА-ЯЁа-яё])(?:НМО|ВОЗ|РКО|РАЭ|РОАГ|РМОАГ|РНМОТ|ВНОК|РОНК|ОССН|ЕОК|НМИЦ|ВНОА|ESC|AHA|ACC|ADA|EASD|EHRA|HRS|EAN|ESH|EAS|ACOG|AAP|ISTH)(?![A-Za-zА-ЯЁа-яё])/u;

/**
 * A Russian society named as the organiser right after «события» («Сосудистые события РКО»); a society as criteria
 * («Геморрагические события ISTH», «по критериям ESC») keeps the question clinical.
 */
const SOCIETY_AFTER = /событи\p{L}*\s+(?:\p{L}+\s+)?(?:НМО|РКО|РАЭ|РОАГ|РМОАГ|РНМОТ|ВНОК|РОНК|ОССН|ЕОК|НМИЦ|ВНОА)(?![А-ЯЁа-яё])/iu;

/** «События по беременности»: the topic after «по» is the listing's subject; «по данным» is not a topic. */
function withoutTopic(text: string): string {
  const events = text.search(/(?<![\p{L}])событи/iu);
  const tail = events < 0 ? text : text.slice(events);
  const cut = tail.search(/(?<![\p{L}])(?:по\s+(?!данн|шкал)|посвящ\p{L}*\s|(?:о|об|про)\s(?!котор|ч[её]м|том|т[её]х))/iu);
  return cut < 0 ? text : text.slice(0, (events < 0 ? 0 : events) + cut);
}

/** The words a turn leads to name a disease, a procedure, a drug or a group («после ЧКВ», «при ФП», «после ИМ»). */
function turnSubject(text: string, specialty: SpecialtyId, links = true): boolean {
  for (const match of text.matchAll(SUBJECT_TURN)) {
    // «связанные с» is a weak link: a listing adjective outweighs it («Обучающие события, связанные с ФП»).
    if (!links && /^связан/iu.test(match[0])) continue;
    const after = text.slice((match.index ?? 0) + match[0].length).trim().split(/\s+/u).slice(0, 3).join(" ");
    // A field («связанные с аритмологией») is the listing's subject, not a disease.
    if (/логи\p{L}{0,3}$/iu.test(after.split(/\s+/u)[0] ?? "")) continue;
    if (after && (drugsIn(after).length || topicsMentioned(specialty, after).length || conceptsIn(after, specialty).some(concept => concept.kind === "topic" || concept.kind === "concept"))) return true;
  }
  return false;
}

/** «События ХСН», «События ОНМК»: a recognised disease right after «события», never any abbreviation («События ОССН»). */
function namesDiseaseAfter(text: string, specialty: SpecialtyId): boolean {
  for (const match of text.matchAll(/(?<![\p{L}])событи\p{L}*\s+([\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+)?)/giu)) {
    // The first two words: «События ТЭЛА», «События при … » is a turn, not a disease.
    for (const word of match[1].split(/\s+/u)) {
      if (/^(?:по|для|на|в|во|с|со|за|от|до|и|или|при|после|у|о|об|про)$/iu.test(word)) break;
      // A field («События аритмологии») or a society («События ОССН ХСН») is the listing's subject, not a disease.
      if (word.length < 2 || /логи\p{L}{0,3}$/iu.test(word) || SOCIETY.test(word)) break;
      if (topicsMentioned(specialty, word).length || conceptsIn(word, specialty).some(concept => concept.kind === "topic" || concept.kind === "concept")) return true;
      // A second word counts only after an adjective («События острого ИМ»), not after a noun («События клуба ФП»).
      if (!/(?:ого|его|ой|ей|ых|их|ый|ий|ая|ое|ые|ие)$/iu.test(word)) break;
    }
  }
  return false;
}

/** The request names the listing itself: a date, «ближайшие», the audience, a supporting society. */
export function namesListing(text: string): boolean {
  const value = normalizeQuery(text);
  return LISTING_STRONG.test(value) || LISTING_ADJECTIVE.test(value) || LISTING_DATE.test(value) || LISTING_NEAR.test(value) || SOCIETY.test(text);
}

/**
 * «события» are the events listing unless the question is clinical, by positive signs only:
 * 1. a drug — a question;
 * 2. a clinical adjective («мозговые», «нежелательные») — a question, unless the request asks for conferences, or names
 *    only a month, the audience or a society with no clinical turn («Острые события ноября в кардиологии»);
 * 3. «ближайшие события», «конференции», «расписание», «календарь» — the listing;
 * 4. a field adjective («неврологические», «перинатальные») — a question, unless a date or another adjective names the
 *    field's listing («Ближайшие/Главные неврологические события», «…в ноябре»);
 * 5. outside the topic after «по», «о», «про», «посвящённые»: a group of patients, a study, a trial, a scale, placebo,
 *    an endpoint, a registry, the prognosis, a verb of effect or sequence («предшествуют», «связаны») — a question;
 *    a recognised disease within two words after «события», or a turn to a recognised subject («после ЧКВ»,
 *    «перед инсультом») — a question unless a month, the audience or a patron is named;
 *    a bare turn («при», «после») — a question unless the request names the listing in any way;
 * 6. anything else — the listing.
 */
export function eventsAreListing(text: string, specialty: SpecialtyId): boolean {
  const value = normalizeQuery(text);
  if (!EVENTS_WORD.test(value) || drugsIn(text).length) return false;
  const scoped = withoutTopic(text);
  const scopedValue = normalizeQuery(scoped);
  const subject = CLINICAL_SUBJECT.test(scopedValue) || TRIAL.test(scoped);
  const turn = turnSubject(scoped, specialty);
  const dated = LISTING_DATE.test(value);
  // A clinical adjective makes a question unless the request asks for conferences, or names only a date or a society
  // («Острые события ноября в кардиологии», «Сердечные события РКО в ноябре»).
  const turned = turn || CLINICAL_TURN.test(scopedValue);
  if (ADVERSE_EVENTS.test(value)) return /(?<![\p{L}])(?:конференц|конгресс|вебинар|мероприят|афиш)/u.test(value) && !subject && !turned;
  if (CLINICAL_EVENTS.test(value)) return (LISTING_STRONG.test(value) || LISTING_ADJECTIVE.test(value) || dated || SOCIETY_AFTER.test(text)) && !subject && !turned;
  if (LISTING_STRONG.test(value)) return true;
  if (LISTING_ADJECTIVE.test(value) && !subject && !CLINICAL_TURN.test(scopedValue) && !turnSubject(scoped, specialty, false)) return true;
  // «Неврологические события»: a question, unless a date or another adjective makes it the field's listing.
  if (FIELD_EVENTS.test(value)) return (dated || LISTING_NEAR.test(value) || FIELD_LISTING.test(value)) && !subject && !turned;
  if (subject) return false;
  if (namesDiseaseAfter(scoped, specialty) || turn) return dated;
  return !CLINICAL_TURN.test(scopedValue) || namesListing(text);
}

/**
 * Where the listing shows «Искали не мероприятия? → Ответ по источникам»: first when the request names no word of
 * the listing or has any clinical sign; after the listing when it names the listing and a topic; otherwise nowhere.
 */
export function eventsBridge(text: string, specialty: SpecialtyId): "top" | "bottom" | null {
  const value = normalizeQuery(text);
  if (!EVENTS_WORD.test(value)) return null;
  const clinical = CLINICAL_TURN.test(value) || CLINICAL_SUBJECT.test(value) || CLINICAL_EVENTS.test(value) || FIELD_EVENTS.test(value) || TRIAL.test(text) || namesDiseaseAfter(text, specialty) || turnSubject(text, specialty);
  if (!namesListing(text) || clinical) return "top";
  return topicsMentioned(specialty, text).length || conceptsIn(text, specialty).some(concept => concept.kind === "topic" || concept.kind === "concept") ? "bottom" : null;
}

/**
 * «Консилиум», «позиции рекомендаций / источников / обществ», «что говорят разные рекомендации»,
 * «где рекомендации расходятся»: the positions of several kinds of sources side by side (lib/mesh/jobs.ts, source_positions).
 */
export const CONSILIUM_CUE = re(`(?<![${L}])(?:консилиум${L}*|позици${L}*\\s+(?:разных\\s+)?(?:рекомендаций|источников|обществ|гайдлайнов)|что\\s+говорят\\s+(?:разные\\s+)?(?:рекомендации|общества|источники)|(?:рекомендации|источники|общества)\\s+расход${L}*)`);

/** «Сравни», «чем отличаются», «X или Y», «X vs Y». */
const COMPARISON_CUE = re(`(?<![${L}])(?:сравн${L}*|отлича${L}*|отличи${L}*|разниц${L}*|vs|versus|против|или)(?![${L}])`);
/** Outcome and study words: such a comparison is answered by evidence, not by the instructions. */
const OUTCOME_CUE = re(`(?<![${L}])(?:исследован${L}*|эффективн${L}*|доказательн${L}*|доказательств${L}*|метаанализ${L}*|рки|исход${L}*|смертност${L}*|кровотечен${L}*|госпитализац${L}*|выживаемост${L}*|риск${L}*|снижени${L}*|частот${L}*|лучше)(?![${L}])`);

/** Two or more drugs compared by their instructions — not by outcomes, clinical events or studies. */
export function comparesDrugsByLabel(normalized: string): boolean {
  return COMPARISON_CUE.test(normalized) && !OUTCOME_CUE.test(normalized) && !CLINICAL_EVENTS.test(normalized) && !ADVERSE_EVENTS.test(normalized);
}

const PRIORITY: readonly PortalJob[] = ["materials", "events", "learning", "guidelines", "drug", "research", "updates", "answer"];

const INTENT_FOR_JOB: Record<PortalJob, IntentKind> = {
  answer: "reference_answer",
  drug: "reference_answer",
  guidelines: "compare_guidelines",
  research: "research_question",
  events: "find_events",
  learning: "plan_learning",
  updates: "monitor_updates",
  materials: "ask_my_materials",
};

export function routePortalIntent(text: string, specialty: SpecialtyId, options: { job?: PortalJob | null; hasAttachment?: boolean } = {}): PortalRoute {
  const value = normalizeQuery(text);
  const risk = detectRiskSignals(text);
  const drugs = drugsIn(text);
  const concepts = conceptsIn(text, specialty);
  const topics = topicsMentioned(specialty, text);
  const wantsCalendar = /календар|будильник|напомин/u.test(value);
  const wantsRegistration = /зарегистрир|регистрац\p{L}* на|записа\p{L}* на/u.test(value);

  const scores = new Map<PortalJob, { score: number; hits: string[] }>();
  const add = (job: PortalJob, score: number, hit: string) => {
    const current = scores.get(job) ?? { score: 0, hits: [] };
    current.score += score;
    current.hits.push(hit);
    scores.set(job, current);
  };
  // «события» is the events listing unless the question is clinical: «нежелательные события при приёме апиксабана».
  if (eventsAreListing(text, specialty)) add("events", 4, "событи");
  for (const rule of RULES) for (const pattern of rule.patterns) {
    const match = value.match(pattern) ?? text.match(pattern);
    if (!match) continue;
    add(rule.job, rule.weight, match[0].trim());
    if (rule.once) break;
  }
  const drugCue = hasDrugCue(text);
  if (drugs.length) add("drug", 3 + (drugCue ? 2 : 0), drugs.map(item => item.ru).join(", "));
  else if (drugCue) add("drug", 3, "вопрос о препарате");
  // «Консилиум»: an explicit request for the positions of the sources; it outweighs a named drug or a guideline cue.
  if (CONSILIUM_CUE.test(value)) add("answer", 8, "позиции источников");
  // Several drugs side by side: by their instructions, unless the question is about outcomes, events or studies.
  if (drugs.length >= 2 && comparesDrugsByLabel(value)) add("drug", 4, "сравнение препаратов по инструкциям");
  else if (drugs.length >= 2 && scores.has("research")) add("research", 2, "сравнение препаратов");
  if (options.hasAttachment) add("materials", 3, "прикреплён файл");
  // A pasted PMID, DOI or PubMed link names one publication: that is a study review, whatever else the text says.
  const identifiers = studyIdentifiersIn(text);
  // Weight 5: above a single drug or event cue, not above «мои материалы» (materials wins the tie by priority).
  if (hasStudyIdentifiers(identifiers)) add("research", 5, describeStudyIdentifiers(identifiers));

  let job: PortalJob;
  let reasons: string[];
  let confidence: number;
  const vague = !drugs.length && !concepts.length && !/[A-Za-z]{3,}/.test(text) && !scores.size;

  if (options.job) {
    job = options.job;
    confidence = 1;
    reasons = [`Вы выбрали: ${JOBS[job].label.toLocaleLowerCase("ru-RU")}`];
  } else if (!scores.size) {
    job = "answer";
    confidence = vague ? 0.2 : 0.5;
    reasons = [vague ? "Тема не распознана — попробуем найти ответ по источникам" : concepts.length ? `Вопрос по теме: ${concepts.slice(0, 3).map(item => item.label).join(", ")}` : "Тема не из словаря специальности — ищем по словам вопроса"];
  } else {
    const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
    const [best, entry] = ranked[0];
    job = best;
    const total = ranked.reduce((sum, [, item]) => sum + item.score, 0);
    confidence = Math.round((entry.score / Math.max(total, 1)) * 100) / 100;
    reasons = [`Распознали: ${[...new Set(entry.hits)].slice(0, 3).join(", ")}`];
  }

  const agentId = hostForFamily(job);
  return {
    job,
    agentId,
    confidence,
    reasons,
    drugs,
    concepts,
    topics,
    risk,
    wantsCalendar,
    wantsRegistration,
    vague,
    routed: { agentId, intent: INTENT_FOR_JOB[job], confidence, topics, reasons, risk, wantsCalendar, wantsRegistration },
  };
}
