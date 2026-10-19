/**
 * LIVE PubMed adapter (NCBI E-utilities). Server-side only. Never fakes
 * success: network errors, timeouts and malformed payloads surface as
 * `unavailable` / `failed` with an explanation that the run records.
 */
export interface PubmedQuery {
  term: string;
  /** Inclusive Entrez date window (YYYY/MM/DD). Both or neither. */
  minDate?: string;
  maxDate?: string;
  retmax?: number;
  journals?: string[];
}

export interface PubmedArticle {
  pmid: string;
  title: string;
  journal: string;
  journalFull: string | null;
  pubDate: string | null;
  sortDate: string | null;
  authors: string[];
  doi: string | null;
  publicationTypes: string[];
  url: string;
}

export interface PubmedSearchResult {
  status: "ok" | "unavailable" | "failed";
  query: string;
  total: number;
  articles: PubmedArticle[];
  error: string | null;
  durationMs: number;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const cache = new Map<string, { expires: number; value: PubmedSearchResult }>();
const CACHE_TTL_MS = 30 * 60_000;

export function buildPubmedTerm(query: PubmedQuery): string {
  const parts = [`(${query.term})`];
  const journals = (query.journals ?? []).filter(Boolean);
  if (journals.length) parts.push(`(${journals.map(journal => `"${journal.replace(/"/g, "")}"[jour]`).join(" OR ")})`);
  parts.push("hasabstract");
  return parts.join(" AND ");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function parseSummaryPayload(payload: unknown): PubmedArticle[] {
  const result = (payload as { result?: Record<string, unknown> })?.result;
  if (!result || typeof result !== "object") return [];
  const uids = Array.isArray(result.uids) ? (result.uids as unknown[]).filter((value): value is string => typeof value === "string") : [];
  const articles: PubmedArticle[] = [];
  for (const uid of uids) {
    const record = result[uid] as Record<string, unknown> | undefined;
    if (!record || typeof record !== "object" || typeof record.title !== "string") continue;
    const articleIds = Array.isArray(record.articleids) ? record.articleids as Array<{ idtype?: string; value?: string }> : [];
    const doi = articleIds.find(item => item.idtype === "doi")?.value ?? null;
    const authors = Array.isArray(record.authors) ? (record.authors as Array<{ name?: string }>).map(author => author.name).filter((name): name is string => Boolean(name)) : [];
    const pubtypes = Array.isArray(record.pubtype) ? (record.pubtype as unknown[]).filter((value): value is string => typeof value === "string") : [];
    articles.push({
      pmid: uid,
      title: stripTags(record.title),
      journal: typeof record.source === "string" ? record.source : "",
      journalFull: typeof record.fulljournalname === "string" ? record.fulljournalname : null,
      pubDate: typeof record.pubdate === "string" && record.pubdate ? record.pubdate : null,
      sortDate: typeof record.sortpubdate === "string" && record.sortpubdate ? record.sortpubdate.slice(0, 10).replace(/\//g, "-") : null,
      authors: authors.slice(0, 6),
      doi,
      publicationTypes: pubtypes,
      url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
    });
  }
  return articles;
}

async function fetchJson(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function searchPubmedLive(query: PubmedQuery, options: { fetchImpl?: FetchLike; timeoutMs?: number; disabled?: boolean } = {}): Promise<PubmedSearchResult> {
  const started = Date.now();
  const term = buildPubmedTerm(query);
  if (options.disabled ?? process.env.PUBMED_DISABLED === "1") {
    return { status: "unavailable", query: term, total: 0, articles: [], error: "PubMed отключён в настройках окружения", durationMs: 0 };
  }
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetchImpl) return { status: "unavailable", query: term, total: 0, articles: [], error: "Сетевой клиент недоступен", durationMs: 0 };

  const params = new URLSearchParams({ db: "pubmed", retmode: "json", sort: "pub_date", retmax: String(Math.min(Math.max(query.retmax ?? 6, 1), 20)), term, tool: "kardio-workspace" });
  if (query.minDate && query.maxDate) {
    params.set("datetype", "edat");
    params.set("mindate", query.minDate);
    params.set("maxdate", query.maxDate);
  }
  const apiKey = process.env.NCBI_API_KEY?.trim();
  if (apiKey) params.set("api_key", apiKey);
  const searchUrl = `${BASE}/esearch.fcgi?${params.toString()}`;
  const cached = cache.get(searchUrl);
  if (cached && cached.expires > Date.now()) return cached.value;

  const timeoutMs = options.timeoutMs ?? 6000;
  try {
    const searchPayload = await fetchJson(fetchImpl, searchUrl, timeoutMs) as { esearchresult?: { idlist?: unknown; count?: unknown } };
    const ids = Array.isArray(searchPayload?.esearchresult?.idlist) ? (searchPayload.esearchresult.idlist as unknown[]).filter((value): value is string => typeof value === "string" && /^\d+$/.test(value)) : null;
    if (!ids) return { status: "failed", query: term, total: 0, articles: [], error: "Ответ PubMed не распознан", durationMs: Date.now() - started };
    const total = Number(searchPayload.esearchresult?.count ?? ids.length) || ids.length;
    let articles: PubmedArticle[] = [];
    if (ids.length) {
      const summaryParams = new URLSearchParams({ db: "pubmed", retmode: "json", id: ids.join(","), tool: "kardio-workspace" });
      if (apiKey) summaryParams.set("api_key", apiKey);
      articles = parseSummaryPayload(await fetchJson(fetchImpl, `${BASE}/esummary.fcgi?${summaryParams.toString()}`, timeoutMs));
    }
    const value: PubmedSearchResult = { status: "ok", query: term, total, articles, error: null, durationMs: Date.now() - started };
    cache.set(searchUrl, { expires: Date.now() + CACHE_TTL_MS, value });
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    return value;
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { status: "unavailable", query: term, total: 0, articles: [], error: aborted ? "PubMed не ответил вовремя" : "PubMed сейчас недоступен", durationMs: Date.now() - started };
  }
}

export function entrezDate(date: Date): string {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`;
}
