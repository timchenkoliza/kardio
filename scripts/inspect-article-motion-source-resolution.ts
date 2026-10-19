import { inArray } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { rawArchiveArtifacts } from "@/db/ontology-schema";
import { listContent } from "@/server/repositories/catalog";
import { loadArticleMediaSourceRegistry } from "@/server/ingestion/article-media-source";
import { approvedEditorialMediaForContent } from "@/lib/ui/approved-medical-media";
import { resolveOriginalArticleImage } from "@/lib/ui/article-source-media";
import { readyArticleMotionForContent, shouldQueueArticleMotion } from "@/lib/ui/article-motion-media";
import type { SpecialtyId } from "@/lib/domain/types";

const specialties: readonly SpecialtyId[] = ["cardiology", "oncology"];

try {
  const registry = await loadArticleMediaSourceRegistry();
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

  const rows: Array<Record<string, unknown>> = [];
  for (const specialty of specialties) {
    const content = await listContent(specialty);
    for (const item of content) {
      const genericFallback = approvedEditorialMediaForContent(item);
      if (!genericFallback || !shouldQueueArticleMotion(item, true) || readyArticleMotionForContent(item)) continue;
      const source = resolveOriginalArticleImage(item, artifacts);
      rows.push({
        contentId: item.id,
        specialty,
        title: item.title,
        fallbackAssetId: genericFallback.id,
        sourceResolved: Boolean(source),
        sourceRegistryId: source?.sourceRegistryId ?? null,
        sourceProvider: source?.provider ?? null,
        sourceProviderItemId: source?.providerItemId ?? null,
        sourceFilename: source?.name ?? null,
      });
    }
  }

  const resolved = rows.filter(row => row.sourceResolved).length;
  console.log(JSON.stringify({
    mode: "read_only_article_motion_source_resolution",
    sourceCollections: registry.collections.map(collection => ({ id: collection.id, specialty: collection.specialty, provider: collection.provider })),
    sourceArtifacts: artifacts.length,
    candidates: rows.length,
    sourceResolved: resolved,
    unresolved: rows.length - resolved,
    sampleResolved: rows.filter(row => row.sourceResolved).slice(0, 20),
    sampleUnresolved: rows.filter(row => !row.sourceResolved).slice(0, 20),
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Article motion source resolution inspection failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
