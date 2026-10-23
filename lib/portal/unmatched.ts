/**
 * Words of the physician's question that no search condition covers
 * («сниженной функцией почек» when the search used «апиксабан · фибрилляция
 * предсердий · пожилые · безопасность»). Deterministic stem overlap, shown so
 * a dropped condition is never silent; it is not a judgement of relevance.
 */

const STOP = new Set([
  "какая", "какой", "какие", "каков", "каковы", "какова", "что", "чем", "как", "когда", "где", "почему", "зачем", "можно", "нужно", "ли",
  "известно", "известны", "данные", "данных", "вопрос", "уточнение", "если", "при", "для", "или", "это", "есть", "был", "была", "были",
  "после", "перед", "между", "через", "около", "более", "менее", "очень", "сейчас", "новое", "нового", "изменилось", "изменения",
  "рекомендации", "рекомендациях", "рекомендаций", "исследования", "исследований", "показало", "показали", "лучше", "хуже",
  "пациентов", "пациентам", "пациенты", "больных", "лечение", "лечения", "терапия", "терапии", "течение", "течении",
]);

const stem = (word: string) => word.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е").slice(0, 5);

export function unmatchedWords(question: string, conditions: readonly string[]): string[] {
  const covered = new Set(conditions.flatMap(condition => condition.split(/[^А-Яа-яЁёA-Za-z0-9]+/u)).filter(word => word.length >= 3).map(stem));
  const words = question.match(/[А-Яа-яЁё]{4,}/gu) ?? [];
  const missing: string[] = [];
  for (const word of words) {
    // An abbreviation typed in capitals («ПОАК», «ХСН») is resolved by the lexicon into the conditions above.
    if (word === word.toLocaleUpperCase("ru-RU")) continue;
    const lower = word.toLocaleLowerCase("ru-RU");
    if (STOP.has(lower) || covered.has(stem(word))) continue;
    if (!missing.includes(lower)) missing.push(lower);
  }
  return missing.slice(0, 6);
}
