import type { MaterialFormat } from "@/lib/agents/types";
import { russianIsoDate as russianDate } from "@/lib/portal/materials";
import { parseSummaryPayload, waitForSlot, type PubmedArticle } from "../adapters/pubmed";
import { parsePubmedAbstractXml } from "../adapters/pubmed-document";

/**
 * Link enrichment for «Мои материалы». The physician's URL itself is never
 * fetched: only identifiers parsed from it (a PMID, a PMCID, a DOI) are
 * looked up at fixed public endpoints — NCBI E-utilities and Crossref — with
 * a short timeout. Known sites are named from a static map. When nothing is
 * known the title says so honestly; a hostname or a path is never a title.
 */

export type EnrichmentBasis = "pubmed" | "crossref" | "known_site" | "fallback";

export interface LinkEnrichment {
  basis: EnrichmentBasis;
  title: string | null;
  /** Russian type of the document when the source states it («Метаанализ»). */
  typeLabel: string | null;
  format: MaterialFormat;
  publisher: string | null;
  /** ISO date (YYYY, YYYY-MM or YYYY-MM-DD) when the source states it. */
  publishedAt: string | null;
  /** Short line: journal · date · authors. */
  summary: string | null;
  /** Public abstract text (PubMed), kept for search over the user's materials. */
  abstract: string | null;
  identifier: string | null;
  /** What was not available, in the physician's words. */
  note: string | null;
}

type JsonFetch = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface EnrichOptions {
  fetchImpl?: JsonFetch;
  timeoutMs?: number;
  /** Disable network lookups (environment switch or tests). */
  offline?: boolean;
}

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const CROSSREF = "https://api.crossref.org/works/";

interface KnownSite { pattern: RegExp; publisher: string; format: MaterialFormat; typeLabel?: string }

/** Static map of sites physicians save from. Order matters: specific paths first. */
const KNOWN_SITES: KnownSite[] = [
  { pattern: /(^|\.)cr\.minzdrav\.gov\.ru$/u, publisher: "Рубрикатор клинических рекомендаций Минздрава", format: "guideline", typeLabel: "Клинические рекомендации" },
  { pattern: /(^|\.)grls\.rosminzdrav\.ru$/u, publisher: "ГРЛС", format: "drug_label", typeLabel: "Реестр лекарственных средств" },
  { pattern: /(^|\.)medi\.ru$/u, publisher: "МЕДИ РУ", format: "article" },
  { pattern: /(^|\.)scardio\.ru$/u, publisher: "Российское кардиологическое общество", format: "website" },
  { pattern: /(^|\.)escardio\.org$/u, publisher: "Европейское общество кардиологов (ESC)", format: "website" },
  { pattern: /(^|\.)nice\.org\.uk$/u, publisher: "NICE", format: "website" },
  { pattern: /(^|\.)who\.int$/u, publisher: "ВОЗ", format: "website" },
  { pattern: /(^|\.)cochranelibrary\.com$/u, publisher: "Кокрейновская библиотека", format: "review", typeLabel: "Систематический обзор" },
  { pattern: /(^|\.)ahajournals\.org$/u, publisher: "AHA Journals", format: "article" },
  { pattern: /(^|\.)(jacc|onlinejacc)\.org$/u, publisher: "JACC", format: "article" },
  { pattern: /(^|\.)acc\.org$/u, publisher: "Американская коллегия кардиологов (ACC)", format: "website" },
  { pattern: /(^|\.)nejm\.org$/u, publisher: "NEJM", format: "article" },
  { pattern: /(^|\.)thelancet\.com$/u, publisher: "The Lancet", format: "article" },
  { pattern: /(^|\.)jamanetwork\.com$/u, publisher: "JAMA Network", format: "article" },
  { pattern: /(^|\.)bmj\.com$/u, publisher: "BMJ", format: "article" },
  { pattern: /(^|\.)academic\.oup\.com$/u, publisher: "Oxford Academic", format: "article" },
  { pattern: /(^|\.)sciencedirect\.com$/u, publisher: "ScienceDirect", format: "article" },
  { pattern: /(^|\.)link\.springer\.com$/u, publisher: "Springer", format: "article" },
  { pattern: /(^|\.)onlinelibrary\.wiley\.com$/u, publisher: "Wiley", format: "article" },
  { pattern: /(^|\.)nature\.com$/u, publisher: "Nature", format: "article" },
  { pattern: /(^|\.)diabetesjournals\.org$/u, publisher: "Американская диабетическая ассоциация (ADA)", format: "article" },
  { pattern: /(^|\.)goldcopd\.org$/u, publisher: "GOLD", format: "guideline", typeLabel: "Рекомендации" },
  { pattern: /(^|\.)ginasthma\.org$/u, publisher: "GINA", format: "guideline", typeLabel: "Рекомендации" },
  { pattern: /(^|\.)kdigo\.org$/u, publisher: "KDIGO", format: "guideline", typeLabel: "Рекомендации" },
  { pattern: /(^|\.)publications\.aap\.org$/u, publisher: "Американская академия педиатрии (AAP)", format: "article" },
  { pattern: /(^|\.)acog\.org$/u, publisher: "ACOG", format: "website" },
  { pattern: /(^|\.)uptodate\.com$/u, publisher: "UpToDate", format: "article" },
  { pattern: /(^|\.)medscape\.com$/u, publisher: "Medscape", format: "article" },
  { pattern: /(^|\.)rosmedlib\.ru$/u, publisher: "Консультант врача", format: "article" },
  { pattern: /(^|\.)cyberleninka\.ru$/u, publisher: "КиберЛенинка", format: "article" },
  { pattern: /(^|\.)elibrary\.ru$/u, publisher: "eLIBRARY", format: "article" },
  { pattern: /(^|\.)(youtube\.com|youtu\.be)$/u, publisher: "YouTube", format: "video", typeLabel: "Видео" },
  { pattern: /(^|\.)vimeo\.com$/u, publisher: "Vimeo", format: "video", typeLabel: "Видео" },
  { pattern: /(^|\.)clinicaltrials\.gov$/u, publisher: "ClinicalTrials.gov", format: "study", typeLabel: "Регистрация исследования" },
  { pattern: /(^|\.)dailymed\.nlm\.nih\.gov$/u, publisher: "DailyMed (FDA)", format: "drug_label", typeLabel: "Инструкция FDA" },
  { pattern: /(^|\.)(pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov|pmc\.ncbi\.nlm\.nih\.gov)$/u, publisher: "PubMed", format: "article" },
  { pattern: /(^|\.)doi\.org$/u, publisher: "DOI", format: "article" },
];

