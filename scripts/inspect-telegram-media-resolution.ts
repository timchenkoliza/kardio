import { asc, eq } from "drizzle-orm";
import { pool, db } from "@/db/client";
import { distributionPostCandidateMedia, rawArchiveArtifacts } from "@/db/ontology-schema";
import { resolveTelegramMediaReference } from "@/server/ingestion/telegram-media-resolution";

try {
  const sourceRegistryId = process.env.MEDIA_RESOLUTION_SOURCE ?? "cardiology-channel-01";
  const mediaRows = await db
    .select({
      candidateId: distributionPostCandidateMedia.candidateId,
      sourceRegistryId: distributionPostCandidateMedia.sourceRegistryId,
      ordinal: distributionPostCandidateMedia.ordinal,
      href: distributionPostCandidateMedia.href,
      kind: distributionPostCandidateMedia.kind,
    })
    .from(distributionPostCandidateMedia)
    .where(eq(distributionPostCandidateMedia.sourceRegistryId, sourceRegistryId))
    .orderBy(asc(distributionPostCandidateMedia.candidateId), asc(distributionPostCandidateMedia.ordinal));

  const artifacts = await db
    .select({
      id: rawArchiveArtifacts.id,
      providerItemId: rawArchiveArtifacts.providerItemId,
      parentProviderItemId: rawArchiveArtifacts.parentProviderItemId,
      sourceRegistryId: rawArchiveArtifacts.sourceRegistryId,
      name: rawArchiveArtifacts.name,
      mimeType: rawArchiveArtifacts.mimeType,
      promotedNodeId: rawArchiveArtifacts.promotedNodeId,
    })
    .from(rawArchiveArtifacts)
    .where(eq(rawArchiveArtifacts.sourceRegistryId, sourceRegistryId));

  const resolved = mediaRows.map(row => resolveTelegramMediaReference(row, artifacts));
  const count = (predicate: (row: (typeof resolved)[number]) => boolean) => resolved.reduce((sum, row) => sum + (predicate(row) ? 1 : 0), 0);
  const byKind = Object.fromEntries([...new Set(resolved.map(row => row.kind))].sort().map(kind => [kind, count(row => row.kind === kind)]));
  const byRole = Object.fromEntries([...new Set(resolved.map(row => row.semanticRole))].sort().map(role => [role, count(row => row.semanticRole === role)]));
  const byResolution = Object.fromEntries([...new Set(resolved.map(row => row.transportResolution))].sort().map(status => [status, count(row => row.transportResolution === status)]));

  console.log(JSON.stringify({
    mode: "read_only_telegram_media_resolution",
    sourceRegistryId,
    mediaReferences: mediaRows.length,
    rawArchiveArtifacts: artifacts.length,
    resolvedTransport: count(row => row.transportResolution === "resolved"),
    productEligible: 0,
    rightsUnknown: resolved.length,
    byKind,
    byRole,
    byResolution,
    unresolvedExamples: resolved
      .filter(row => row.transportResolution !== "resolved")
      .slice(0, 12)
      .map(row => ({ href: row.href, kind: row.kind, resolution: row.transportResolution })),
    ontologyWrites: 0,
    stagingWrites: 0,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Telegram media resolution inspection failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
