/**
 * A search condition as written in a sentence: an abbreviation keeps its case («ХСН», «иНГЛТ-2», «PCSK9»),
 * other words are lower-cased («фибрилляция предсердий»). «Искали по» and «Не учтено» use the same form.
 */
export function conditionLabel(label: string): string {
  return label.split(" ").map(word => /\p{Lu}.*\p{Lu}/u.test(word) || (/[0-9]/u.test(word) && /\p{Lu}/u.test(word)) ? word : word.toLocaleLowerCase("ru-RU")).join(" ");
}
