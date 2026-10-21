/**
 * R-12: a specialty's pages must not show terms that belong to another specialty.
 * Matching is case-insensitive on visible text, placeholders and selected options.
 * The term is part of the fingerprint: keep ids stable, add new terms freely.
 */
export interface LexiconTerm { id: string; pattern: RegExp }

export const SPECIALTY_LEXICON: Record<string, readonly LexiconTerm[]> = {
  cardiology: [
    { id: "кардио", pattern: /кардио/iu },
    { id: "ХСН", pattern: /(?<![А-Яа-яЁё])ХСН(?![А-Яа-яЁё])/u },
    { id: "AHA", pattern: /\bAHA\b/ },
    { id: "ESC", pattern: /\bESC\b/ },
    { id: "РКО", pattern: /(?<![А-Яа-яЁё])РКО(?![А-Яа-яЁё])/u },
    { id: "фибрилляц", pattern: /фибрилляц/iu },
    { id: "гипертенз", pattern: /гипертенз/iu },
    { id: "ЭКГ", pattern: /(?<![А-Яа-яЁё])ЭКГ(?![А-Яа-яЁё])/u },
  ],
  oncology: [
    { id: "онколог", pattern: /онколог/iu },
    { id: "опухол", pattern: /опухол/iu },
    { id: "химиотерап", pattern: /химиотерап/iu },
    { id: "метастаз", pattern: /метастаз/iu },
    { id: "RECIST", pattern: /\bRECIST\b/ },
  ],
};

/** Elements that legitimately name every specialty (the specialty switcher). */
export const LEXICON_ALLOWED_COMPONENTS = [/\blabel\.ws-specialty\b/, /\bselect\b/];

export function specialtyOf(route: string): string | null {
  const first = route.split("/").filter(Boolean)[0];
  return first && first in SPECIALTY_LEXICON ? first : null;
}
