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
const CLINICAL_EVENTS = re(`(?:сосудист|неблагоприятн|нежелательн|коронарн|кардиальн|цереброваскулярн|аритмическ|почечн|тромботическ|тромбоэмболическ|кардиоваскулярн|ишемическ|геморрагическ|жизнеугрожающ|серь[её]зн|повторн|гипогликемическ|отдал[её]нн|тяж[её]л)${L}*\\s+(?:${L}+\\s+)?событи|(?:риск|частот|числ)${L}*\\s+(?:${L}+\\s+){0,2}событи`);
const MONTHS = `январ|феврал|март|апрел|ма[йяе](?![${L}])|июн|июл|август|сентябр|октябр|ноябр|декабр`;
/**
 * The subject of a clinical question: a group of patients, a study or registry, the prognosis.
 * «события у детей с эпилепсией», «в регистре ХСН», «определяющие прогноз» — never the listing.
 */
const CLINICAL_SUBJECT = re(`(?<![${L}])(?:у\\s+(?:пациент|больн|пожил|дет|ребен|беременн|женщин|мужчин|подростк|новорожд|недоношенн|младенц|взросл|спортсмен|лиц|людей)|(?:в лечени|в исследовани|по данным|беременност|прогноз|характерн|предиктор|исход|чаще|реже)${L}*|регистр(?:е|а|у|ы|ов|ом|ам|ах)?(?![${L}])|как\\s+событи|mace(?![${L}]))`);
/**
 * A clinical turn of the question: «события при ХСН», «после ЧКВ», «на фоне апиксабана».
 * A weak cue: a word of the listing itself (a month, «для кардиологов», «при поддержке РКО») outweighs it.
 */
const CLINICAL_TURN = re(`(?<![${L}])(?:при(?!\\s+(?:поддержк|участи|содействи|партн[её]рств))|после(?!\\s+(?:нового|новогодн|праздник|отпуск|конгресс|конференц))|на фоне|в течение(?!\\s+(?:${MONTHS}|эт|следующ|ближайш|текущ|недел|месяц|год))|следующ${L}*\\s+за)(?![${L}])`);
/** Words that ask for the listing whatever else is said: «ближайшие события по СД 2 типа у детей» (not «в ближайшие 30 дней»). */
const LISTING_STRONG = re(`(?<![${L}])(?:конференц|конгресс|вебинар|мероприят|календар|регистрац|зарегистр|посетить|афиш|(?:ближайш|предстоящ)${L}*\\s+(?:${L}+\\s+)?(?:событи|мероприят|конференц|конгресс))`);
/** Words of the listing itself: a month or a near date, the audience, a supporting society. */
const LISTING_CUE = re(`(?<![${L}])(?:${MONTHS}|(?:на|в)\\s+(?:эт|следующ|ближайш)${L}*\\s+(?:недел|месяц|год)|в\\s+20[0-9]{2}\\s+год|для\\s+(?:кардиолог|эндокринолог|невролог|терапевт|педиатр|гинеколог|акушер|врач|специалист|ординатор|студент|молод)|при\\s+(?:поддержк|участи|содействи|партн[её]рств))`);
const SOCIETY = /(?<![A-Za-zА-ЯЁа-яё])(?:НМО|ВОЗ|РКО|РАЭ|РОАГ|РМОАГ|РНМОТ|ВНОК|РОНК|ESC|AHA|ACC|ADA|EASD|EHRA|HRS|EAN|ESH|EAS|ACOG|AAP)(?![A-Za-zА-ЯЁа-яё])/u;
/** Adjectives that name the listing, its audience or nothing: «ближайшие события», «кардиологические события», «какие события». */
const LISTING_ADJECTIVE = /^(?:подходящ|ближайш|предстоящ|главн|основн|важн|ключев|крупн|больш|интересн|ежегодн|международн|российск|всероссийск|региональн|научн|образовательн|медицинск|профессиональн|майск|весенн|осенн|летн|зимн|новогодн|онлайн|нов|свеж|последн|будущ|текущ|прошедш|прошл|следующ|кардиологическ|эндокринологическ|неврологическ|педиатрическ|терапевтическ|акушерск|гинекологическ|как|так|эт|те|все|люб|котор|ин|друг|сам|ваш|наш|мо|тво|чь|ваш)/u;
const ADJECTIVE_ENDING = /(?:ые|ие|ых|их|ое|ее|ая|яя|ой|ей|ий|ый|ую|юю|ым|им|ыми|ими)$/u;

/**
 * «Церебральные события», «События ХСН»: an adjective of the events or a disease right after them
 * makes the question clinical; «Ближайшие события», «События по ХСН», «События ESC» do not.
 */
function clinicalAdjective(value: string): boolean {
  return [...value.matchAll(new RegExp(`(?<![${L}])(${L}+)\\s+событи`, "gu"))].some(match => ADJECTIVE_ENDING.test(match[1]) && !LISTING_ADJECTIVE.test(match[1]));
}

function namesDiseaseAfter(text: string, specialty: SpecialtyId): boolean {
  for (const match of text.matchAll(/(?<![\p{L}])событи\p{L}*\s+([\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+)?)/giu)) {
    const [first] = match[1].split(/\s+/u);
    if (/^[А-ЯЁ]{2,6}[0-9]*$/u.test(first) && !SOCIETY.test(first)) return true;
    if (/^\p{Ll}/u.test(first) && first.length > 3 && (topicsMentioned(specialty, match[1]).length || conceptsIn(match[1], specialty).length)) return true;
  }
  return false;
}

/** The request names the listing itself: a date, «ближайшие», the audience, a supporting society. */
export function namesListing(text: string): boolean {
  const value = normalizeQuery(text);
  return LISTING_STRONG.test(value) || LISTING_CUE.test(value) || SOCIETY.test(text);
}

/**
 * «события» are the events listing unless the question is clinical. A drug or a clinical adjective make it a
 * question; «ближайшие», «конференции», «календарь» make it the listing; then a group of patients, a registry or
 * a disease named right after «события» make it a question; «при/после/в течение» do too, unless the request
 * also names the listing (a month, the audience, a supporting society).
 */
export function eventsAreListing(text: string, specialty: SpecialtyId): boolean {
  const value = normalizeQuery(text);
  if (!EVENTS_WORD.test(value) || drugsIn(text).length) return false;
  if (CLINICAL_EVENTS.test(value) || clinicalAdjective(value)) return false;
  if (LISTING_STRONG.test(value)) return true;
  if (CLINICAL_SUBJECT.test(value) || namesDiseaseAfter(text, specialty)) return false;
  return !CLINICAL_TURN.test(value) || namesListing(text);
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
  // Comparing several drugs is an evidence question.
  if (drugs.length >= 2 && scores.has("research")) add("research", 2, "сравнение препаратов");
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