const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function knownSite(hostname: string): KnownSite | null {
  const host = hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "");
  return KNOWN_SITES.find(site => site.pattern.test(host)) ?? null;
}

export function pmidFromUrl(url: URL): string | null {
  const host = url.hostname.toLocaleLowerCase("en-US");
  if (host === "pubmed.ncbi.nlm.nih.gov") return url.pathname.match(/^\/(\d{1,9})\/?$/u)?.[1] ?? null;
  if (/(^|\.)ncbi\.nlm\.nih\.gov$/u.test(host)) return url.pathname.match(/^\/pubmed\/(\d{1,9})\/?$/u)?.[1] ?? null;
  return null;
}

export function pmcidFromUrl(url: URL): string | null {
  const host = url.hostname.toLocaleLowerCase("en-US");
  if (!/(^|\.)ncbi\.nlm\.nih\.gov$/u.test(host)) return null;
  return url.pathname.match(/\/(?:pmc\/)?articles\/PMC(\d{1,9})\/?/iu)?.[1] ?? null;
}

/** A DOI from doi.org or from a publisher path such as /doi/10.1161/…. */
export function doiFromUrl(url: URL): string | null {
  const host = url.hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "");
  const path = decodeURIComponent(url.pathname);
  if (host === "doi.org" || host === "dx.doi.org") return path.replace(/^\//u, "").match(/^10\.\d{4,9}\/\S+$/u)?.[0] ?? null;
  const match = path.match(/\/(?:doi\/(?:abs\/|full\/|pdf\/|epdf\/)?)(10\.\d{4,9}\/[^?#\s]+)$/u);
  return match?.[1]?.replace(/\/$/u, "") ?? null;
}

/** PubMed's "2026 Oct 12" / "2026 Oct" / "2026" → ISO at the same precision. */
export function isoFromPubDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})(?:\s+([A-Za-z]{3})[a-z]*(?:\s+(\d{1,2}))?)?/u);
  if (!match) return null;
  const month = match[2] ? EN_MONTHS.indexOf(match[2].toLocaleLowerCase("en-US")) + 1 : 0;
  if (!month) return match[1];
  const mm = String(month).padStart(2, "0");
  return match[3] ? `${match[1]}-${mm}-${match[3].padStart(2, "0")}` : `${match[1]}-${mm}`;
}

