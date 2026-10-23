/**
 * DS typography: a non-breaking space after one- to three-letter words and
 * before a dash, so short words never end a line. Applied to headings and
 * card text the portal renders (including source titles).
 */
const SHORT_WORD = /(^|[\s(«„])([A-Za-zА-Яа-яЁё]{1,3}) (?=\S)/gu;

export function nbsp(text: string): string {
  // Run twice: consecutive short words («и в», «of the») overlap in one pass.
  // A number keeps its unit or word on the same line («31 августа», «2026 года», «5 мг»).
  return text.replace(SHORT_WORD, "$1$2 ").replace(SHORT_WORD, "$1$2 ").replace(/ (—|–)/gu, " $1").replace(/(\d) (?=[А-Яа-яЁёA-Za-z%°])/gu, "$1 ");
}
