import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  eventReferenceCandidates,
  eventReferenceTransportGroups,
  eventReferenceTransportMembers,
} from "@/db/resolution-schema";
import { resolveEventReferenceTransportIdentity } from "@/server/ingestion/event-reference-transport";

export interface EventReferenceTransportSyncReport {
  eventReferenceCandidates: number;
  transportGroupsCurrent: number;
  insertedGroups: number;
  existingGroups: number;
  insertedMembers: number;
  unchangedMembers: number;
  movedMembers: number;
  unmappableCandidates: number;
  ontologyWrites: 0;
  stagingWrites: number;
}

export async function syncEventReferenceTransportGroups(): Promise<EventReferenceTransportSyncReport> {
  const candidates = await db
    .select({ id: eventReferenceCandidates.id, url: eventReferenceCandidates.normalizedUrl })
    .from(eventReferenceCandidates);

  const resolved = candidates.map((candidate) => ({
    candidate,
    identity: resolveEventReferenceTransportIdentity(candidate.url),
  }));
  const unmappableCandidates = resolved.filter((row) => row.identity === null).length;
  if (unmappableCandidates > 0) {
    throw new Error(`Cannot transport-normalize ${unmappableCandidates} event reference candidate(s)`);
  }

  const mapped = resolved.map((row) => ({
    candidate: row.candidate,
    identity: row.identity!,
  }));
  const uniqueGroups = new Map(mapped.map((row) => [row.identity.id, row.identity]));

  const existingGroups = await db
    .select({ id: eventReferenceTransportGroups.id })
    .from(eventReferenceTransportGroups);
  const existingGroupIds = new Set(existingGroups.map((row) => row.id));

  const existingMembers = await db
    .select({
      eventCandidateId: eventReferenceTransportMembers.eventCandidateId,
      transportGroupId: eventReferenceTransportMembers.transportGroupId,
    })
    .from(eventReferenceTransportMembers);
  const existingMemberByCandidate = new Map(
    existingMembers.map((row) => [row.eventCandidateId, row.transportGroupId]),
  );

  let insertedMembers = 0;
  let unchangedMembers = 0;
  let movedMembers = 0;
  for (const row of mapped) {
    const previousGroupId = existingMemberByCandidate.get(row.candidate.id);
    if (previousGroupId === undefined) insertedMembers += 1;
    else if (previousGroupId === row.identity.id) unchangedMembers += 1;
    else movedMembers += 1;
  }

  const insertedGroups = [...uniqueGroups.keys()].filter((id) => !existingGroupIds.has(id)).length;
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    for (const identity of uniqueGroups.values()) {
      if (existingGroupIds.has(identity.id)) continue;
      await tx.insert(eventReferenceTransportGroups).values({
        id: identity.id,
        canonicalReferenceUrl: identity.canonicalReferenceUrl,
        normalizationBasis: identity.basis,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
    }

    for (const row of mapped) {
      const previousGroupId = existingMemberByCandidate.get(row.candidate.id);
      if (previousGroupId === undefined) {
        await tx.insert(eventReferenceTransportMembers).values({
          eventCandidateId: row.candidate.id,
          transportGroupId: row.identity.id,
          mappedAt: now,
        }).onConflictDoNothing();
        continue;
      }
      if (previousGroupId !== row.identity.id) {
        await tx.update(eventReferenceTransportMembers).set({
          transportGroupId: row.identity.id,
          mappedAt: now,
        }).where(eq(eventReferenceTransportMembers.eventCandidateId, row.candidate.id));
      }
    }
  });

  return {
    eventReferenceCandidates: candidates.length,
    transportGroupsCurrent: uniqueGroups.size,
    insertedGroups,
    existingGroups: uniqueGroups.size - insertedGroups,
    insertedMembers,
    unchangedMembers,
    movedMembers,
    unmappableCandidates,
    ontologyWrites: 0,
    stagingWrites: insertedGroups + insertedMembers + movedMembers,
  };
}
