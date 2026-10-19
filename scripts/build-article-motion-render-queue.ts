import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { rawArchiveArtifacts } from "@/db/ontology-schema";
import { listContent } from "@/server/repositories/catalog";
import { loadArticleMediaSourceRegistry } from "@/server/ingestion/article-media-source";
import { approvedEditorialMediaForContent } from "@/lib/ui/approved-medical-media";
import { resolveOriginalArticleImage } from "@/lib/ui/article-source-media";
import {
  buildArticleMotionPrompt,
  shouldQueueArticleMotion,
  type ArticleMotionRenderEntry,
  type ArticleMotionSourceProvider,
} from "@/lib/ui/article-motion-media";
import type { SpecialtyId } from "@/lib/domain/types";

interface RenderManifest {
  version: 1;
  purpose: string;
  entries: ArticleMotionRenderEntry[];
}

function isSupportedSourceProvider(value: string): value is ArticleMotionSourceProvider {
  return value === "google_drive_api" || value === "yandex_disk_api";
}

const specialties: readonly SpecialtyId[] = ["cardiology", "oncology"];
const manifestPath = join(process.cwd(), "data/article-motion-render-manifest.json");

try {
  const registry = await loadArticleMediaSourceRegistry();
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RenderManifest;
  const collectionIds = registry.collections.map(collection => collection.id);
  const artifacts = collectionIds.length
    ? await db.select({
        id: rawArchiveArtifacts.id,
        provider: rawArchiveArtifacts.provider,
        providerItemId: rawArchiveArtifacts.providerItemId,
        sourceRegistryId: rawArchiveArtifacts.sourceRegistryId,
        specialty: rawArchiveArtifacts.specialty,
        name: rawArchiveArtifacts.name,
        mimeType: rawArchiveArtifacts.mimeType,
      }).from(rawArchiveArtifacts).where(inArray(rawArchiveArtifacts.sourceRegistryId, collectionIds))
    : [];

  const existing = new Map(manifest.entries.map(entry => [`${entry.specialty}:${entry.content_id}`, entry]));
  const now = new Date().toISOString();
  let queued = 0;
  let unresolved = 0;
  let preservedReady = 0;

  for (const specialty of specialties) {
    const content = await listContent(specialty);
    for (const item of content) {
      const fallback = approvedEditorialMediaForContent(item);
      if (!fallback || !shouldQueueArticleMotion(item, true)) continue;
      const key = `${specialty}:${item.id}`;
      const prior = existing.get(key);
      if (prior?.status === "ready") {
        preservedReady += 1;
        continue;
      }

      const source = resolveOriginalArticleImage(item, artifacts);
      if (!source || !source.sourceRegistryId || !isSupportedSourceProvider(source.provider)) {
        unresolved += 1;
        continue;
      }

      const entry: ArticleMotionRenderEntry = {
        content_id: item.id,
        specialty,
        status: "queued",
        source_provider: source.provider,
        source_collection_id: source.sourceRegistryId,
        source_item_id: source.providerItemId,
        source_filename: source.name,
        source_mime_type: source.mimeType,
        source_image_url: null,
        source_image_ref: `${source.provider}:${source.providerItemId}`,
        output_url: null,
        output_format: "gif",
        width: null,
        height: null,
        prompt_version: "article-motion-v1",
        prompt: buildArticleMotionPrompt(item),
        provenance_note: `Синтетическая анимация по исходному изображению ${source.name} · ${source.sourceRegistryId}`,
        created_at: prior?.created_at ?? now,
        updated_at: now,
      };
      existing.set(key, entry);
      queued += 1;
    }
  }

  const nextManifest: RenderManifest = {
    ...manifest,
    version: 1,
    entries: [...existing.values()].sort((a, b) => a.specialty.localeCompare(b.specialty) || a.content_id.localeCompare(b.content_id)),
  };
  await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    mode: "build_article_motion_render_queue",
    sourceArtifacts: artifacts.length,
    queued,
    unresolved,
    preservedReady,
    manifestEntries: nextManifest.entries.length,
    manifestPath,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Article motion render queue build failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
