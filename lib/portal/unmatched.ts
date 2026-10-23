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
]);

/** An abbreviation in the conditions covers the words it stands for («ХБП» → «почек», «почечной»). */
const ABBREVIATIONS: ReadonlyArray<[RegExp, readonly string[]]> = [
  [/(?<![\p{L}])хбп(?![\p{L}])/u, ["поч"]],
  [/(?<![\p{L}])хсн(?![\p{L}])/u, ["сердеч", "недост"]],
  [/(?<![\p{L}])(?:аг|ag)(?![\p{L}])/u, ["гиперт", "давлен"]],
  [/(?<![\p{L}])фп(?![\p{L}])/u, ["фибрил", "предсерд"]],
  // «Кардиоренальные связи» is searched as chronic kidney disease AND cardiovascular.
  [/кардиоренал/u, ["поч"]],
];

const stem = (word: string) => word.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е").slice(0, 5);

function recognised(word: string, specialty: SpecialtyId): boolean {
  const intent = compileIntent(word, specialty);
  return Boolean(intent.context.nosology || intent.entities.drugs.length || intent.entities.concepts.length);
}

export function unmatchedWords(question: string, conditions: readonly string[], specialty: SpecialtyId): string[] {
  const covered = new Set(conditions.flatMap(condition => condition.split(/[^А-Яа-яЁёA-Za-z0-9]+/u)).filter(word => word.length >= 3).map(stem));
  const joined = conditions.join(" ").toLocaleLowerCase("ru-RU");
  const expanded = ABBREVIATIONS.filter(([pattern]) => pattern.test(joined)).flatMap(([, prefixes]) => prefixes);
  const viaAbbreviation = (word: string) => expanded.some(prefix => word.toLocaleLowerCase("ru-RU").startsWith(prefix));
  const phrases: string[] = [];
  // A run of unused words is one phrase; a phrase an abbreviation stands for («сниженной функцией почек» ↔ «ХБП») is used.
  let current: Array<{ word: string; abbreviated: boolean }> = [];
  const close = () => { if (current.length && !current.some(item => item.abbreviated)) phrases.push(current.map(item => item.word).join(" ")); current = []; };
  for (const [token] of question.matchAll(/[А-Яа-яЁёA-Za-z0-9-]+/gu)) {
    // Short words («и», «с», «по») neither start nor break a phrase.
    if (token.length < 4) continue;
    const lower = token.toLocaleLowerCase("ru-RU");
    // An abbreviation typed in capitals («ПОАК», «ХБП») and Latin words are resolved by the lexicon or searched as typed.
    const content = /^[А-Яа-яЁё]+$/u.test(token) && token !== token.toLocaleUpperCase("ru-RU") && !STOP.has(lower);
    if (content && !covered.has(stem(token)) && !recognised(token, specialty)) current.push({ word: lower, abbreviated: viaAbbreviation(token) });
    else close();
  }
  close();
  return [...new Set(phrases)].slice(0, 4);
}
