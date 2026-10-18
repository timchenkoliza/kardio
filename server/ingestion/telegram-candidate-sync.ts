import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  distributionPostCandidateLinks,
  distributionPostCandidateMedia,
  distributionPostCandidates,
  rawArchiveArtifacts,
} from "@/db/ontology-schema";
import type { RawArchiveProvider, TelegramExportRegistryEntry } from "@/server/ingestion/drive-source";
import { parseTelegramDesktopHtml } from "@/server/ingestion/telegram-html";

const CHUNK_SIZE = 500;

function chunks<T>(items: readonly T[], size = CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export interface TelegramCandidateSyncReport {
  sourceRegistryId: string;
  specialty: TelegramExportRegistryEntry["specialty"];
  sourceArtifactId: string;
  parsedMessages: number;
  candidates: number;
  inserted: number;
  changed: number;
  unchanged: number;
  links: number;
  mediaRefs: number;
  ontologyWrites: 0;
}

export async function syncTelegramDistributionCandidates(args: {
  provider: RawArchiveProvider;
  source: TelegramExportRegistryEntry;
}): Promise<TelegramCandidateSyncReport> {
  const children = await args.provider.listChildren(args.source.folder_id, {
    specialty: args.source.specialty,
    sourceRegistryId: args.source.id,
  });
  const entry = children.find((item) => !item.isFolder && item.name === args.source.expected_entry);
  if (!entry) throw new Error(`${args.source.id}: ${args.source.expected_entry} is not present at export root`);

  const [sourceArtifact] = await db
    .select({ id: rawArchiveArtifacts.id })
    .from(rawArchiveArtifacts)
    .where(and(
      eq(rawArchiveArtifacts.provider, args.provider.kind),
      eq(rawArchiveArtifacts.providerItemId, entry.id),
    ))
    .limit(1);
  if (!sourceArtifact) {
    throw new Error(`${args.source.id}: raw archive inventory is missing for ${entry.id}; run db:drive-sync before candidate sync`);
  }

  const html = await args.provider.readText(entry.id);
  const parsed = parseTelegramDesktopHtml(html, {
    sourceRegistryId: args.source.id,
    specialty: args.source.specialty,
  });
  const posts = parsed.filter((post) => post.kind === "post");

  const existing = await db
    .select({ id: distributionPostCandidates.id, hash: distributionPostCandidates.rawFragmentSha256 })
    .from(distributionPostCandidates)
    .where(eq(distributionPostCandidates.sourceRegistryId, args.source.id));
  const existingHashes = new Map(existing.map((row) => [row.id, row.hash]));

  let inserted = 0;
  let changed = 0;
  let unchanged = 0;
  for (const post of posts) {
    const previousHash = existingHashes.get(post.stableId);
    if (previousHash === undefined) inserted += 1;
    else if (previousHash === post.rawFragmentSha256) unchanged += 1;
    else changed += 1;
  }

  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    const rows = posts.map((post) => ({
      id: post.stableId,
      sourceRegistryId: post.sourceRegistryId,
      specialty: post.specialty,
      messageId: post.messageId,
      sourceArtifactId: sourceArtifact.id,
      publishedAtInstant: post.publishedAtBasis === "offset_explicit" ? post.publishedAt : null,
      publishedAtLocal: post.publishedAtBasis === "source_local" ? post.publishedAt : null,
      publishedAtRaw: post.publishedAtRaw,
      publishedAtBasis: post.publishedAtBasis,
      authorDisplayName: post.authorName,
      bodyText: post.text,
      hashtags: [...post.hashtags],
      rawFragmentSha256: post.rawFragmentSha256,
      updatedAt: now,
    }));

    for (const batch of chunks(rows)) {
      await tx.insert(distributionPostCandidates).values(batch).onConflictDoNothing();
      // Re-parsing updates source-derived fields but intentionally preserves
      // reviewState/promotedNodeId so editorial decisions are never reset.
      for (const row of batch) {
        await tx.update(distributionPostCandidates).set({
          sourceArtifactId: row.sourceArtifactId,
          specialty: row.specialty,
          messageId: row.messageId,
          publishedAtInstant: row.publishedAtInstant,
          publishedAtLocal: row.publishedAtLocal,
          publishedAtRaw: row.publishedAtRaw,
          publishedAtBasis: row.publishedAtBasis,
          authorDisplayName: row.authorDisplayName,
          bodyText: row.bodyText,
          hashtags: row.hashtags,
          rawFragmentSha256: row.rawFragmentSha256,
          updatedAt: now,
        }).where(eq(distributionPostCandidates.id, row.id));
      }
    }

    await tx.delete(distributionPostCandidateLinks)
      .where(eq(distributionPostCandidateLinks.sourceRegistryId, args.source.id));
    await tx.delete(distributionPostCandidateMedia)
      .where(eq(distributionPostCandidateMedia.sourceRegistryId, args.source.id));

    const linkRows = posts.flatMap((post) => post.links.map((link, ordinal) => ({
      candidateId: post.stableId,
      sourceRegistryId: post.sourceRegistryId,
      ordinal,
      href: link.href,
      label: link.label,
      kind: link.kind,
    })));
    const mediaRows = posts.flatMap((post) => post.media.map((media, ordinal) => ({
      candidateId: post.stableId,
      sourceRegistryId: post.sourceRegistryId,
      ordinal,
      href: media.href,
      kind: media.kind,
    })));

    for (const batch of chunks(linkRows)) if (batch.length) await tx.insert(distributionPostCandidateLinks).values(batch);
    for (const batch of chunks(mediaRows)) if (batch.length) await tx.insert(distributionPostCandidateMedia).values(batch);
  });

  return {
    sourceRegistryId: args.source.id,
    specialty: args.source.specialty,
    sourceArtifactId: sourceArtifact.id,
    parsedMessages: parsed.length,
    candidates: posts.length,
    inserted,
    changed,
    unchanged,
    links: posts.reduce((sum, post) => sum + post.links.length, 0),
    mediaRefs: posts.reduce((sum, post) => sum + post.media.length, 0),
    ontologyWrites: 0,
  };
}
