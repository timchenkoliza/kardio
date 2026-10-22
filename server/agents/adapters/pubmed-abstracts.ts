import { waitForSlot } from "./pubmed";
import { parsePubmedAbstractXml, type PubmedDocumentSection } from "./pubmed-document";

/**
 * Batch abstract reader for the reference answer (NCBI efetch, one request for
 * up to 6 PMIDs). The answer is built only from what an abstract states: the
 * conclusion section verbatim, never a paraphrase.
 */
export interface PubmedAbstract {
  pmid: string;
  sections: PubmedDocumentSection[];
  conclusion: string | null;
  conclusionLabel: string | null;
}

export interface PubmedAbstractsResult {
  status: "ok" | "unavailable";
  abstracts: PubmedAbstract[];
  error: string | null;
  durationMs: number;
}

type TextFetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const cache = new Map<string, { expires: number; value: PubmedAbstract }>();
const CACHE_TTL_MS = 6 * 60 * 60_000;
/** Labels that carry the authors' conclusion, in order of preference. Results sections are never used. */
const CONCLUSION_LABELS: readonly RegExp[] = [
  /^(?:authors'?\s+)?conclusions?(?:\s+and\s+(?:relevance|implications))?$/iu,
  /^interpretation$/iu,
  /^(?:conclusions?\s+and\s+)?(?:clinical\s+)?(?:relevance|implications)/iu,
  /conclusions?/iu,
];
const MAX_CONCLUSION_CHARS = 520;

/** First sentences of the conclusion, cut on a sentence boundary. */
export function conciseConclusion(text: string, limit = MAX_CONCLUSION_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [clean];
  let out = "";
  for (const sentence of sentences) {
    if ((out + sentence).length > limit) break;
    out += sentence;
  }
  return (out || `${clean.slice(0, limit)}…`).trim();
}

/**
 * The conclusion is the labelled CONCLUSION(S)/INTERPRETATION section. For an
 * unstructured abstract the last sentences are used and the label says so.
 */
export function extractConclusion(sections: readonly PubmedDocumentSection[]): { text: string; label: string } | null {
  for (const pattern of CONCLUSION_LABELS) {
    const labelled = sections.find(section => pattern.test(section.label.trim()) && !/results?/iu.test(section.label));
    if (labelled) return { text: conciseConclusion(labelled.text), label: labelled.label };
  }
  if (sections.length === 1) {
    const sentences = sections[0].text.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [];
    if (sentences.length >= 3) return { text: conciseConclusion(sentences.slice(-2).join("")), label: "Окончание реферата" };
  }
  return null;
}

export function splitPubmedArticles(xml: string): Array<{ pmid: string; xml: string }> {
  return [...xml.matchAll(/<PubmedArticle\b[\s\S]*?<\/PubmedArticle>/giu)].map(match => {
    const block = match[0];
    const pmid = block.match(/<PMID\b[^>]*>(\d+)<\/PMID>/iu)?.[1] ?? "";
    return { pmid, xml: block };
  }).filter(item => item.pmid);
}

export async function fetchPubmedAbstracts(pmids: readonly string[], options: { fetchImpl?: TextFetchLike; timeoutMs?: number; minIntervalMs?: number } = {}): Promise<PubmedAbstractsResult> {
  const started = Date.now();
  const ids = [...new Set(pmids.filter(id => /^\d+$/.test(id)))].slice(0, 6);
  if (!ids.length) return { status: "ok", abstracts: [], error: null, durationMs: 0 };
  const fromCache = ids.map(id => cache.get(id)).filter((entry): entry is { expires: number; value: PubmedAbstract } => Boolean(entry && entry.expires > Date.now()));
  if (fromCache.length === ids.length) return { status: "ok", abstracts: ids.map(id => cache.get(id)!.value), error: null, durationMs: 0 };
  if (process.env.PUBMED_DISABLED === "1") return { status: "unavailable", abstracts: [], error: "PubMed отключён в настройках окружения", durationMs: 0 };
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as TextFetchLike | undefined);
  if (!fetchImpl) return { status: "unavailable", abstracts: [], error: "Сетевой клиент недоступен", durationMs: 0 };

  const params = new URLSearchParams({ db: "pubmed", id: ids.join(","), retmode: "xml", tool: "kardio-workspace" });
  const apiKey = process.env.NCBI_API_KEY?.trim();
  if (apiKey) params.set("api_key", apiKey);
  const intervalMs = options.minIntervalMs ?? (options.fetchImpl ? 0 : apiKey ? 110 : 350);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const url = `${BASE}?${params.toString()}`;
    await waitForSlot(intervalMs);
    let response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/xml,text/xml" } });
    if (response.status === 429) {
      // One spaced retry: NCBI throttles bursts without an API key.
      await new Promise(resolve => setTimeout(resolve, 1100));
      await waitForSlot(intervalMs);
      response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/xml,text/xml" } });
    }
    if (!response.ok) return { status: "unavailable", abstracts: [], error: response.status === 429 ? "PubMed временно ограничил частоту запросов" : "PubMed не вернул рефераты", durationMs: Date.now() - started };
    const xml = await response.text();
    const abstracts = splitPubmedArticles(xml).map(({ pmid, xml: block }) => {
      const { sections } = parsePubmedAbstractXml(block);
      const conclusion = extractConclusion(sections);
      const value: PubmedAbstract = { pmid, sections, conclusion: conclusion?.text ?? null, conclusionLabel: conclusion?.label ?? null };
      cache.set(pmid, { expires: Date.now() + CACHE_TTL_MS, value });
      return value;
    });
    if (cache.size > 600) for (const key of [...cache.keys()].slice(0, 100)) cache.delete(key);
    const order = new Map(ids.map((id, index) => [id, index]));
    return { status: "ok", abstracts: abstracts.sort((a, b) => (order.get(a.pmid) ?? 0) - (order.get(b.pmid) ?? 0)), error: null, durationMs: Date.now() - started };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { status: "unavailable", abstracts: [], error: aborted ? "PubMed не ответил вовремя" : "PubMed сейчас недоступен", durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