export function studyTypeOf(types: readonly string[]): { typeLabel: string | null; format: MaterialFormat } {
  if (types.some(type => /guideline/iu.test(type))) return { typeLabel: "Клинические рекомендации", format: "guideline" };
  if (types.some(type => /consensus/iu.test(type))) return { typeLabel: "Согласительный документ", format: "guideline" };
  if (types.includes("Meta-Analysis")) return { typeLabel: "Метаанализ", format: "review" };
  if (types.includes("Systematic Review")) return { typeLabel: "Систематический обзор", format: "review" };
  if (types.includes("Randomized Controlled Trial")) return { typeLabel: "Рандомизированное исследование", format: "study" };
  if (types.some(type => /clinical trial/iu.test(type))) return { typeLabel: "Клиническое исследование", format: "study" };
  if (types.includes("Observational Study")) return { typeLabel: "Наблюдательное исследование", format: "study" };
  if (types.includes("Review")) return { typeLabel: "Обзор", format: "review" };
  if (types.includes("Case Reports")) return { typeLabel: "Клинический случай", format: "article" };
  if (types.includes("Editorial") || types.includes("Comment")) return { typeLabel: "Редакционная статья", format: "article" };
  return { typeLabel: "Статья", format: "article" };
}

function authorsLine(authors: readonly string[]): string | null {
  if (!authors.length) return null;
  return authors.length > 2 ? `${authors[0]} и соавт.` : authors.join(", ");
}

/** The fallback title: honest about what is known, never the hostname or the path itself. */
export function fallbackTitle(url: URL, site: KnownSite | null, identifier?: { pmid?: string | null; pmcid?: string | null; doi?: string | null }): string {
  if (identifier?.pmid) return `Статья в PubMed (PMID ${identifier.pmid})`;
  if (identifier?.pmcid) return `Статья в PubMed Central (PMC${identifier.pmcid})`;
  if (identifier?.doi) return `Публикация (DOI ${identifier.doi})`;
  if (site?.format === "video") return `Видео на ${site.publisher}`;
  if (site) return `Материал: ${site.publisher}`;
  return `Материал с сайта ${url.hostname.replace(/^www\./u, "")}`;
}

async function timed<T>(fetchImpl: JsonFetch, url: string, timeoutMs: number, read: (response: Awaited<ReturnType<JsonFetch>>) => Promise<T>, accept: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: accept } });
    if (!response.ok) return null;
    return await read(response);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function eutilsUrl(endpoint: "esummary" | "efetch", db: "pubmed" | "pmc", id: string, retmode: "json" | "xml"): string {
  const params = new URLSearchParams({ db, id, retmode, tool: "kardio-workspace" });
  const apiKey = process.env.NCBI_API_KEY?.trim();
  if (apiKey) params.set("api_key", apiKey);
  return `${EUTILS}/${endpoint}.fcgi?${params.toString()}`;
}

function fromArticle(article: PubmedArticle, abstract: string | null): Omit<LinkEnrichment, "identifier"> {
  const { typeLabel, format } = studyTypeOf(article.publicationTypes);
  const publishedAt = isoFromPubDate(article.pubDate?.replace(/\s*\(онлайн\)$/u, "") ?? null) ?? article.sortDate?.slice(0, 10) ?? null;
  const journal = article.journalFull ?? article.journal ?? null;
  return {
    basis: "pubmed",
    title: article.title.replace(/\.$/u, "") || null,
    typeLabel,
    format,
    publisher: journal || "PubMed",
    publishedAt,
    summary: [article.journal || null, russianDate(publishedAt), authorsLine(article.authors)].filter(Boolean).join(" · ") || null,
    abstract,
    note: abstract ? null : "Аннотация в PubMed недоступна — сохранены название и выходные данные",
  };
}

async function lookupPubmed(fetchImpl: JsonFetch, db: "pubmed" | "pmc", id: string, timeoutMs: number, injected: boolean): Promise<Omit<LinkEnrichment, "identifier"> | null> {
  // The shared NCBI slot clock spaces real requests; an injected client (tests) is not rate limited.
  const interval = injected ? 0 : process.env.NCBI_API_KEY?.trim() ? 110 : 350;
  await waitForSlot(interval);
  const summaryRequest = timed(fetchImpl, eutilsUrl("esummary", db, id, "json"), timeoutMs, response => response.json(), "application/json");
  const abstractRequest = db === "pubmed"
    ? waitForSlot(interval).then(() => timed(fetchImpl, eutilsUrl("efetch", "pubmed", id, "xml"), timeoutMs, response => response.text(), "application/xml,text/xml"))
    : Promise.resolve(null);
  const [summary, xml] = await Promise.all([summaryRequest, abstractRequest]);
  if (!summary) return null;
  const [article] = parseSummaryPayload(summary);
  if (!article) return null;
  const abstract = xml ? parsePubmedAbstractXml(xml).sections.map(section => `${section.label}: ${section.text}`).join("\n").slice(0, 12_000) || null : null;
  return fromArticle(article, abstract);
}

