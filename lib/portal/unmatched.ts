import type { SpecialtyId } from "@/lib/domain/types";
import { TOPICS } from "@/lib/agents/vocabulary";
import { compileIntent } from "@/lib/mesh/intent";

/**
 * Parts of the physician's question the search did not use («сниженной функцией
 * почек» when the search used «апиксабан · фибрилляция предсердий · пожилые ·
 * безопасность»). A word counts as used when the lexicon recognises it on its
 * own (a disease, drug, population, concept) or when a search condition shares
 * its stem. Consecutive unused words are one phrase. Shown so a dropped
 * condition is never silent; it is not a judgement of relevance.
 */

const STOP = new Set([
  "какая", "какой", "какие", "каков", "каковы", "какова", "что", "чем", "как", "когда", "где", "почему", "зачем", "можно", "нужно", "ли",
  "известно", "известны", "данные", "данных", "вопрос", "уточнение", "если", "при", "для", "или", "это", "есть", "был", "была", "были",
  "после", "перед", "между", "через", "около", "более", "менее", "очень", "сейчас", "новое", "нового", "изменилось", "изменения",
  "рекомендации", "рекомендациях", "рекомендаций", "исследования", "исследований", "показало", "показали", "лучше", "хуже",
  "пациентов", "пациентам", "пациенты", "больных", "лечение", "лечения", "лечении", "лечению", "лечением", "терапия", "терапии", "терапией", "течение", "течении",
  "насколько", "старше", "младше", "моложе", "года", "годы", "лет", "сколько", "стоит", "надо", "ведение", "ведения", "риск", "риска",
  "выбор", "выбора", "выборе", "шкала", "шкалы", "шкале", "шкалой", "оценка", "оценки", "оценке", "оценку",
]);

/**
 * An abbreviation in the conditions covers the words it stands for. For «ХБП» the whole phrase is its meaning
 * («сниженной функцией почек»); for a disease name («ХСН», «АГ», «ФП») only the words of the name are used,
 * and the rest of the phrase («с сохранённой фракцией выброса», «острая») is a condition of its own.
 */
const ABBREVIATIONS: ReadonlyArray<{ pattern: RegExp; words: readonly string[]; wholePhrase: boolean }> = [
  { pattern: /(?<![\p{L}])хбп(?![\p{L}])/u, words: ["поч"], wholePhrase: true },
  { pattern: /(?<![\p{L}])хсн(?![\p{L}])/u, words: ["сердеч", "недост", "хрон"], wholePhrase: false },
  { pattern: /(?<![\p{L}])(?:аг|ag)(?![\p{L}])/u, words: ["гипертенз", "гипертон", "давлен", "артериал"], wholePhrase: false },
  { pattern: /(?<![\p{L}])фп(?![\p{L}])/u, words: ["фибрил", "предсерд"], wholePhrase: false },
  // «Кардиоренальные связи» is searched as chronic kidney disease AND cardiovascular.
  { pattern: /кардиоренал/u, words: ["поч"], wholePhrase: true },
];

/**
 * Qualifiers a searched concept already covers: «ablation[tiab]» finds catheter ablation, so «катетерная»
 * before «абляция» is not a lost condition. A short explicit list — any other qualifier («пароксизмальная»,
 * «резистентная», «интенсивное») is a condition of its own and is named when the search did not use it.
 */
const COVERED_QUALIFIERS: ReadonlyArray<[RegExp, readonly string[]]> = [
  [/абляц/u, ["катетерн"]],
  // «"cardiovascular prevention"[tiab]» is the prevention topic's own term.
  [/профилакт/u, ["сердечно-сосудист"]],
  [/pcsk9/u, ["ингибитор"]],
  [/диагност/u, ["критери"]],
  // «Кардиоренальные связи» is searched as chronic kidney disease AND cardiovascular.
  [/кардиоренал/u, ["сердечно-сосудист", "заболеван"]],
];

/** An abbreviation typed in capitals, possibly with a number («ИКД», «ПЦСК9»). */
const ABBREVIATION = /^[А-ЯЁ]{2,6}[0-9]*$/u;

/** A word is named as typed for its abbreviations («Д-димер», «стресс-ЭхоКГ», «NT-proBNP»), in lower case otherwise («бета-блокаторы»). */
function shown(token: string): string {
  if (/[A-Za-z]/u.test(token) && !/[А-Яа-яЁё]/u.test(token)) return token;
  return token.split("-").map(part => /\p{Lu}.*\p{Lu}/u.test(part) || /^\p{Lu}$/u.test(part) ? part : part.toLocaleLowerCase("ru-RU")).join("-");
}

/** Heart-failure phenotypes: the topic «ХСН» finds them, but not narrowed to the phenotype. */
const PHENOTYPE = /^х?сн(?:н|с|ун|п|сн|р)?фв$/u;

const fold = (word: string) => word.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");

/**
 * A condition word covers words that differ from it only by ending and suffix («дозирование» → «дозировка»,
 * «безопасность» → «безопасен», «недостаточность» → «недостаточностью»): they share all but the last four letters
 * of the shorter one, and at least five. «Гипертензия» does not cover «гипертрофия»: they share six letters of eleven.
 */
function sameStem(word: string, condition: string): boolean {
  if (condition.length < 5 || word.length < 5) return word === condition;
  let common = 0;
  while (common < word.length && common < condition.length && word[common] === condition[common]) common += 1;
  return common >= Math.max(5, Math.min(word.length, condition.length) - 4);
}

/**
 * Words of a multi-word topic key found in the whole question, for the topics among the conditions:
 * «артериальная» in «лёгочная артериальная гипертензия» is part of the searched name, not a lost condition.
 */
