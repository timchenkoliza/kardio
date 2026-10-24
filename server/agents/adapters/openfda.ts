/**
 * LIVE openFDA drug-label adapter (https://open.fda.gov/apis/drug/label/).
 * Server-side only. Returns verbatim sections of the most recent structured
 * product label for a generic name. Never fakes success: no label, network
 * failure and timeouts are reported as such.
 *
 * Honesty boundary: these are US FDA labels. They do not replace the
 * instruction registered in Russia (ГРЛС), and openFDA itself states its data
 * is unvalidated — the result page says both, and links the DailyMed label.
 */

export type LabelSectionId =
  | "boxed_warning"
  | "indications_and_usage"
  | "dosage_and_administration"
  | "contraindications"
  | "warnings_and_cautions"
  | "drug_interactions"
  | "use_in_specific_populations"
  | "pregnancy"
  | "pediatric_use"
  | "recent_major_changes";

export const LABEL_SECTIONS: ReadonlyArray<{ id: LabelSectionId; ru: string; fallback?: string[] }> = [
  { id: "boxed_warning", ru: "Предупреждение в рамке" },
  { id: "indications_and_usage", ru: "Показания" },
  { id: "contraindications", ru: "Противопоказания" },
  { id: "warnings_and_cautions", ru: "Предупреждения и меры предосторожности", fallback: ["warnings", "precautions"] },
  { id: "dosage_and_administration", ru: "Дозирование и способ применения" },
  { id: "drug_interactions", ru: "Взаимодействия" },
  { id: "pregnancy", ru: "Беременность" },
  { id: "pediatric_use", ru: "Применение у детей" },
  { id: "use_in_specific_populations", ru: "Особые группы пациентов" },
  { id: "recent_major_changes", ru: "Недавние изменения инструкции" },
];

export interface DrugLabelSection {
  id: LabelSectionId;
  ru: string;
  text: string;
  truncated: boolean;
}

export interface DrugLabel {
  genericName: string;
  brandNames: string[];
  manufacturer: string | null;
  effectiveDate: string | null;
  setId: string;
  version: string | null;
  route: string[];
  /** «HUMAN PRESCRIPTION DRUG» or «HUMAN OTC DRUG». Prescription labels are preferred. */
  productType: string | null;
  sections: DrugLabelSection[];
  /** No single-ingredient label was found: this is a combination product containing the drug. */
  combination?: boolean;
  dailyMedUrl: string;
  apiUrl: string;
}