interface CrossrefWork { title?: string[]; "container-title"?: string[]; publisher?: string; type?: string; author?: Array<{ family?: string; given?: string }>; issued?: { "date-parts"?: number[][] }; published?: { "date-parts"?: number[][] } }

async function lookupCrossref(fetchImpl: JsonFetch, doi: string, timeoutMs: number): Promise<Omit<LinkEnrichment, "identifier"> | null> {
  const payload = await timed(fetchImpl, `${CROSSREF}${encodeURIComponent(doi)}`, timeoutMs, response => response.json(), "application/json") as { message?: CrossrefWork } | null;
  const work = payload?.message;
  const title = work?.title?.[0]?.replace(/<[^>]+>/gu, "").replace(/\s+/gu, " ").trim();
  if (!work || !title) return null;
  const parts = work.published?.["date-parts"]?.[0] ?? work.issued?.["date-parts"]?.[0] ?? [];
  const publishedAt = parts[0] ? [String(parts[0]), parts[1] ? String(parts[1]).padStart(2, "0") : null, parts[2] ? String(parts[2]).padStart(2, "0") : null].filter(Boolean).join("-") : null;
  const container = work["container-title"]?.[0] ?? null;
  const authors = (work.author ?? []).map(author => [author.family, author.given?.[0]].filter(Boolean).join(" ")).filter(Boolean);
  const guideline = /guideline|recommendation|consensus|position statement/iu.test(title);
  return {
    basis: "crossref",
    title,
    typeLabel: guideline ? "Рекомендации" : work.type === "book-chapter" ? "Глава книги" : "Статья",
    format: guideline ? "guideline" : "article",
    publisher: container ?? work.publisher ?? null,
    publishedAt,
    summary: [container, russianDate(publishedAt), authorsLine(authors)].filter(Boolean).join(" · ") || null,
    abstract: null,
    note: null,
  };
}

/** enrichLink(): what is known about a saved link, from identifiers only. */
export async function enrichLink(rawUrl: string, options: EnrichOptions = {}): Promise<LinkEnrichment> {
  const url = new URL(rawUrl);
  const site = knownSite(url.hostname);
  const pmid = pmidFromUrl(url);
  const pmcid = pmid ? null : pmcidFromUrl(url);
  const doi = pmid || pmcid ? null : doiFromUrl(url);
  const identifier = pmid ? `PMID ${pmid}` : pmcid ? `PMC${pmcid}` : doi ? `DOI ${doi}` : null;
  const offline = options.offline ?? process.env.LINK_ENRICHMENT_DISABLED === "1";
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as JsonFetch | undefined);
  const timeoutMs = options.timeoutMs ?? 5000;

  if (!offline && fetchImpl && (pmid || pmcid || doi)) {
    const injected = Boolean(options.fetchImpl);
    const found = pmid ? await lookupPubmed(fetchImpl, "pubmed", pmid, timeoutMs, injected)
      : pmcid ? await lookupPubmed(fetchImpl, "pmc", pmcid, timeoutMs, injected)
        : await lookupCrossref(fetchImpl, doi as string, timeoutMs);
    if (found) return { ...found, identifier };
  }

  const known = Boolean(site) && !pmid && !pmcid && !doi;
  return {
    basis: known ? "known_site" : "fallback",
    title: fallbackTitle(url, site, { pmid, pmcid, doi }),
    typeLabel: site?.typeLabel ?? (pmid || pmcid || doi ? "Статья" : null),
    format: site?.format ?? (pmid || pmcid || doi ? "article" : "website"),
    publisher: pmid || pmcid ? "PubMed" : site?.publisher ?? null,
    publishedAt: null,
    summary: null,
    abstract: null,
    identifier,
    note: pmid || pmcid || doi
      ? "Не удалось получить название из базы публикаций — добавьте его сами или откройте первоисточник"
      : "Название страницы не загружается — добавьте своё название или заметку, по ним материал найдёт агент",
  };
}
