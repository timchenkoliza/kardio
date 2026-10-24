import { conceptsIn, drugsIn } from "@/lib/portal/lexicon";
import type { SpecialtyId } from "@/lib/domain/types";
import { contentTokens, stem } from "@/lib/agents/text";

/**
 * B2 «Вопрос к фрагменту материала». Everything about the physician's own
 * document stays local: related places are found in the document itself and
 * in the physician's other materials. Only medical terms the lexicon
 * recognises (a disease, a drug, a population, a concept) may leave for a
 * search by sources — never the fragment's text.
 */

export interface DocumentParagraph {
  /** 1-based number: the place in the document a passage is cited by («¶ 12»). */
  number: number;
  text: string;
}

/** The document's text as numbered paragraphs (blank lines or line breaks separate them). */
export function paragraphsOf(text: string | null): DocumentParagraph[] {
  if (!text) return [];
  const blocks = text.replace(/\r\n?/gu, "\n").split(/\n\s*\n|\n/u).map(part => part.replace(/\s+/gu, " ").trim()).filter(part => part.length > 0);
  return blocks.map((part, index) => ({ number: index + 1, text: part }));
}

/** Paragraphs of the same document that share the fragment's content words, best first; the fragment's own paragraph excluded. */
export function relatedPassages(paragraphs: readonly DocumentParagraph[], fragment: string, options: { exclude?: number | null; limit?: number } = {}): Array<DocumentParagraph & { matched: string[] }> {
  const terms = [...new Set(contentTokens(fragment))].filter(term => term.length >= 4);
  if (!terms.length) return [];
  const stems = terms.map(stem);
  return paragraphs
    .filter(paragraph => paragraph.number !== options.exclude)
    .map(paragraph => {
      const haystack = paragraph.text.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
      const matched = terms.filter((_, index) => stems[index]!.length >= 3 && haystack.includes(stems[index]!));
      return { ...paragraph, matched };
    })
    .filter(paragraph => paragraph.matched.length >= Math.min(2, terms.length))
    .sort((a, b) => b.matched.length - a.matched.length || a.number - b.number)
    .slice(0, options.limit ?? 5);
}

/**
 * What a search by sources may receive from a fragment: the labels of recognised medical terms only.
 * A name, a date, a number or any other word of the fragment is never among them.
 */
export function fragmentSearchTerms(fragment: string, specialty: SpecialtyId): string[] {
  const drugs = drugsIn(fragment).map(drug => drug.ru);
  const concepts = conceptsIn(fragment, specialty).filter(concept => concept.kind !== "modifier" && concept.kind !== "drug").map(concept => concept.label.toLocaleLowerCase("ru-RU"));
  return [...new Set([...drugs, ...concepts])].slice(0, 6);
}

/** Fragments are bounded: a selection longer than this is cut, never sent anywhere whole. */
export const MAX_FRAGMENT_CHARS = 600;
