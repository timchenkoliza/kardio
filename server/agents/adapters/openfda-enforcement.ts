/**
 * LIVE openFDA drug enforcement (recall) adapter
 * (https://open.fda.gov/apis/drug/enforcement/). Server-side only.
 *
 * Returns FDA recall records for one INN reported within a window. These are
 * US market actions: a record never says anything about products registered
 * in Russia, and the result page says so. No record, timeouts and network
 * failures are reported as such — never as «no recalls».
 */

export interface DrugRecall {
  recallNumber: string;
  classification: string | null;
  status: string | null;
  /** ISO date the record was reported (report_date). */
  reportDate: string | null;
  reasonForRecall: string;
  productDescription: string;
  recallingFirm: string | null;
  /** openFDA query that returns exactly this record (the verifiable primary data). */
  apiUrl: string;
}

export interface DrugRecallResult {
  status: "ok" | "unavailable" | "failed";
  inn: string;
  recalls: DrugRecall[];
  error: string | null;
  retrievedAt: string;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const BASE = "https://api.fda.gov/drug/enforcement.json";
const cache = new Map<string, { expires: number; value: DrugRecallResult }>();
const CACHE_TTL_MS = 6 * 60 * 60_000;

function compact(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function isoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{8}$/u.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : null;
}

function text(value: unknown, max = 600): string | null {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/gu, " ").trim().slice(0, max) : null;
}

export function parseRecall(record: Record<string, unknown>): DrugRecall | null {
  const recallNumber = text(record.recall_number, 40);
  const reason = text(record.reason_for_recall);
  const product = text(record.product_description, 400);
  if (!recallNumber || !reason || !product) return null;
  return {
    recallNumber,
    classification: text(record.classification, 20),
    status: text(record.status, 40),
    reportDate: isoDate(record.report_date),
    reasonForRecall: reason,
    productDescription: product,
    recallingFirm: text(record.recalling_firm, 160),
    apiUrl: `${BASE}?search=recall_number:%22${encodeURIComponent(recallNumber)}%22`,
  };
}

export async function searchDrugRecallsLive(inn: string, since: Date, options: { fetchImpl?: FetchLike; timeoutMs?: number; disabled?: boolean; now?: () => Date } = {}): Promise<DrugRecallResult> {
  const now = options.now?.() ?? new Date();
  const retrievedAt = now.toISOString();
  const name = inn.trim().toLowerCase().replace(/"/g, "");
  if (options.disabled ?? process.env.OPENFDA_DISABLED === "1") return { status: "unavailable", inn: name, recalls: [], error: "openFDA отключён в настройках окружения", retrievedAt };
  const search = `(openfda.generic_name:"${name}" OR product_description:"${name}") AND report_date:[${compact(since)} TO ${compact(now)}]`;
  const params = new URLSearchParams({ search, sort: "report_date:desc", limit: "5" });
  const apiKey = process.env.OPENFDA_API_KEY?.trim();
  if (apiKey) params.set("api_key", apiKey);
  const url = `${BASE}?${params.toString()}`;
  const cacheKey = `${name}|${compact(since)}|${compact(now)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetchImpl) return { status: "unavailable", inn: name, recalls: [], error: "Сетевой клиент недоступен", retrievedAt };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 7000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    // openFDA answers 404 when nothing matches: a checked, empty window.
    if (response.status === 404) {
      const value: DrugRecallResult = { status: "ok", inn: name, recalls: [], error: null, retrievedAt };
      cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, value });
      return value;
    }
    if (!response.ok) return { status: "unavailable", inn: name, recalls: [], error: response.status === 429 ? "openFDA временно ограничил частоту запросов" : `openFDA ответил ошибкой ${response.status}`, retrievedAt };
    const payload = await response.json() as { results?: unknown };
    if (!Array.isArray(payload.results)) return { status: "failed", inn: name, recalls: [], error: "Ответ openFDA не распознан", retrievedAt };
    const recalls = payload.results.map(item => (item && typeof item === "object" ? parseRecall(item as Record<string, unknown>) : null)).filter((item): item is DrugRecall => Boolean(item));
    const value: DrugRecallResult = { status: "ok", inn: name, recalls, error: null, retrievedAt };
    cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, value });
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    return value;
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { status: "unavailable", inn: name, recalls: [], error: aborted ? "openFDA не ответил вовремя" : "openFDA сейчас недоступен", retrievedAt };
  } finally {
    clearTimeout(timer);
  }
}