export interface DrugLabelResult {
  status: "ok" | "not_found" | "unavailable" | "failed";
  query: string;
  label: DrugLabel | null;
  total: number;
  error: string | null;
  durationMs: number;
  retrievedAt: string;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const BASE = "https://api.fda.gov/drug/label.json";
const SECTION_CHARS = 900;
const cache = new Map<string, { expires: number; value: DrugLabelResult }>();
const CACHE_TTL_MS = 6 * 60 * 60_000;

function first(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Labels repeat the section heading ("1 INDICATIONS & USAGE …"); drop it and cut on a sentence. */
export function cleanSection(raw: string, limit = SECTION_CHARS): { text: string; truncated: boolean } {
  let text = raw.replace(/\s*■\s*/g, " • ").replace(/\s+/g, " ").trim();
  text = text.replace(/^(?:\d+(?:\.\d+)?\s+)?[A-Z][A-Z &/,()-]{3,80}?(?=\s+[A-Z][a-z])/u, "").trim();
  if (text.length <= limit) return { text, truncated: false };
  const cut = text.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return { text: `${(stop > limit * 0.5 ? cut.slice(0, stop + 1) : cut).trim()}…`, truncated: true };
}

/** «Dosage (2.5) 6/2026 Dosage ( 2.5 ) 6/2026» → one entry per changed section. */
export function dedupeChangeList(raw: string): string {
  const normalized = raw.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/^recent major changes\s*/iu, "");
  const entries = normalized.match(/[^()]+?\([\d.]+\)\s*\d{1,2}\/\d{4}/g)?.map(entry => entry.trim()) ?? [];
  return entries.length ? [...new Set(entries)].join("; ") : normalized;
}

function effectiveDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function parseLabel(record: Record<string, unknown>, apiUrl: string): DrugLabel | null {
  const setId = typeof record.set_id === "string" ? record.set_id : null;
  if (!setId) return null;
  const openfda = (record.openfda && typeof record.openfda === "object" ? record.openfda : {}) as Record<string, unknown>;
  const sections: DrugLabelSection[] = [];
  for (const section of LABEL_SECTIONS) {
    let raw = first(record[section.id]) ?? section.fallback?.map(key => first(record[key])).find(Boolean) ?? null;
    if (!raw || raw.trim().length < 20) continue;
    if (section.id === "recent_major_changes") raw = dedupeChangeList(raw);
    const cleaned = cleanSection(raw);
    if (cleaned.text.length < 20) continue;
    sections.push({ id: section.id, ru: section.ru, text: cleaned.text, truncated: cleaned.truncated });
  }
  return {
    genericName: (first(openfda.generic_name) ?? "").toLowerCase(),
    brandNames: [...new Set(strings(openfda.brand_name))].slice(0, 4),
    manufacturer: first(openfda.manufacturer_name),
    effectiveDate: effectiveDate(record.effective_time),
    setId,
    version: typeof record.version === "string" ? record.version : null,
    route: strings(openfda.route).slice(0, 3),
    productType: first(openfda.product_type),
    sections,
    dailyMedUrl: `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${encodeURIComponent(setId)}`,
    apiUrl,
  };
}

/** Labels asked for at once; the first single-ingredient one is used. */
const CANDIDATE_LABELS = 20;

/**
 * A label of the drug itself, with or without its salt («bisoprolol fumarate», «apixaban»), not a combination
 * («bisoprolol fumarate and hydrochlorothiazide», «amlodipine besylate, valsartan»).
 */
export function isSingleIngredient(genericName: string, inn: string): boolean {
  const value = genericName.trim().toLowerCase();
  if (!value) return false;
  if (/\s(?:and|with|plus)\s|[,;/+&]/u.test(value)) return false;
  return value.split(/\s+/u)[0] === inn.trim().toLowerCase().split(/\s+/u)[0];
}

export async function lookupDrugLabelLive(genericName: string, options: { fetchImpl?: FetchLike; timeoutMs?: number; disabled?: boolean; now?: () => Date } = {}): Promise<DrugLabelResult> {
  // A physician needs the prescribing information; an OTC consumer label is the fallback.
  const prescription = await lookupLabel(genericName, "HUMAN PRESCRIPTION DRUG", options);
  if (prescription.status !== "not_found") return prescription;
  return lookupLabel(genericName, null, options);
}

async function lookupLabel(genericName: string, productType: string | null, options: { fetchImpl?: FetchLike; timeoutMs?: number; disabled?: boolean; now?: () => Date }): Promise<DrugLabelResult> {
  const started = Date.now();
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  const name = genericName.trim().toLowerCase().replace(/"/g, "");
  const search = productType ? `openfda.generic_name:"${name}" AND openfda.product_type:"${productType}"` : `openfda.generic_name:"${name}"`;
  // Several labels, newest first: the newest label of «bisoprolol» is often a combination product
  // («bisoprolol fumarate and hydrochlorothiazide»), whose doses are not the single drug's.
  const params = new URLSearchParams({ search, sort: "effective_time:desc", limit: String(CANDIDATE_LABELS) });
  const apiKey = process.env.OPENFDA_API_KEY?.trim();
  if (apiKey) params.set("api_key", apiKey);
  const url = `${BASE}?${params.toString()}`;
  const publicUrl = `${BASE}?search=openfda.generic_name:%22${encodeURIComponent(name)}%22&sort=effective_time:desc&limit=1`;
  if (options.disabled ?? process.env.OPENFDA_DISABLED === "1") {
    return { status: "unavailable", query: name, label: null, total: 0, error: "openFDA отключён в настройках окружения", durationMs: 0, retrievedAt };
  }
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.value;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetchImpl) return { status: "unavailable", query: name, label: null, total: 0, error: "Сетевой клиент недоступен", durationMs: 0, retrievedAt };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 7000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    // openFDA answers 404 with an error body when nothing matches.
    if (response.status === 404) {
      const value: DrugLabelResult = { status: "not_found", query: name, label: null, total: 0, error: null, durationMs: Date.now() - started, retrievedAt };
      cache.set(url, { expires: Date.now() + CACHE_TTL_MS, value });
      return value;
    }
    if (!response.ok) return { status: "unavailable", query: name, label: null, total: 0, error: response.status === 429 ? "openFDA временно ограничил частоту запросов" : `openFDA ответил ошибкой ${response.status}`, durationMs: Date.now() - started, retrievedAt };
    const payload = await response.json() as { results?: unknown; meta?: { results?: { total?: unknown } } };
    const records = Array.isArray(payload.results) ? payload.results.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
    const labels = records.map(record => parseLabel(record, publicUrl)).filter((label): label is DrugLabel => label !== null);
    if (!labels.length) return { status: "failed", query: name, label: null, total: 0, error: "Ответ openFDA не распознан", durationMs: Date.now() - started, retrievedAt };
    // The drug itself when FDA has its label; otherwise the newest combination, marked as one
    // (sacubitril exists only with valsartan) — its doses are never shown as the drug's own.
    const single = labels.find(item => isSingleIngredient(item.genericName, name));
    const label: DrugLabel = single ?? { ...labels[0], combination: true };
    const value: DrugLabelResult = { status: "ok", query: name, label, total: Number(payload.meta?.results?.total ?? 1) || 1, error: null, durationMs: Date.now() - started, retrievedAt };
    cache.set(url, { expires: Date.now() + CACHE_TTL_MS, value });
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
    return value;
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { status: "unavailable", query: name, label: null, total: 0, error: aborted ? "openFDA не ответил вовремя" : "openFDA сейчас недоступен", durationMs: Date.now() - started, retrievedAt };
  } finally {
    clearTimeout(timer);
  }
}