function matchedKeyParts(question: string, conditions: readonly string[]): string[] {
  const normalized = fold(question);
  const labels = new Set(conditions.map(fold));
  return Object.values(TOPICS).flat().filter(topic => labels.has(fold(topic.label)))
    .flatMap(topic => topic.keywords.map(keyword => fold(keyword).split(" ")))
    .filter(parts => parts.length > 1 && parts.every(part => normalized.includes(part)))
    .flat()
    .filter(part => part.length >= 4);
}

function recognised(word: string, specialty: SpecialtyId): boolean {
  const intent = compileIntent(word, specialty);
  return Boolean(intent.context.nosology || intent.entities.drugs.length || intent.entities.concepts.length);
}

/**
 * `known`: what the search that produced the answer understands. The reference answer searches with the portal's
 * whole lexicon; the research review searches only by its topics and PubMed concepts, so a drug the portal knows
 * («бисопролол») but the review did not search is named, never presumed used.
 */
export function unmatchedWords(question: string, conditions: readonly string[], specialty: SpecialtyId, known: (word: string) => boolean = word => recognised(word, specialty), options: { latinSearched?: boolean } = {}): string[] {
  // Latin words go into the PubMed query as typed; when PubMed was not used, they were searched nowhere.
  const latinSearched = options.latinSearched ?? true;
  const keyParts = matchedKeyParts(question, conditions);
  const understood = (word: string) => known(word) || keyParts.some(part => fold(word).includes(part));
  const conditionWords = conditions.flatMap(condition => condition.split(/[^А-Яа-яЁёA-Za-z0-9-]+/u)).filter(word => word.length >= 3).map(fold);
  const covered = { has: (word: string) => conditionWords.some(condition => sameStem(fold(word), condition)) };
  const joined = conditions.join(" ").toLocaleLowerCase("ru-RU");
  const active = ABBREVIATIONS.filter(entry => entry.pattern.test(joined));
  const phraseWords = active.filter(entry => entry.wholePhrase).flatMap(entry => entry.words);
  const nameWords = active.filter(entry => !entry.wholePhrase).flatMap(entry => entry.words);
  const viaAbbreviation = (word: string) => phraseWords.some(prefix => word.startsWith(prefix));
  const inName = (word: string) => nameWords.some(prefix => word.startsWith(prefix));
  const qualifiers = COVERED_QUALIFIERS.filter(([pattern]) => pattern.test(joined)).flatMap(([, prefixes]) => prefixes);
  const qualifierCovered = (word: string) => qualifiers.some(prefix => word.startsWith(prefix));
  const phrases: string[] = [];
  // A run of unused words is one phrase; a phrase an abbreviation stands for («сниженной функцией почек» ↔ «ХБП») is used.
  let current: Array<{ word: string; abbreviated: boolean }> = [];
  const close = () => { if (current.length && !current.some(item => item.abbreviated)) phrases.push(current.map(item => item.word).join(" ")); current = []; };
  // Any letters count, Greek included («β-блокаторы»).
  const tokens = [...question.matchAll(/[\p{L}\p{N}-]+/gu)];
  // A disease-name word stands for the abbreviation only next to another word of the name or an abbreviation
  // («сердечная недостаточность», «хроническая СН»), not on its own («дыхательная недостаточность»).
  const nameNear = (index: number) => [tokens[index - 1]?.[0], tokens[index + 1]?.[0]]
    .some(near => near !== undefined && (inName(near.toLocaleLowerCase("ru-RU")) || ABBREVIATION.test(near)));
  let end = 0;
  for (const [index, match] of tokens.entries()) {
    const token = match[0];
    const lower = token.toLocaleLowerCase("ru-RU");
    // Punctuation separates conditions («ЛАГ: риоцигуат»).
    if (/[:;,.!?()]/u.test(question.slice(end, match.index))) close();
    end = match.index + token.length;
    // An abbreviation typed in capitals («ИКД», «СРТ») is a condition of its own unless the lexicon or the conditions know it («ПОАК», «ХСН»).
    // A heart-failure phenotype («СНсФВ», «СНнФВ») finds heart failure, but the search does not narrow it to the phenotype: it is named.
    if (PHENOTYPE.test(lower.replace(/-/gu, ""))) { close(); if (!/фракци/u.test(joined)) phrases.push(token); continue; }
    if (ABBREVIATION.test(token)) {
      close();
      if (!STOP.has(lower) && !covered.has(token) && !joined.split(/[^а-яё0-9]+/u).includes(lower) && !understood(token)) phrases.push(token);
      continue;
    }
    // A number, a conjunction or a service word («при», «для») separates two conditions («регургитация и стеноз», «АВ-блокада 2 степени»);
    // other short words («с», «по») neither start nor break a phrase.
    if (/^[0-9-]+$/u.test(token) || /^(?:и|или|либо)$/u.test(lower) || STOP.has(lower)) { close(); continue; }
    const latin = /[A-Za-z]/u.test(token) && !/[А-Яа-яЁё]/u.test(token);
    if (latin && latinSearched) { close(); continue; }
    // A word with a digit or a hyphen («Омега-3», «ИЛ-6», «сердечно-лёгочная») is a word like any other.
    if (token.length < 4 && !/[0-9-]/u.test(token) && !latin) continue;
    // A qualifier the searched concept already covers («катетерная» for «абляция») and the words of an abbreviated disease name are used.
    if (!covered.has(token) && !understood(token) && !qualifierCovered(lower) && !(inName(lower) && nameNear(index))) current.push({ word: shown(token), abbreviated: viaAbbreviation(lower) });
    else close();
  }
  close();
  return [...new Set(phrases)];
}
