/**
 * Identifiers of one publication a physician can paste into the question:
 * PMID, PMCID, DOI or a PubMed / PMC / doi.org link. When they are present the
 * research scenario looks the publication up by identifier instead of
 * searching by topic, so «разбери эту статью» means exactly that article.
 */

export interface StudyIdentifiers {
  pmids: string[];
  pmcids: string[];
  dois: string[];
}

const MAX_IDENTIFIERS = 4;

const PUBMED_URL = /(?:pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\/(\d{1,9})/giu;
const PMC_URL = /(?:ncbi\.nlm\.nih\.gov\/pmc\/articles|pmc\.ncbi\.nlm\.nih\.gov\/articles)\/(PMC\d{4,9})/giu;
// A list continues only with whole numbers: «PMID 1 и 10.1056/…» does not take «10» from the DOI.
const PMID_LABEL = /\bPMIDs?\s*[:#]?\s*(\d{1,9}(?:\s*(?:,|и|and)\s*\d{1,9}(?![\d./]))*)\b/giu;
const PMCID = /\b(PMC\d{4,9})\b/giu;
const DOI = /\b(10\.\d{4,9}\/[^\s"'<>«»,;]+)/giu;

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)].slice(0, MAX_IDENTIFIERS);
}

function trimDoi(value: string): string {
  return value.replace(/[.,;:!?)\]]+$/u, "").toLocaleLowerCase("en-US");
}

export function studyIdentifiersIn(text: string): StudyIdentifiers {
  const pmids = [...text.matchAll(PUBMED_URL), ...text.matchAll(PMID_LABEL)].flatMap(match => match[1].split(/\s*(?:,|и|and)\s*/u));
  const pmcids = [...text.matchAll(PMC_URL), ...text.matchAll(PMCID)].map(match => match[1].toUpperCase());
  const dois = [...text.matchAll(DOI)].map(match => trimDoi(match[1]));
  return { pmids: unique(pmids), pmcids: unique(pmcids), dois: unique(dois) };
}

export function hasStudyIdentifiers(value: StudyIdentifiers): boolean {
  return value.pmids.length + value.pmcids.length + value.dois.length > 0;
}

export function studyIdentifierCount(value: StudyIdentifiers): number {
  return Math.min(MAX_IDENTIFIERS, value.pmids.length + value.pmcids.length + value.dois.length);
}

/** Entrez term that matches exactly the named publications: PMID by [uid], DOI by [doi], a PMCID as typed (PubMed maps it). */
export function pubmedTermForIdentifiers(value: StudyIdentifiers): string | null {
  const parts = [
    ...value.pmids.map(pmid => `${pmid}[uid]`),
    ...value.pmcids,
    ...value.dois.map(doi => `"${doi.replace(/"/gu, "")}"[doi]`),
  ];
  return parts.length ? parts.join(" OR ") : null;
}

/** Physician-facing list of what was asked for, e.g. «PMID 38722233, DOI 10.1056/…». */
export function describeStudyIdentifiers(value: StudyIdentifiers): string {
  return [
    ...value.pmids.map(pmid => `PMID ${pmid}`),
    ...value.pmcids,
    ...value.dois.map(doi => `DOI ${doi}`),
  ].join(", ");
}
