import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import type { Asset, ContentKind, ContentObject, Source } from "@/lib/domain/types";
import { resolveCurrentness } from "@/lib/currentness";

export const GOLDENSET_CHECKSUM = "1b0bd273b8652856209201e72474f40824b3fb987e16fc192863f376efafd7af";
export const DATASET_ID = "cardio-goldenset-v2";
const text = z.string().min(1);
const nullableText = text.nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
const url = z.string().url().refine((value) => ["https:", "http:"].includes(new URL(value).protocol), "HTTP(S) source URL required");

export const canonicalContentSchema = z.object({
  golden_id: text, canonical_topic_id: text, parent_document_id: nullableText, supersedes_id: nullableText, superseded_by_id: nullableText,
  content_type: z.enum(["Клинические рекомендации", "Видеолекция", "Новости журнала", "Проект", "Новости Общества", "ТВ-студия", "Вебинар", "Сервис членства", "Клиническая карточка"]),
  format: text, title: text, card_summary: text, topic: text, clinical_task: text, audience: text, author_expert: nullableText, organization: text,
  publication_date: date.nullable(), publication_year: z.string().regex(/^(19|20)\d{2}$/).nullable(),
  source_id: text, source_url: url.nullable(), source_asset: nullableText, source_location: text,
  provenance_type: z.enum(["uploaded_pdf", "user_export", "derived_from_uploaded_pdf"]),
  trust_layer: z.enum(["official", "professional", "expert", "commercial", "community", "user-added"]),
  category: text, subcategory: nullableText, commercial_status: z.enum(["non_commercial", "commercial", "pharma_associated", "unknown"]),
  editorial_status: z.enum(["verified_from_upload", "source_grounded", "derived_from_source"]),
  freshness_status: z.enum(["current", "current_in_export", "legacy", "superseded", "needs_currentness_check", "needs_version_check", "needs_date_check", "archive"]),
  is_current: z.enum(["yes", "no", "review"]), last_checked_at: date, rights_status: z.literal("needs_rights_review"),
  prototype_surface: z.enum(["Рекомендации", "Обучение", "Новости", "Сообщество", "Профиль"]),
  prototype_priority: z.enum(["P0", "P1", "P2"]), card_badge: text, emergency_flag: z.boolean(), requires_clinician_confirmation: z.boolean(),
  tags: text, qa_notes: nullableText, language: text,
}).strict();

export const canonicalSourceSchema = z.object({
  source_id: text, name: text, url: url.nullable(), domain: nullableText, language: text, specialty: text,
  category: nullableText, subcategory: nullableText, commercial_status: text, source_role: text, qa_status: text,
  last_checked_at: date, notes: nullableText,
}).strict();

export const goldenDatasetSchema = z.object({
  meta: z.object({ name: text, generated_from: text, content_count: z.literal(54), source_count: z.literal(18), principle: text, last_checked_at: date }).strict(),
  content: z.array(canonicalContentSchema).length(54), sources: z.array(canonicalSourceSchema).length(18),
  schema: z.array(z.object({ field: text, type: text, description: text, required: z.enum(["must", "optional"]) }).strict()).length(38),
  qa_rules: z.array(z.object({ rule_id: text, rule: text, implementation: text, severity: text }).strict()).length(8),
}).strict();

const imageSchema = z.object({
  asset_filename: text.optional(), image_url: url.optional(), image_origin: z.enum(["source", "pdf", "uploaded", "external"]),
  image_source_name: text, image_source_url: url.nullable(), image_credit: nullableText, image_usage_note: text,
  image_semantic_role: z.enum(["clinical", "expert", "event", "publication", "research", "anatomy"]),
  image_status: z.enum(["verified", "needs_review"]),
  render_policy: z.enum(["publishable", "prototype_only_until_rights_verified", "do_not_render"]),
}).strict();

const enrichmentSchema = z.object({
  meta: z.record(z.string(), z.unknown()), mappings: z.record(z.string(), imageSchema),
  unassigned_uploaded_assets: z.array(z.record(z.string(), z.unknown())),
  reference_only_assets: z.array(z.record(z.string(), z.unknown())),
}).strict();
const evaluationSchema = z.object({
  meta: z.object({ name: text, version: text, purpose: text, count: z.literal(24) }).strict(), golden_ids: z.array(text).length(24),
}).strict();

