import { inflateRawSync } from "node:zlib";
import { contentTokens, stableId, stem, truncate } from "@/lib/agents/text";
import type { AgentResult, Material, MaterialParseStatus, Provenance } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { fallbackTitle, knownSite, type LinkEnrichment } from "./link-enrichment";
import { checkUploadRisk, deidentify } from "./risk";

/**
 * MaterialService: upload → parse → index → personal retrieval.
 * Materials are scoped to one anonymous session and never shared across users.
 * The original binary is not stored; only extracted, de-identified text.
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_MATERIAL_TEXT = 200_000;

export interface ParsedUpload {
  text: string | null;
  parseStatus: MaterialParseStatus;
  parseNote: string | null;
  redactions: string[];
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

export function htmlToText(html: string): string {
  return decodeXmlEntities(html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Minimal ZIP reader (central directory + deflate/stored), enough for DOCX. */
export function readZipEntry(buffer: Buffer, entryName: string): Buffer | null {
  const eocdSignature = 0x06054b50;
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 66_000); offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSignature) { eocd = offset; break; }
  }
  if (eocd < 0) return null;
  const entries = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < entries; index += 1) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.subarray(pointer + 46, pointer + 46 + nameLength).toString("utf8");
    if (name === entryName) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) return null;
      const localName = buffer.readUInt16LE(localOffset + 26);
      const localExtra = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localName + localExtra;
      const data = buffer.subarray(start, start + compressedSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data, { maxOutputLength: 20 * 1024 * 1024 });
      return null;
    }
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

export function docxToText(buffer: Buffer): string | null {
  const xml = readZipEntry(buffer, "word/document.xml");
  if (!xml) return null;
  const paragraphs = xml.toString("utf8").split(/<\/w:p>/);
  const lines = paragraphs.map(paragraph => decodeXmlEntities([...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match => match[1]).join(""))).map(line => line.trim()).filter(Boolean);
  return lines.join("\n");
}

