import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, contentObjects, contentRelationships, datasets, evaluationItems, sourceObservations, sources } from "@/db/schema";
import type { ContentObject } from "@/lib/domain/types";
import { DATASET_ID, loadGoldenSet, normalizeGoldenSet, validationReport, type LoadedGoldenSet } from "./goldenset";

function contentFields(content: ContentObject): Omit<ContentObject, "source" | "asset"> {
  const copy = { ...content } as Partial<ContentObject>;
  delete copy.source;
  delete copy.asset;
  return copy as Omit<ContentObject, "source" | "asset">;
}

export async function importGoldenSet(loaded?: LoadedGoldenSet) {
  const resolved = loaded ?? await loadGoldenSet();
  const normalized = normalizeGoldenSet(resolved);
  await db.transaction(async (tx) => {
    // Serialize concurrent importers; import never touches user state.
    await tx.execute("SELECT pg_advisory_xact_lock(247013843)");
    const datasetRow = {
      id: DATASET_ID, specialty: "cardiology" as const, checksum: resolved.checksum, raw: resolved.dataset,
      manifest: resolved.manifest, enrichment: resolved.enrichment, evaluationManifest: resolved.evaluation,
    };
    await tx.insert(datasets).values(datasetRow).onConflictDoUpdate({ target: datasets.id, set: datasetRow });
    for (const source of normalized.sources) {
      const row = { ...source, raw: resolved.dataset.sources.find((item) => item.source_id === source.id)! };
      await tx.insert(sources).values(row).onConflictDoUpdate({ target: [sources.specialty, sources.id], set: row });
    }
    for (const content of normalized.content) {
      const row = { ...contentFields(content), datasetId: DATASET_ID, raw: resolved.dataset.content.find((item) => item.golden_id === content.id)! };
      await tx.insert(contentObjects).values(row).onConflictDoUpdate({ target: [contentObjects.specialty, contentObjects.id], set: row });
    }
    await tx.delete(contentRelationships).where(eq(contentRelationships.specialty, "cardiology"));
    for (const content of normalized.content) {
      for (const [type, toId] of [["parent", content.parentId], ["supersedes", content.supersedesId], ["superseded_by", content.supersededById]] as const) {
        if (toId) await tx.insert(contentRelationships).values({ specialty: "cardiology", fromId: content.id, toId, type });
      }
      if (content.asset) {
        const row = { ...content.asset, specialty: "cardiology" as const, contentId: content.id, raw: resolved.enrichment.mappings[content.id] };
        await tx.insert(assets).values(row).onConflictDoUpdate({ target: [assets.specialty, assets.id], set: row });
      }
    }
    await tx.delete(evaluationItems).where(eq(evaluationItems.datasetId, DATASET_ID));
    await tx.insert(evaluationItems).values(resolved.evaluation.golden_ids.map((contentId, position) => ({ datasetId: DATASET_ID, specialty: "cardiology" as const, contentId, position })));
    for (const observation of resolved.observations) {
      const row = { id: observation.id as string, specialty: "cardiology" as const, raw: observation };
      await tx.insert(sourceObservations).values(row).onConflictDoUpdate({ target: [sourceObservations.specialty, sourceObservations.id], set: row });
    }
  });
  return validationReport(resolved);
}
