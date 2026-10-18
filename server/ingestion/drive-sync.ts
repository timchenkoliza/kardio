import { db } from "@/db/client";
import { evidenceRecords, ontologyNodes, rawArchiveArtifacts } from "@/db/ontology-schema";
import type { SpecialtyId } from "@/lib/domain/types";
import { evidenceId, ontologyEdgeId, ontologyNodeId, specialtyNodeId } from "@/lib/ontology/ids";
import type { OntologyEdge } from "@/lib/ontology/types";
import { loadDriveSourceRegistry, type RawArchiveItem, type RawArchiveProvider } from "@/server/ingestion/drive-source";
import { upsertOntologyEdge } from "@/server/repositories/ontology";

function externalArtifactNodeId(specialty: SpecialtyId, providerItemId: string): string {
  return ontologyNodeId({ type: "external_artifact", specialty, namespace: "google-drive", originalId: providerItemId });
}

async function ensureSpecialtyNode(specialty: SpecialtyId): Promise<string> {
  const id = specialtyNodeId(specialty);
  await db.insert(ontologyNodes).values({
    id,
    type: "specialty",
    specialty,
    label: specialty === "cardiology" ? "Кардиология" : "Онкология",
    originalId: specialty,
    namespace: "system",
    attributes: {},
    raw: null,
  }).onConflictDoNothing();
  return id;
}

async function persistArchiveItem(args: {
  item: RawArchiveItem;
  specialty: SpecialtyId;
  sourceRegistryId: string;
  provider: RawArchiveProvider;
  parentOntologyNodeId?: string | null;
  syncedAt: string;
}): Promise<string> {
  const nodeId = externalArtifactNodeId(args.specialty, args.item.id);
  await db.insert(ontologyNodes).values({
    id: nodeId,
    type: "external_artifact",
    specialty: args.specialty,
    label: args.item.name,
    originalId: args.item.id,
    namespace: "google-drive",
    attributes: {
      provider: args.provider.kind,
      sourceRegistryId: args.sourceRegistryId,
      mimeType: args.item.mimeType,
      size: args.item.size,
      modifiedAt: args.item.modifiedAt,
      isFolder: args.item.isFolder,
    },
    raw: null,
  }).onConflictDoUpdate({
    target: ontologyNodes.id,
    set: {
      label: args.item.name,
      specialty: args.specialty,
      attributes: {
        provider: args.provider.kind,
        sourceRegistryId: args.sourceRegistryId,
        mimeType: args.item.mimeType,
        size: args.item.size,
        modifiedAt: args.item.modifiedAt,
        isFolder: args.item.isFolder,
      },
    },
  });

  await db.insert(rawArchiveArtifacts).values({
    ontologyNodeId: nodeId,
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
    syncedAt: args.syncedAt,
  }).onConflictDoUpdate({
    target: rawArchiveArtifacts.ontologyNodeId,
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

  const metadataEvidenceId = evidenceId("google-drive", nodeId, "provider-metadata");
  await db.insert(evidenceRecords).values({
    id: metadataEvidenceId,
    targetKind: "node",
    targetId: nodeId,
    targetProperty: null,
    type: "derived_from_source",
    sourceNodeId: null,
    externalUrl: null,
    artifactRef: `google-drive:${args.item.id}`,
    capturedAt: args.syncedAt,
    verifiedAt: args.syncedAt,
    extractionMethod: `${args.provider.kind}_metadata_sync`,
    confidence: 1,
    verification: "verified",
    reviewer: null,
    rightsState: null,
    validFrom: args.item.modifiedAt,
    expiresAt: null,
    notes: "Provider metadata evidence only; not clinical authority or redistribution-rights evidence.",
  }).onConflictDoUpdate({
    target: evidenceRecords.id,
    set: {
      artifactRef: `google-drive:${args.item.id}`,
      capturedAt: args.syncedAt,
      verifiedAt: args.syncedAt,
      extractionMethod: `${args.provider.kind}_metadata_sync`,
      verification: "verified",
      validFrom: args.item.modifiedAt,
    },
  });

  const specialtyId = await ensureSpecialtyNode(args.specialty);
  const specialtyEdge: OntologyEdge = {
    id: ontologyEdgeId({ type: "applies_to_specialty", fromId: nodeId, toId: specialtyId, discriminator: "drive-registry" }),
    type: "applies_to_specialty",
    fromId: nodeId,
    toId: specialtyId,
    reviewState: "approved",
    confidence: 1,
    evidenceIds: [metadataEvidenceId],
    attributes: { basis: "drive_source_registry" },
  };
  await upsertOntologyEdge(specialtyEdge);

  if (args.parentOntologyNodeId) {
    const parentEdge: OntologyEdge = {
      id: ontologyEdgeId({ type: "related_to", fromId: nodeId, toId: args.parentOntologyNodeId, discriminator: "archive-child-of" }),
      type: "related_to",
      fromId: nodeId,
      toId: args.parentOntologyNodeId,
      reviewState: "approved",
      confidence: 1,
      evidenceIds: [metadataEvidenceId],
      attributes: { archiveRelation: "child_of" },
    };
    await upsertOntologyEdge(parentEdge);
  }

  return nodeId;
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
    const rootNodeId = await persistArchiveItem({
      item: rootMetadata,
      specialty: source.specialty,
      sourceRegistryId: source.id,
      provider: args.provider,
      syncedAt,
    });
    artifacts += 1;
    if (rootMetadata.isFolder) folders += 1;
    else files += 1;

    const queue: Array<{ folderId: string; parentOntologyNodeId: string; depth: number }> = [{ folderId: source.folder_id, parentOntologyNodeId: rootNodeId, depth: 0 }];
    let sawExpectedEntry = false;

    while (queue.length && artifacts < maxItems) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      const children = await args.provider.listChildren(current.folderId, { specialty: source.specialty, sourceRegistryId: source.id });
      for (const item of children) {
        if (artifacts >= maxItems) { truncated = true; break; }
        if (current.depth === 0 && item.name === source.expected_entry && !item.isFolder) sawExpectedEntry = true;
        const nodeId = await persistArchiveItem({
          item,
          specialty: source.specialty,
          sourceRegistryId: source.id,
          provider: args.provider,
          parentOntologyNodeId: current.parentOntologyNodeId,
          syncedAt,
        });
        artifacts += 1;
        if (item.isFolder) {
          folders += 1;
          queue.push({ folderId: item.id, parentOntologyNodeId: nodeId, depth: current.depth + 1 });
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