export function parseUpload(fileName: string, mimeType: string, bytes: Buffer): ParsedUpload {
  const risk = checkUploadRisk(fileName, mimeType);
  if (!risk.allowed) return { text: null, parseStatus: "rejected", parseNote: risk.reason, redactions: [] };
  if (risk.imageNotice) return { text: null, parseStatus: "metadata_only", parseNote: risk.imageNotice, redactions: [] };

  let raw: string | null = null;
  const lower = fileName.toLocaleLowerCase("en-US");
  if (/\.(txt|md|markdown|csv|tsv)$/.test(lower) || /^text\/(plain|markdown|csv)/.test(mimeType)) raw = bytes.toString("utf8");
  else if (/\.(html?|xhtml)$/.test(lower) || /html/.test(mimeType)) raw = htmlToText(bytes.toString("utf8"));
  else if (/\.docx$/.test(lower) || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") raw = docxToText(bytes);
  else if (/\.pdf$/.test(lower) || mimeType === "application/pdf") {
    return { text: null, parseStatus: "parser_unavailable", parseNote: "Извлечение текста из PDF пока не подключено — файл сохранён с названием и заметкой, поиск по содержимому недоступен", redactions: [] };
  } else {
    return { text: null, parseStatus: "metadata_only", parseNote: "Формат не индексируется — сохранены название и заметка", redactions: [] };
  }
  if (raw === null) return { text: null, parseStatus: "parser_unavailable", parseNote: "Не удалось прочитать файл", redactions: [] };
  const cleaned = raw.replace(/\u0000/g, "").trim();
  const deidentified = deidentify(cleaned.slice(0, MAX_MATERIAL_TEXT));
  return {
    text: deidentified.text,
    parseStatus: "indexed",
    parseNote: cleaned.length > MAX_MATERIAL_TEXT ? `Проиндексированы первые ${MAX_MATERIAL_TEXT.toLocaleString("ru-RU")} символов` : null,
    redactions: deidentified.redactions,
  };
}

export function newMaterialId(): string {
  return `mat-${crypto.randomUUID()}`;
}

export function materialFromUpload(args: { specialty: SpecialtyId; fileName: string; mimeType: string; size: number; parsed: ParsedUpload; title?: string | null; note?: string | null; now: string }): Material {
  return {
    id: newMaterialId(),
    specialty: args.specialty,
    kind: "file",
    ownership: "USER_UPLOADED",
    title: (args.title?.trim() || args.fileName).slice(0, 200),
    url: null,
    note: args.note?.trim() ? deidentify(args.note.trim()).text.slice(0, 2000) : null,
    fileName: args.fileName.slice(0, 200),
    mimeType: args.mimeType.slice(0, 120),
    sizeBytes: args.size,
    text: args.parsed.text,
    textChars: args.parsed.text?.length ?? 0,
    parseStatus: args.parsed.parseStatus,
    parseNote: args.parsed.parseNote,
    redactions: args.parsed.redactions,
    sourceResultId: null,
    sourceAgentId: null,
    provenance: { connectorId: "user-uploads", source: "Загружено вами", sourceUrl: null, publisher: null, retrievedAt: args.now, publishedAt: null, version: null, ownership: "USER_UPLOADED", dataOrigin: "user_content" },
    collectionIds: [],
    createdAt: args.now,
    format: "file",
  };
}

export function materialFromLink(args: { specialty: SpecialtyId; url: string; title?: string | null; note?: string | null; now: string; enrichment?: LinkEnrichment | null }): Material {
  const parsedUrl = new URL(args.url);
  const note = args.note?.trim() ? deidentify(args.note.trim()).text.slice(0, 4000) : null;
  const found = args.enrichment ?? null;
  const userTitle = args.title?.trim() || null;
  // The physician's own title wins; otherwise the recognised one; never the hostname or the path.
  const title = (userTitle || found?.title || fallbackTitle(parsedUrl, knownSite(parsedUrl.hostname))).slice(0, 200);
  const abstract = found?.abstract ?? null;
  const text = [title, found?.summary, note, abstract].filter(Boolean).join("\n") || null;
  const recognised = found && (found.basis === "pubmed" || found.basis === "crossref");
  return {
    id: newMaterialId(),
    specialty: args.specialty,
    kind: "link",
    ownership: "PUBLIC_SOURCE",
    title,
    url: parsedUrl.toString(),
    note,
    fileName: null,
    mimeType: null,
    sizeBytes: null,
    text,
    textChars: text?.length ?? 0,
    parseStatus: abstract ? "indexed" : "metadata_only",
    parseNote: abstract
      ? `Сохранены название и аннотация из ${found?.basis === "pubmed" ? "PubMed" : "базы публикаций"} — полный текст по ссылке`
      : recognised ? "Сохранены название и выходные данные — полный текст по ссылке"
        : found?.note ?? "Страница по ссылке не загружается: в поиске участвуют название и ваша заметка",
    redactions: [],
    sourceResultId: null,
    sourceAgentId: null,
    provenance: { connectorId: "user-uploads", source: found?.publisher ?? parsedUrl.hostname.replace(/^www\./u, ""), sourceUrl: parsedUrl.toString(), publisher: found?.publisher ?? null, retrievedAt: args.now, publishedAt: found?.publishedAt ?? null, version: null, ownership: "PUBLIC_SOURCE", dataOrigin: "user_content" },
    collectionIds: [],
    createdAt: args.now,
    format: found?.format ?? "website",
    typeLabel: found?.typeLabel ?? null,
    summary: found?.summary ?? null,
  };
}

export function materialFromNote(args: { specialty: SpecialtyId; title: string; note: string; now: string }): Material {
  const deidentified = deidentify(args.note.trim());
  return {
    id: newMaterialId(),
    specialty: args.specialty,
    kind: "note",
    ownership: "USER_UPLOADED",
    title: args.title.trim().slice(0, 200) || "Заметка",
    url: null,
    note: deidentified.text.slice(0, 20_000),
    fileName: null,
    mimeType: "text/plain",
    sizeBytes: null,
    text: deidentified.text.slice(0, 20_000),
    textChars: Math.min(deidentified.text.length, 20_000),
    parseStatus: "indexed",
    parseNote: null,
    redactions: deidentified.redactions,
    sourceResultId: null,
    sourceAgentId: null,
    provenance: { connectorId: "user-uploads", source: "Ваша заметка", sourceUrl: null, publisher: null, retrievedAt: args.now, publishedAt: null, version: null, ownership: "USER_UPLOADED", dataOrigin: "user_content" },
    collectionIds: [],
    createdAt: args.now,
    format: "note",
  };
}

/** saveMaterial(): an agent output saved by the user keeps its original provenance. */
export function materialFromResult(result: AgentResult, now: string): Material {
  const evidenceText = result.evidence.map(item => `${item.claim}${item.sourceUrl ? ` (${item.sourceUrl})` : ""}`).join("\n");
  const text = [result.title, result.summary, evidenceText].filter(Boolean).join("\n");
  return {
    id: newMaterialId(),
    specialty: result.specialty,
    kind: "agent_result",
    ownership: result.partner ? "PARTNER_SOURCE" : "GENERATED",
    title: result.title.slice(0, 200),
    url: result.source.sourceUrl,
    note: null,
    fileName: null,
    mimeType: null,
    sizeBytes: null,
    text,
    textChars: text.length,
    parseStatus: "indexed",
    parseNote: null,
    redactions: [],
    sourceResultId: result.id,
    sourceAgentId: result.agentId,
    provenance: result.source,
    collectionIds: [],
    createdAt: now,
    format: "result",
  };
}

export interface MaterialHit {
  material: Material;
  score: number;
  snippet: string;
  matchedTerms: string[];
}

function snippetAround(text: string, terms: readonly string[]): string {
  const lower = text.toLocaleLowerCase("ru-RU");
  const position = terms.map(term => lower.indexOf(term)).filter(index => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, position - 120);
  return `${start > 0 ? "…" : ""}${truncate(text.slice(start, start + 360).replace(/\s+/g, " ").trim(), 340)}`;
}

/** searchUserMaterials(): lexical retrieval limited to the requesting user's materials. */
export function searchUserMaterials(materials: readonly Material[], query: string, limit = 6): MaterialHit[] {
  const terms = [...new Set(contentTokens(query))];
  if (!terms.length) return [];
  const stems = terms.map(stem);
  return materials
    .map(material => {
      const haystack = `${material.title}\n${material.note ?? ""}\n${material.text ?? ""}`.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
      const matched: string[] = [];
      let score = 0;
      stems.forEach((value, index) => {
        if (value.length < 3) return;
        const occurrences = haystack.split(value).length - 1;
        if (occurrences > 0) {
          matched.push(terms[index]);
          score += 3 + Math.min(occurrences, 8);
          if (material.title.toLocaleLowerCase("ru-RU").includes(value)) score += 4;
        }
      });
      return { material, score, matchedTerms: matched, snippet: snippetAround(`${material.text ?? material.note ?? material.title}`, stems) };
    })
    .filter(hit => hit.matchedTerms.length > 0 && hit.matchedTerms.length >= Math.min(2, terms.length))
    .sort((a, b) => b.score - a.score || b.material.createdAt.localeCompare(a.material.createdAt))
    .slice(0, limit);
}

export function materialProvenance(material: Material): Provenance {
  return material.provenance ?? { connectorId: "user-uploads", source: material.title, sourceUrl: material.url, publisher: null, retrievedAt: material.createdAt, publishedAt: null, version: null, ownership: material.ownership, dataOrigin: "user_content" };
}

export function materialEvidenceId(material: Material, snippet: string): string {
  return stableId("ev", "material", material.id, snippet.slice(0, 80));
}
