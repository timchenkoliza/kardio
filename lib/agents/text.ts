/**
 * Text helpers safe for Cyrillic. JavaScript `\b` is ASCII-only even with the
 * `u` flag, so word boundaries are expressed with Unicode letter lookarounds.
 */
export const L_START = "(?<![\\p{L}\\p{N}])";
export const L_END = "(?![\\p{L}\\p{N}])";

/** Build a case-insensitive Unicode regexp with letter-aware boundaries around `source`. */
export function wordPattern(source: string, options: { start?: boolean; end?: boolean } = {}): RegExp {
  const start = options.start === false ? "" : L_START;
  const end = options.end === false ? "" : L_END;
  return new RegExp(`${start}(?:${source})${end}`, "iu");
}

/** Prefix match: boundary only at the start, any ending (Russian inflection). */
export function stemPattern(source: string): RegExp {
  return wordPattern(source, { end: false });
}

export function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

const STOP_WORDS = new Set([
  "и", "в", "во", "на", "по", "с", "со", "к", "ко", "о", "об", "от", "до", "из", "за", "для", "при", "или", "как", "что", "это", "без", "над", "под",
  "между", "после", "перед", "не", "ли", "же", "бы", "а", "но", "у", "of", "the", "and", "in", "for", "with", "to", "a", "an", "on", "by", "is", "are",
  "мне", "мой", "мои", "моих", "найди", "покажи", "расскажи", "есть", "какие", "какой", "какая", "который", "которые", "этот", "эта", "эти",
]);

export function contentTokens(value: string): string[] {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter(token => token.length >= 3 && !STOP_WORDS.has(token));
}

/** Light Russian/English stemming, enough for lexical overlap checks. */
export function stem(token: string): string {
  if (token.length <= 5) return token;
  return token.replace(/(иями|ями|ами|ого|его|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ий|ый|ой|ов|ев|ам|ям|ах|ях|ом|ем|ию|ия|ии|ей|ть|ing|ed|es|s|у|ю|а|я|ы|и|е|о)$/u, "");
}

export function stemmedTokens(value: string): Set<string> {
  return new Set(contentTokens(value).map(stem));
}

/** Share of claim content stems that occur in the support text, in [0,1]. */
export function lexicalSupport(claim: string, support: string): number {
  const claimStems = [...stemmedTokens(claim)];
  if (!claimStems.length) return 0;
  const supportStems = stemmedTokens(support);
  const supportList = [...supportStems];
  let matched = 0;
  for (const token of claimStems) {
    if (supportStems.has(token) || supportList.some(candidate => candidate.length >= 4 && token.length >= 4 && (candidate.startsWith(token) || token.startsWith(candidate)))) matched += 1;
  }
  return matched / claimStems.length;
}

/** Deterministic, namespaced, non-cryptographic id (FNV-1a) for stable result keys. */
export function stableId(namespace: string, ...parts: Array<string | number | null | undefined>): string {
  const input = `${namespace}::${parts.map(part => String(part ?? "")).join("::")}`;
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `${namespace}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
