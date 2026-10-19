import { db, pool } from "@/db/client";
import { rawArchiveArtifacts } from "@/db/ontology-schema";
import { GoogleDriveApiProvider } from "@/server/ingestion/google-drive-api";
import { loadArticleMediaSourceRegistry, yandexDiskPathFromClientUrl, type ArticleMediaSourceCollection } from "@/server/ingestion/article-media-source";
import { YandexDiskApiProvider } from "@/server/ingestion/yandex-disk-api";
import type { RawArchiveItem, RawArchiveProvider } from "@/server/ingestion/drive-source";

function artifactId(provider: RawArchiveProvider["kind"], providerItemId: string): string {
  return `article-media:${provider}:${encodeURIComponent(providerItemId)}`;
}

async function persist(item: RawArchiveItem, collection: ArticleMediaSourceCollection, provider: RawArchiveProvider, syncedAt: string): Promise<void> {
  await db.insert(rawArchiveArtifacts).values({
    id: artifactId(provider.kind, item.id),
    provider: provider.kind,
    providerItemId: item.id,
    parentProviderItemId: item.parentId,
    sourceRegistryId: collection.id,
    specialty: collection.specialty,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size,
    providerModifiedAt: item.modifiedAt,
    checksum: null,
    materializedLocator: null,
    syncState: "metadata_synced",
    promotedNodeId: null,
    syncedAt,
  }).onConflictDoUpdate({
    target: rawArchiveArtifacts.id,
    set: {
      parentProviderItemId: item.parentId,
      sourceRegistryId: collection.id,
      specialty: collection.specialty,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      providerModifiedAt: item.modifiedAt,
      syncState: "metadata_synced",
      syncedAt,
    },
  });
}

function rootLocator(collection: ArticleMediaSourceCollection): string {
  return collection.provider === "google_drive"
    ? collection.folder_id
    : yandexDiskPathFromClientUrl(collection.folder_url);
}

function providerFor(collection: ArticleMediaSourceCollection): RawArchiveProvider | null {
  if (collection.provider === "google_drive") {
    const token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim();
    return token ? new GoogleDriveApiProvider(token) : null;
  }
  const token = process.env.YANDEX_DISK_ACCESS_TOKEN?.trim();
  return token ? new YandexDiskApiProvider(token) : null;
}

try {
  const registry = await loadArticleMediaSourceRegistry();
  const maxDepth = process.env.ARTICLE_MEDIA_SYNC_MAX_DEPTH ? Number(process.env.ARTICLE_MEDIA_SYNC_MAX_DEPTH) : 1;
  const maxItems = process.env.ARTICLE_MEDIA_SYNC_MAX_ITEMS ? Number(process.env.ARTICLE_MEDIA_SYNC_MAX_ITEMS) : 10_000;
  const syncedAt = new Date().toISOString();
  const report: Array<Record<string, unknown>> = [];

  for (const collection of registry.collections) {
    const provider = providerFor(collection);
    if (!provider) {
      report.push({
        collection: collection.id,
        specialty: collection.specialty,
        provider: collection.provider,
        status: "skipped_missing_token",
      });
      continue;
    }

    let total = 0;
    let images = 0;
    let folders = 0;
    let truncated = false;
    const rootId = rootLocator(collection);
    const context = { specialty: collection.specialty, sourceRegistryId: collection.id };
    const root = await provider.getMetadata(rootId, context);
    await persist(root, collection, provider, syncedAt);
    total += 1;
    if (root.isFolder) folders += 1;
    if (root.mimeType.startsWith("image/")) images += 1;

    const queue: Array<{ folderId: string; depth: number }> = root.isFolder ? [{ folderId: rootId, depth: 0 }] : [];
    while (queue.length && total < maxItems) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      const children = await provider.listChildren(current.folderId, context);
      for (const item of children) {
        if (total >= maxItems) {
          truncated = true;
          break;
        }
        await persist(item, collection, provider, syncedAt);
        total += 1;
        if (item.mimeType.startsWith("image/")) images += 1;
        if (item.isFolder) {
          folders += 1;
          queue.push({ folderId: item.id, depth: current.depth + 1 });
        }
      }
    }

    report.push({
      collection: collection.id,
      specialty: collection.specialty,
      provider: provider.kind,
      status: "synced",
      total,
      images,
      folders,
      truncated,
    });
  }

  console.log(JSON.stringify({ mode: "article_media_inventory_sync", report }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Article media inventory sync failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
