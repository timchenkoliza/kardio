import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, contentObjects, contentRelationships, datasets, evaluationItems, sourceObservations, sources } from "@/db/schema";
import { DATASET_ID, loadGoldenSet, normalizeGoldenSet, validationReport, type LoadedGoldenSet } from "./goldenset";

export async function importGoldenSet(loaded: LoadedGoldenSet = await loadGoldenSet()) {
  const normalized = normalizeGoldenSet(loaded);
  await db.transaction(async (tx) => {
    // Serialize concurrent importers; import never touches user state.
    await tx.execute("SELECT pg_advisory_xact_lock(247013843)");
    const datasetRow = {
      id: DATASET_ID, specialty: "cardiology" as const, checksum: loaded.checksum, raw: loaded.dataset,
      manifest: loaded.manifest, enrichment: loaded.enrichment, evaluationManifest: loaded.evaluation,
    };
    await tx.insert(datasets).values(datasetRow).onConflictDoUpdate({ target: datasets.id, set: datasetRow });
    for (const source of normalized.sources) {
      const row = { ...source, raw: loaded.dataset.sources.find((item) => item.source_id === source.id)! };
      await tx.insert(sources).values(row).onConflictDoUpdate({ target: [sources.specialty, sources.id], set: row });
    }
    for (const content of normalized.content) {
      const { source: _source, asset: _asset, ...fields } = content;
      const row = { ...fields, datasetId: DATASET_ID, raw: loaded.dataset.content.find((item) => item.golden_id === content.id)! };
      await tx.insert(contentObjects).values(row).onConflictDoUpdate({ target: [contentObjects.specialty, contentObjects.id], set: row });
    }
    await tx.delete(contentRelationships).where(eq(contentRelationships.specialty, "cardiology"));
    for (const content of normalized.content) {
      for (const [type, toId] of [["parent", content.parentId], ["supersedes", content.supersedesId], ["superseded_by", content.supersededById]] as const) {
        if (toId) await tx.insert(contentRelationships).values({ specialty: "cardiology", fromId: content.id, toId, type });
      }
      if (content.asset) {
        const row = { ...content.asset, specialty: "cardiology" as const, contentId: content.id, raw: loaded.enrichment.mappings[content.id] };
        await tx.insert(assets).values(row).onConflictDoUpdate({ target: [assets.specialty, assets.id], set: row });
      }
    }
    await tx.delete(evaluationItems).where(eq(evaluationItems.datasetId, DATASET_ID));
    await tx.insert(evaluationItems).values(loaded.evaluation.golden_ids.map((contentId, position) => ({ datasetId: DATASET_ID, specialty: "cardiology" as const, contentId, position })));
    for (const observation of loaded.observations) {
      const row = { id: observation.id as string, specialty: "cardiology" as const, raw: observation };
      await tx.insert(sourceObservations).values(row).onConflictDoUpdate({ target: [sourceObservations.specialty, sourceObservations.id], set: row });
    }
  });
  return validationReport(loaded);
}
