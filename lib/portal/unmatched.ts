import type { SpecialtyId } from "@/lib/domain/types";
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
];

/** Heart-failure phenotypes: the topic «ХСН» finds them, but not narrowed to the phenotype. */
const PHENOTYPE = /^х?сн(?:н|с|ун|п|сн|р)?фв$/u;

// A condition word covers its own inflections («недостаточность» → «недостаточностью»), not every word
// sharing five letters with it («гипертензия» is not «гипертрофия»).
const inflectionStem = (word: string) => {
  const lower = word.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
  return lower.slice(0, Math.max(5, lower.length - 3));
};

function recognised(word: string, specialty: SpecialtyId): boolean {
  const intent = compileIntent(word, specialty);
  return Boolean(intent.context.nosology || intent.entities.drugs.length || intent.entities.concepts.length);
}

/**
 * `known`: what the search that produced the answer understands. The reference answer searches with the portal's
 * whole lexicon; the research review searches only by its topics and PubMed concepts, so a drug the portal knows
 * («бисопролол») but the review did not search is named, never presumed used.
 */
export function unmatchedWords(question: string, conditions: readonly string[], specialty: SpecialtyId, known: (word: string) => boolean = word => recognised(word, specialty)): string[] {
  const coveredStems = conditions.flatMap(condition => condition.split(/[^А-Яа-яЁёA-Za-z0-9]+/u)).filter(word => word.length >= 3).map(inflectionStem);
  const covered = { has: (word: string) => {
    const lower = word.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
    return coveredStems.some(prefix => prefix.length < 5 ? lower === prefix : lower.startsWith(prefix));
  } };
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
  const tokens = [...question.matchAll(/[А-Яа-яЁёA-Za-z0-9-]+/gu)];
  // A disease-name word stands for the abbreviation only next to another word of the name or an abbreviation
  // («сердечная недостаточность», «хроническая СН»), not on its own («дыхательная недостаточность»).
  const nameNear = (index: number) => [tokens[index - 1]?.[0], tokens[index + 1]?.[0]]
    .some(near => near !== undefined && (inName(near.toLocaleLowerCase("ru-RU")) || /^[А-ЯЁ]{2,5}$/u.test(near)));
  let end = 0;
  for (const [index, match] of tokens.entries()) {
    const token = match[0];
    const lower = token.toLocaleLowerCase("ru-RU");
    // Punctuation separates conditions («ЛАГ: риоцигуат»).
    if (/[:;,.!?()]/u.test(question.slice(end, match.index))) close();
    end = match.index + token.length;
    // An abbreviation typed in capitals («ИКД», «СРТ») is a condition of its own unless the lexicon or the conditions know it («ПОАК», «ХСН»).
    // A heart-failure phenotype («СНсФВ», «СНнФВ») finds heart failure, but the search does not narrow it to the phenotype: it is named.
    if (PHENOTYPE.test(lower.replace(/-/gu, ""))) { close(); phrases.push(token); continue; }
    if (/^[А-ЯЁ]{2,5}$/u.test(token)) {
      close();
      if (!STOP.has(lower) && !covered.has(token) && !joined.split(/[^а-яё0-9]+/u).includes(lower) && !known(token)) phrases.push(token);
      continue;
    }
    // A conjunction separates two conditions («регургитация и стеноз»); other short words («с», «по») neither start nor break a phrase.
    if (/^(?:и|или|либо)$/u.test(lower)) { close(); continue; }
    if (token.length < 4) continue;
    // Latin words are searched as typed.
    // A hyphenated word («сердечно-лёгочная») is a word like any other.
    const content = /^[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*$/u.test(token) && !STOP.has(lower);
    // A qualifier the searched concept already covers («катетерная» for «абляция») and the words of an abbreviated disease name are used.
    if (content && !covered.has(token) && !known(token) && !qualifierCovered(lower) && !(inName(lower) && nameNear(index))) current.push({ word: lower, abbreviated: viaAbbreviation(lower) });
    else close();
  }
  close();
  return [...new Set(phrases)].slice(0, 4);
}
