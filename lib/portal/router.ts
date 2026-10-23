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
const CLINICAL_ADJECTIVES = "сосудист|неблагоприятн|нежелательн|побочн|коронарн|кардиальн|сердечн|цереброваскулярн|церебральн|мозгов|интракраниальн|внутричерепн|аритмическ|аритмогенн|почечн|тромботическ|тромбоэмболическ|эмболическ|кардиоваскулярн|ишемическ|геморрагическ|жизнеугрожающ|серь[её]зн|повторн|гипогликемическ|отдал[её]нн|тяж[её]л|эпилептическ|пароксизмальн|судорожн|неврологическ|моторн|инфекционн|тератогенн|дыхательн|респираторн|метаболическ|перинатальн|неонатальн|материнск|первичн|вторичн|конечн|ранн|поздн|остр|желудочно-кишечн|гастроинтестинальн|печ[её]ночн|летальн|фатальн|смертельн|ятрогенн|интраоперационн|послеоперационн|периоперационн|перипроцедурн|гипертензивн|гипотензивн|аллергическ|синкопальн|вегетативн|венозн|артериальн";
const CLINICAL_EVENTS = re(`(?<![${L}])(?:${CLINICAL_ADJECTIVES})${L}*(?:-${L}+)?\\s+(?:(?:и|или)\\s+${L}+\\s+|${L}+\\s+)?событи|(?<![${L}])(?:риск|частот|числ|количеств)${L}*\\s+(?:${L}+\\s+){0,2}событи`);
const MONTHS = `январ|феврал|март|апрел|ма[йяе](?![${L}])|июн|июл|август|сентябр|октябр|ноябр|декабр`;
/**
 * The subject of a clinical question: a group of patients, a study, a trial or registry, the prognosis.
 * «события у детей с эпилепсией», «в регистре ХСН», «в группе плацебо» — never the listing.
 */
const CLINICAL_SUBJECT = re(`(?<![${L}])(?:у\\s+(?:пациент|больн|пожил|дет|ребен|беременн|женщин|мужчин|подростк|новорожд|недоношенн|младенц|взросл|спортсмен|лиц|людей)|(?:в лечени|в исследовани|по данным|беременност|прогноз|характерн|предиктор|исход|чаще|реже|плацебо|пациенто-лет|рки|со стороны|конечн${L}*\\s+точк|предотвращ|снижа|уменьша|увеличива|повыша|вызыва|провоциру)${L}*|регистр(?:е|а|у|ы|ов|ом|ам|ах)?(?![${L}])|как\\s+событи|(?:считать|учитывать|регистрировать)\\s+событи|mace(?![${L}]))`);
/** A trial written as its acronym («DAPA-HF», «EMPEROR-Reduced»). */
const TRIAL = /(?<![A-Za-z])[A-Z]{2,}[A-Z0-9]*-[A-Za-z0-9]+/u;
/**
 * A clinical turn of the question: «события при ХСН», «после ЧКВ», «на фоне апиксабана».
 * «при поддержке», «после Нового года», «после 1 ноября», «в течение ноября» are dates and patrons, not turns.
 */
const CLINICAL_TURN = re(`(?<![${L}])(?:при(?!\\s+(?:поддержк|участи|содействи|партн[её]рств))|после(?!\\s+(?:нового|новогодн|праздник|отпуск|выходн|конгресс|конференц|[0-9]))|на фоне|в течение(?!\\s+(?:${MONTHS}|эт|следующ|ближайш|текущ|недел|месяц|год))|следующ${L}*\\s+за)(?![${L}])`);
/** Words that ask for the listing whatever else is said: «ближайшие события по СД 2 типа у детей» (not «в ближайшие 30 дней»). */
const LISTING_STRONG = re(`(?<![${L}])(?:конференц|конгресс|вебинар|мероприят|календар|регистрац${L}*\\s+на|зарегистр|посетить|посещени|расписани|анонс|афиш|(?:ближайш|предстоящ|грядущ)${L}*\\s+(?:${L}+\\s+)?(?:событи|мероприят|конференц|конгресс))`);
/** A month or a date, the audience, a patron: they keep the listing over a clinical turn («События при ФП в марте»). */
const LISTING_DATE = re(`(?<![${L}])(?:${MONTHS}|для\\s+(?:кардиолог|эндокринолог|невролог|терапевт|педиатр|гинеколог|акушер|врач|специалист|ординатор|студент|молод)|при\\s+(?:поддержк|участи|содействи|партн[её]рств))`);
/** Near dates («на этой неделе», «в 2026 году»): the listing's words unless a clinical turn names its subject («в ближайший год после инфаркта»). */
const LISTING_NEAR = re(`(?<![${L}])(?:(?:на|в)\\s+(?:эт|следующ|ближайш)${L}*\\s+(?:недел|месяц|год)|в\\s+20[0-9]{2}\\s+год)`);
const SOCIETY = /(?<![A-Za-zА-ЯЁа-яё])(?:НМО|ВОЗ|РКО|РАЭ|РОАГ|РМОАГ|РНМОТ|ВНОК|РОНК|ОССН|ЕОК|НМИЦ|ВНОА|ESC|AHA|ACC|ADA|EASD|EHRA|HRS|EAN|ESH|EAS|ACOG|AAP|ISTH)(?![A-Za-zА-ЯЁа-яё])/u;

