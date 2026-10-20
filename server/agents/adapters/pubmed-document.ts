export interface PubmedDocumentSection {
  label: string;
  text: string;
}

export interface PubmedEvidenceDocument {
  pmid: string;
  pmcid: string | null;
  access: "full_text" | "abstract" | "unavailable";
  sections: PubmedDocumentSection[];
  sourceUrl: string;
  note: string | null;
}

type TextFetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
let nextSlotAt = 0;

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return `&${entity};`;
  });
}

function cleanXmlText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/gu, " ")).replace(/\s+/gu, " ").trim();
}

function attr(attributes: string, name: string): string | null {
  const match = attributes.match(new RegExp(`${name}=["']([^"']+)["']`, "iu"));
  return match?.[1] ?? null;
}

export function parsePubmedAbstractXml(xml: string): { pmcid: string | null; sections: PubmedDocumentSection[] } {
  const pmcid = xml.match(/<ArticleId\b[^>]*IdType=["']pmc["'][^>]*>(PMC\d+)<\/ArticleId>/iu)?.[1] ?? null;
  const sections = [...xml.matchAll(/<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/giu)].map((match, index) => ({
    label: attr(match[1] ?? "", "Label") ?? attr(match[1] ?? "", "NlmCategory") ?? (index ? `Abstract ${index + 1}` : "Abstract"),
    text: cleanXmlText(match[2] ?? "").slice(0, 10_000),
  })).filter(section => section.text.length > 20);
  return { pmcid, sections };
}

export function parsePmcFullTextXml(xml: string): PubmedDocumentSection[] {
  const body = xml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/iu)?.[1] ?? "";
  if (!body) return [];
  const chunks = body.split(/<sec\b[^>]*>/iu).slice(1);
  const sections = chunks.map((chunk, index) => {
    const title = cleanXmlText(chunk.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? "") || `Section ${index + 1}`;
    const paragraphs = [...chunk.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)]
      .map(match => cleanXmlText(match[1] ?? ""))
      .filter(text => text.length > 20);
    return { label: title.slice(0, 120), text: paragraphs.join(" ").slice(0, 12_000) };
  }).filter(section => section.text.length > 40).slice(0, 20);
  if (sections.length) return sections;
  const fallback = cleanXmlText(body).slice(0, 60_000);
  return fallback.length > 100 ? [{ label: "Full text", text: fallback }] : [];
}

async function waitForSlot(intervalMs: number) {
  const now = Date.now();
  const at = Math.max(now, nextSlotAt);
  nextSlotAt = at + intervalMs;
  if (at > now) await new Promise(resolve => setTimeout(resolve, at - now));
}

async function fetchText(fetchImpl: TextFetchLike, url: string, timeoutMs: number, intervalMs: number): Promise<string | null> {
  await waitForSlot(intervalMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/xml,text/xml" } });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function queryUrl(db: "pubmed" | "pmc", id: string): string {
  const params = new URLSearchParams({ db, id, retmode: "xml", tool: "kardio-workspace" });
  const apiKey = process.env.NCBI_API_KEY?.trim();
  if (apiKey) params.set("api_key", apiKey);
  return `${BASE}?${params.toString()}`;
}

export async function retrievePubmedEvidenceDocument(
  pmid: string,
  options: { fetchImpl?: TextFetchLike; timeoutMs?: number; minIntervalMs?: number } = {},
): Promise<PubmedEvidenceDocument> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as TextFetchLike | undefined);
  const sourceUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
  if (!fetchImpl) return { pmid, pmcid: null, access: "unavailable", sections: [], sourceUrl, note: "Сетевой клиент недоступен" };

  const intervalMs = options.minIntervalMs ?? (options.fetchImpl ? 0 : process.env.NCBI_API_KEY?.trim() ? 110 : 350);
  const timeoutMs = options.timeoutMs ?? 6000;
  const pubmedXml = await fetchText(fetchImpl, queryUrl("pubmed", pmid), timeoutMs, intervalMs);
  if (!pubmedXml) return { pmid, pmcid: null, access: "unavailable", sections: [], sourceUrl, note: "PubMed не вернул текст записи" };

  const parsed = parsePubmedAbstractXml(pubmedXml);
  if (parsed.pmcid) {
    const pmcXml = await fetchText(fetchImpl, queryUrl("pmc", parsed.pmcid), timeoutMs, intervalMs);
    if (pmcXml) {
      const full = parsePmcFullTextXml(pmcXml);
      if (full.length) return {
        pmid,
        pmcid: parsed.pmcid,
        access: "full_text",
        sections: full,
        sourceUrl: `https://pmc.ncbi.nlm.nih.gov/articles/${parsed.pmcid}/`,
        note: null,
      };
    }
  }

  if (parsed.sections.length) return {
    pmid,
    pmcid: parsed.pmcid,
    access: "abstract",
    sections: parsed.sections,
    sourceUrl,
    note: parsed.pmcid ? "Полный текст недоступен во время запуска, использована аннотация" : "Полного текста в открытом доступе нет, использована аннотация",
  };
  return { pmid, pmcid: parsed.pmcid, access: "unavailable", sections: [], sourceUrl, note: "В записи нет доступного abstract или полного текста PMC" };
}