export type CanonicalContent = z.infer<typeof canonicalContentSchema>;
export type CanonicalSource = z.infer<typeof canonicalSourceSchema>;
export type GoldenDataset = z.infer<typeof goldenDatasetSchema>;
export type ImageEnrichment = z.infer<typeof enrichmentSchema>;
export type EvaluationManifest = z.infer<typeof evaluationSchema>;
export interface LoadedGoldenSet {
  dataset: GoldenDataset;
  checksum: string;
  manifest: Record<string, unknown>;
  evaluation: EvaluationManifest;
  enrichment: ImageEnrichment;
  observations: Record<string, unknown>[];
}

function assertUnique(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} ID`);
}

export function validateGoldenSet(input: unknown, evaluationInput: unknown, enrichmentInput: unknown) {
  const dataset = goldenDatasetSchema.parse(input);
  const evaluation = evaluationSchema.parse(evaluationInput);
  const enrichment = enrichmentSchema.parse(enrichmentInput);
  assertUnique(dataset.content.map((item) => item.golden_id), "content");
  assertUnique(dataset.sources.map((source) => source.source_id), "source");
  assertUnique(evaluation.golden_ids, "evaluation");
  const byId = new Map(dataset.content.map((item) => [item.golden_id, item]));
  const sources = new Set(dataset.sources.map((source) => source.source_id));
  for (const item of dataset.content) {
    if (!sources.has(item.source_id)) throw new Error(`Unknown source ${item.source_id} for ${item.golden_id}`);
    for (const field of ["parent_document_id", "supersedes_id", "superseded_by_id"] as const) {
      const target = item[field];
      if (target && (!byId.has(target) || target === item.golden_id)) throw new Error(`Invalid ${field} for ${item.golden_id}`);
    }
    if (item.freshness_status === "superseded" && !item.superseded_by_id) throw new Error(`Missing replacement for ${item.golden_id}`);
    if (item.superseded_by_id && byId.get(item.superseded_by_id)?.supersedes_id !== item.golden_id) throw new Error(`Non-reciprocal version chain for ${item.golden_id}`);
    if (item.supersedes_id && byId.get(item.supersedes_id)?.superseded_by_id !== item.golden_id) throw new Error(`Non-reciprocal version chain for ${item.golden_id}`);
    if (item.publication_date && item.publication_year && !item.publication_date.startsWith(item.publication_year)) throw new Error(`Publication year mismatch for ${item.golden_id}`);
    const visited = new Set<string>([item.golden_id]);
    let next = item.superseded_by_id;
    while (next) {
      if (visited.has(next)) throw new Error(`Cyclic version chain for ${item.golden_id}`);
      visited.add(next);
      next = byId.get(next)?.superseded_by_id ?? null;
    }
  }
  for (const id of evaluation.golden_ids) if (!byId.has(id)) throw new Error(`Unknown evaluation ID ${id}`);
  for (const id of Object.keys(enrichment.mappings)) if (!byId.has(id)) throw new Error(`Unknown image content ID ${id}`);
  return { dataset, evaluation, enrichment };
}

/** Constrained serialization parser. Never execute legacy JavaScript. */
export function decodeGoldenChunks(chunks: string[], expectedChecksum = GOLDENSET_CHECKSUM): { json: unknown; checksum: string } {
  if (chunks.length !== 5) throw new Error("Expected exactly five Golden Set chunks");
  const encoded = chunks.map((chunk) => {
    const match = /^window\.KARDIO_GOLDENSET_CHUNKS\.push\(("[A-Za-z0-9+/=]+")\);?\s*$/.exec(chunk.trim());
    if (!match) throw new Error("Invalid Golden Set chunk transport");
    return JSON.parse(match[1]) as string;
  }).join("");
  const bytes = gunzipSync(Buffer.from(encoded, "base64"), { maxOutputLength: 4 * 1024 * 1024 });
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== expectedChecksum || checksum !== GOLDENSET_CHECKSUM) throw new Error("Golden Set checksum mismatch");
  return { json: JSON.parse(bytes.toString("utf8")), checksum };
}

export async function loadGoldenSet(root = process.cwd()): Promise<LoadedGoldenSet> {
  const chunks = await Promise.all(Array.from({ length: 5 }, (_, index) => readFile(join(root, `data/goldenset-chunk-0${index + 1}.js`), "utf8")));
  const [manifestInput, evaluation, enrichment, observationsInput] = await Promise.all([
    "data/cardio_goldenset_content_db_v2.manifest.json", "data/cardio-evaluation-slice-v1.json",
    "data/content-image-enrichment.json", "context/knowledge/source_registry.cardiology.json",
  ].map(async (path) => JSON.parse(await readFile(join(root, path), "utf8")) as unknown));
  const manifest = z.record(z.string(), z.unknown()).parse(manifestInput);
  if (manifest.normalized_runtime_json_sha256 !== GOLDENSET_CHECKSUM || manifest.content_count !== 54 || manifest.source_count !== 18) throw new Error("Golden Set manifest mismatch");
  const decoded = decodeGoldenChunks(chunks);
  const validated = validateGoldenSet(decoded.json, evaluation, enrichment);
  const observations = z.array(z.record(z.string(), z.unknown())).parse(observationsInput);
  const observationIds = observations.map((item) => text.parse(item.id));
  assertUnique(observationIds, "research source");
  if (observations.some((item) => item.trust_status !== "unknown_unless_separately_verified")) throw new Error("Research observation cannot become verified source");
  return { ...validated, checksum: decoded.checksum, manifest, observations };
}

export function normalizeSource(raw: CanonicalSource): Source {
  const values = Object.values(raw);
  return {
    id: raw.source_id, specialty: "cardiology", name: raw.name, type: raw.source_role, publisher: null, url: raw.url,
    trustStatus: "unknown_unless_separately_verified", commercialStatus: raw.commercial_status,
    metadataCompleteness: Math.round(100 * values.filter((value) => value !== null && value !== "").length / values.length),
    notes: raw.notes, lastCheckedAt: raw.last_checked_at,
  };
}

const kinds: Record<CanonicalContent["content_type"], ContentKind> = {
  "Клинические рекомендации": "guideline", "Видеолекция": "video", "Новости журнала": "article", "Проект": "article",
  "Новости Общества": "article", "ТВ-студия": "video", "Вебинар": "event", "Сервис членства": "service", "Клиническая карточка": "clinical",
};

export function normalizeAsset(id: string, raw: ImageEnrichment["mappings"][string]): Asset {
  const publishable = raw.image_status === "verified" && raw.render_policy === "publishable";
  return {
    id: `image-${id}`, url: publishable ? raw.image_url ?? null : null, sourceUrl: raw.image_source_url,
    credit: raw.image_credit, caption: raw.image_usage_note, status: raw.image_status, rights: raw.render_policy,
    semanticMatch: raw.image_semantic_role, width: null, height: null,
  };
}

export function normalizeGoldenSet(loaded: Pick<LoadedGoldenSet, "dataset" | "enrichment">): { content: ContentObject[]; sources: Source[] } {
  const sources = loaded.dataset.sources.map(normalizeSource);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const content: ContentObject[] = loaded.dataset.content.map((raw) => {
    const source = sourceById.get(raw.source_id);
    if (!source) throw new Error(`Unknown source ${raw.source_id}`);
    const image = loaded.enrichment.mappings[raw.golden_id];
    return {
      id: raw.golden_id, specialty: "cardiology", kind: kinds[raw.content_type], type: raw.content_type,
      title: raw.title, summary: raw.card_summary, sourceId: raw.source_id, source, canonicalUrl: raw.source_url,
      publicationDate: raw.publication_date, publicationYear: raw.publication_year ? Number(raw.publication_year) : null,
      updatedAt: null, lastCheckedAt: raw.last_checked_at, language: raw.language,
      topics: [...new Set([raw.canonical_topic_id, raw.topic])], tags: raw.tags.split(";").map((tag) => tag.trim()).filter(Boolean),
      ...resolveCurrentness(raw), freshness: raw.freshness_status, version: raw.content_type === "Клинические рекомендации" ? raw.publication_year : null,
      parentId: raw.parent_document_id, supersedesId: raw.supersedes_id, supersededById: raw.superseded_by_id,
      trustLayer: raw.trust_layer, editorialStatus: raw.editorial_status, rightsStatus: raw.rights_status,
      priority: { P0: 30, P1: 20, P2: 10 }[raw.prototype_priority], author: raw.author_expert,
      provenance: { type: raw.provenance_type, asset: raw.source_asset, location: raw.source_location, notes: raw.qa_notes },
      asset: image ? normalizeAsset(raw.golden_id, image) : null,
    };
  });
  return { content, sources };
}

export function validationReport(loaded: LoadedGoldenSet) {
  const normalized = normalizeGoldenSet(loaded);
  return {
    checksum: loaded.checksum, content: normalized.content.length, sources: normalized.sources.length,
    evaluation: loaded.evaluation.golden_ids.length, researchObservations: loaded.observations.length,
    missingPublicationDate: normalized.content.filter((item) => !item.publicationDate).length,
    unknownPublicationYear: normalized.content.filter((item) => item.publicationYear === null).length,
    rightsRequireReview: normalized.content.filter((item) => item.rightsStatus === "needs_rights_review").length,
    publishableImages: normalized.content.filter((item) => item.asset?.url).length,
  };
}