/** «События по беременности»: the topic after «по» is the listing's subject; «по данным» is not a topic. */
function withoutTopic(text: string): string {
  return text.replace(/(?<![\p{L}])по\s+(?!данн)[\s\S]*$/iu, "");
}

/** The words a turn leads to name a disease, a procedure, a drug or a group («после ЧКВ», «при ФП», «после ИМ»). */
function turnSubject(text: string, specialty: SpecialtyId): boolean {
  for (const match of text.matchAll(new RegExp(CLINICAL_TURN.source, "giu"))) {
    const after = text.slice((match.index ?? 0) + match[0].length).trim().split(/\s+/u).slice(0, 3).join(" ");
    if (after && (drugsIn(after).length || topicsMentioned(specialty, after).length || conceptsIn(after, specialty).some(concept => concept.kind === "topic" || concept.kind === "concept"))) return true;
  }
  return false;
}

/** «События ХСН», «События ОНМК»: a recognised disease right after «события», never any abbreviation («События ОССН»). */
function namesDiseaseAfter(text: string, specialty: SpecialtyId): boolean {
  for (const match of text.matchAll(/(?<![\p{L}])событи\p{L}*\s+([\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+)?)/giu)) {
    const [first] = match[1].split(/\s+/u);
    // A field («События аритмологии», «…кардиологии») is the listing's subject, not a disease.
    if (first.length < 2 || /^(?:по|для|на|в|во|с|со|за|от|до|и|или)$/iu.test(first) || /логи[яиюей]$/iu.test(first) || SOCIETY.test(first)) continue;
    if (topicsMentioned(specialty, first).length || conceptsIn(first, specialty).some(concept => concept.kind === "topic" || concept.kind === "concept")) return true;
  }
  return false;
}

/** The request names the listing itself: a date, «ближайшие», the audience, a supporting society. */
export function namesListing(text: string): boolean {
  const value = normalizeQuery(text);
  return LISTING_STRONG.test(value) || LISTING_DATE.test(value) || LISTING_NEAR.test(value) || SOCIETY.test(text);
}

/**
 * «события» are the events listing unless the question is clinical, by positive signs only:
 * 1. a drug or a clinical adjective («мозговые», «нежелательные») — a question;
 * 2. «ближайшие события», «конференции», «расписание», «календарь» — the listing;
 * 3. outside the topic after «по»: a group of patients, a study or registry, the prognosis — a question;
 *    a recognised disease right after «события» — a question unless a month, the audience or a patron is named;
 *    a turn to a recognised subject («после ЧКВ», «при ФП») — a question unless a month, the audience or a patron is named;
 *    a bare turn («при», «после») — a question unless the request names the listing in any way;
 * 4. anything else — the listing.
 */
export function eventsAreListing(text: string, specialty: SpecialtyId): boolean {
  const value = normalizeQuery(text);
  if (!EVENTS_WORD.test(value) || drugsIn(text).length) return false;
  if (CLINICAL_EVENTS.test(value)) return false;
  if (LISTING_STRONG.test(value)) return true;
  const scoped = withoutTopic(text);
  const scopedValue = normalizeQuery(scoped);
  if (CLINICAL_SUBJECT.test(scopedValue) || TRIAL.test(scoped)) return false;
  const dated = LISTING_DATE.test(value);
  if (namesDiseaseAfter(scoped, specialty) || turnSubject(scoped, specialty)) return dated;
  return !CLINICAL_TURN.test(scopedValue) || namesListing(text);
}

/**
 * Where the listing shows «Искали не мероприятия? → Ответ по источникам»: first when the request names no word of
 * the listing or has any clinical sign; after the listing when it names the listing and a topic; otherwise nowhere.
 */
export function eventsBridge(text: string, specialty: SpecialtyId): "top" | "bottom" | null {
  const value = normalizeQuery(text);
  if (!EVENTS_WORD.test(value)) return null;
  const clinical = CLINICAL_TURN.test(value) || CLINICAL_SUBJECT.test(value) || CLINICAL_EVENTS.test(value) || TRIAL.test(text) || namesDiseaseAfter(text, specialty);
  if (!namesListing(text) || clinical) return "top";
  return topicsMentioned(specialty, text).length || conceptsIn(text, specialty).some(concept => concept.kind === "topic" || concept.kind === "concept") ? "bottom" : null;
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
