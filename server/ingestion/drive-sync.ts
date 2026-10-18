import { db } from "@/db/client";
import { rawArchiveArtifacts } from "@/db/ontology-schema";
import type { SpecialtyId } from "@/lib/domain/types";
import { loadDriveSourceRegistry, type RawArchiveItem, type RawArchiveProvider } from "@/server/ingestion/drive-source";

function rawArchiveArtifactId(provider: RawArchiveProvider["kind"], providerItemId: string): string {
  return `raw-archive:${provider}:${encodeURIComponent(providerItemId)}`;
}

async function persistArchiveItem(args: {
  item: RawArchiveItem;
  specialty: SpecialtyId;
  sourceRegistryId: string;
  provider: RawArchiveProvider;
  syncedAt: string;
}): Promise<string> {
  const artifactId = rawArchiveArtifactId(args.provider.kind, args.item.id);
  await db.insert(rawArchiveArtifacts).values({
    id: artifactId,
    provider: args.provider.kind,
    providerItemId: args.item.id,
    parentProviderItemId: args.item.parentId,
    sourceRegistryId: args.sourceRegistryId,
    specialty: args.specialty,
    name: args.item.name,
    mimeType: args.item.mimeType,
    size: args.item.size,
    providerModifiedAt: args.item.modifiedAt,
    checksum: null,
    materializedLocator: null,
    syncState: "metadata_synced",
    promotedNodeId: null,
    syncedAt: args.syncedAt,
  }).onConflictDoUpdate({
    target: rawArchiveArtifacts.id,
    set: {
      provider: args.provider.kind,
      providerItemId: args.item.id,
      parentProviderItemId: args.item.parentId,
      sourceRegistryId: args.sourceRegistryId,
      specialty: args.specialty,
      name: args.item.name,
      mimeType: args.item.mimeType,
      size: args.item.size,
      providerModifiedAt: args.item.modifiedAt,
      syncState: "metadata_synced",
      syncedAt: args.syncedAt,
    },
  });
  return artifactId;
}

export interface DriveSyncReport {
  provider: RawArchiveProvider["kind"];
  exports: number;
  artifacts: number;
  folders: number;
  files: number;
  expectedEntryMissing: string[];
  truncated: boolean;
}

export async function syncDriveRawArchiveInventory(args: {
  provider: RawArchiveProvider;
  root?: string;
  maxDepth?: number;
  maxItems?: number;
}): Promise<DriveSyncReport> {
  const registry = await loadDriveSourceRegistry(args.root);
  const maxDepth = args.maxDepth ?? 4;
  const maxItems = args.maxItems ?? 20_000;
  const syncedAt = new Date().toISOString();
  let artifacts = 0;
  let folders = 0;
  let files = 0;
  let truncated = false;
  const expectedEntryMissing: string[] = [];

  for (const source of registry.telegram_exports) {
    if (artifacts >= maxItems) { truncated = true; break; }
    const rootMetadata = await args.provider.getMetadata(source.folder_id, { specialty: source.specialty, sourceRegistryId: source.id });
    await persistArchiveItem({
      item: rootMetadata,
      specialty: source.specialty,
      sourceRegistryId: source.id,
      provider: args.provider,
      syncedAt,
    });
    artifacts += 1;
    if (rootMetadata.isFolder) folders += 1;
    else files += 1;

    const queue: Array<{ folderId: string; depth: number }> = [{ folderId: source.folder_id, depth: 0 }];
    let sawExpectedEntry = false;

    while (queue.length && artifacts < maxItems) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      const children = await args.provider.listChildren(current.folderId, { specialty: source.specialty, sourceRegistryId: source.id });
      for (const item of children) {
        if (artifacts >= maxItems) { truncated = true; break; }
        if (current.depth === 0 && item.name === source.expected_entry && !item.isFolder) sawExpectedEntry = true;
        await persistArchiveItem({
          item,
          specialty: source.specialty,
          sourceRegistryId: source.id,
          provider: args.provider,
          syncedAt,
        });
        artifacts += 1;
        if (item.isFolder) {
          folders += 1;
          queue.push({ folderId: item.id, depth: current.depth + 1 });
        } else {
          files += 1;
        }
      }
    }

    if (!sawExpectedEntry) expectedEntryMissing.push(source.id);
  }

  return {
    provider: args.provider.kind,
    exports: registry.telegram_exports.length,
    artifacts,
    folders,
    files,
    expectedEntryMissing,
    truncated,
  };
}
