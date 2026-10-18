import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  distributionPostCandidateLinks,
  distributionPostCandidateMedia,
  distributionPostCandidates,
  rawArchiveArtifacts,
} from "@/db/ontology-schema";
import type { RawArchiveProvider, TelegramExportRegistryEntry } from "@/server/ingestion/drive-source";
import {
  candidateTimestampColumns,
  reviewStateAfterSourceChange,
} from "@/server/ingestion/distribution-candidate-policy";
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
  missingAfterSync: number;
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
    .select({
      id: distributionPostCandidates.id,
      hash: distributionPostCandidates.rawFragmentSha256,
      reviewState: distributionPostCandidates.reviewState,
    })
    .from(distributionPostCandidates)
    .where(eq(distributionPostCandidates.sourceRegistryId, args.source.id));
  const existingById = new Map(existing.map((row) => [row.id, row]));

  let inserted = 0;
  let changed = 0;
  let unchanged = 0;
  for (const post of posts) {
    const previous = existingById.get(post.stableId);
    if (!previous) inserted += 1;
    else if (previous.hash === post.rawFragmentSha256) unchanged += 1;
    else changed += 1;
  }

  const now = new Date().toISOString();
  const currentIds = posts.map((post) => post.stableId);
  const currentIdSet = new Set(currentIds);
  const missingAfterSync = existing.reduce((count, row) => count + (currentIdSet.has(row.id) ? 0 : 1), 0);

  await db.transaction(async (tx) => {
    // Never hard-delete disappeared source records. Mark them missing so source
    // removal and later reappearance remain observable without polluting ontology.
    await tx.update(distributionPostCandidates).set({
      sourcePresence: "missing",
      updatedAt: now,
    }).where(eq(distributionPostCandidates.sourceRegistryId, args.source.id));

    const rows = posts.map((post) => {
      const timestampColumns = candidateTimestampColumns(post);
      return {
        id: post.stableId,
        sourceRegistryId: post.sourceRegistryId,
        specialty: post.specialty,
        messageId: post.messageId,
        sourceArtifactId: sourceArtifact.id,
        ...timestampColumns,
        publishedAtRaw: post.publishedAtRaw,
        publishedAtBasis: post.publishedAtBasis,
        authorDisplayName: post.authorName,
        bodyText: post.text,
        hashtags: [...post.hashtags],
        rawFragmentSha256: post.rawFragmentSha256,
        sourcePresence: "present" as const,
        lastSeenAt: now,
        updatedAt: now,
      };
    });

    for (const batch of chunks(rows)) {
      await tx.insert(distributionPostCandidates).values(batch).onConflictDoNothing();
      for (const row of batch) {
        const previous = existingById.get(row.id);
        const sourceChanged = previous !== undefined && previous.hash !== row.rawFragmentSha256;
        const nextReviewState = reviewStateAfterSourceChange({
          previous: previous?.reviewState ?? null,
          sourceChanged,
        });
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
          sourcePresence: "present",
          lastSeenAt: now,
          updatedAt: now,
          ...(nextReviewState ? { reviewState: nextReviewState } : {}),
        }).where(eq(distributionPostCandidates.id, row.id));
      }
    }

    // Replace derived link/media snapshots only for posts present in this export.
    // Missing posts keep their last observed children for audit/review purposes.
    for (const idBatch of chunks(currentIds)) {
      if (!idBatch.length) continue;
      await tx.delete(distributionPostCandidateLinks).where(inArray(distributionPostCandidateLinks.candidateId, idBatch));
      await tx.delete(distributionPostCandidateMedia).where(inArray(distributionPostCandidateMedia.candidateId, idBatch));
    }

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
    missingAfterSync,
    links: posts.reduce((sum, post) => sum + post.links.length, 0),
    mediaRefs: posts.reduce((sum, post) => sum + post.media.length, 0),
    ontologyWrites: 0,
  };
}
