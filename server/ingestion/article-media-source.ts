import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { SpecialtyId } from "@/lib/domain/types";

const specialtySchema = z.enum(["cardiology", "oncology"]);

const baseCollection = {
  id: z.string().min(1),
  specialty: specialtySchema,
  role: z.literal("original_article_media"),
  production_url_eligible: z.literal(false),
};

const collectionSchema = z.discriminatedUnion("provider", [
  z.object({
    ...baseCollection,
    provider: z.literal("google_drive"),
    folder_id: z.string().min(1),
    folder_url: z.string().url(),
  }).strict(),
  z.object({
    ...baseCollection,
    provider: z.literal("yandex_disk"),
    folder_url: z.string().url(),
  }).strict(),
]);

export const articleMediaSourceRegistrySchema = z.object({
  version: z.literal(1),
  purpose: z.string().min(1),
  policy: z.object({
    priority: z.array(z.string().min(1)).min(1),
    generate_motion_when: z.string().min(1),
    generated_format: z.literal("gif"),
    source_image_required: z.literal(true),
    runtime_generation: z.literal(false),
  }).strict(),
  collections: z.array(collectionSchema).min(1),
}).strict();

export type ArticleMediaSourceRegistry = z.infer<typeof articleMediaSourceRegistrySchema>;
export type ArticleMediaSourceCollection = z.infer<typeof collectionSchema>;

export async function loadArticleMediaSourceRegistry(root = process.cwd()): Promise<ArticleMediaSourceRegistry> {
  const raw = JSON.parse(await readFile(join(root, "data/article-media-source-registry.json"), "utf8")) as unknown;
  const registry = articleMediaSourceRegistrySchema.parse(raw);
  const ids = registry.collections.map(collection => collection.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate article media source registry ID");
  return registry;
}

export function collectionsForSpecialty(
  registry: ArticleMediaSourceRegistry,
  specialty: SpecialtyId,
): readonly ArticleMediaSourceCollection[] {
  return registry.collections.filter(collection => collection.specialty === specialty);
}

export function yandexDiskPathFromClientUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname !== "disk.yandex.ru") throw new Error("Unsupported Yandex Disk host");
  const prefix = "/client/disk/";
  if (!parsed.pathname.startsWith(prefix)) throw new Error("Expected a Yandex Disk client folder URL");
  const relative = decodeURIComponent(parsed.pathname.slice(prefix.length)).replace(/^\/+|\/+$/gu, "");
  if (!relative) throw new Error("Yandex Disk folder path is empty");
  return `/${relative}`;
}
