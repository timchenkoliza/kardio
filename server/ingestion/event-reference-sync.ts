import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { distributionPostCandidateLinks, distributionPostCandidates } from "@/db/ontology-schema";
import { eventReferenceCandidates, eventReferenceMentions } from "@/db/resolution-schema";
import { eventReferenceMentionId, resolveExplicitScardioEventReference } from "@/server/ingestion/event-reference-resolution";

export interface EventReferenceSyncReport {
  sourceRegistryId: string;
  externalLinksScanned: number;
  resolvableMentions: number;
  uniqueEventCandidates: number;
  insertedCandidates: number;
  existingCandidates: number;
  insertedMentions: number;
  existingMentions: number;
  missingMentionsAfterSync: number;
  ontologyWrites: 0;
}

export async function syncExplicitEventReferenceCandidates(sourceRegistryId: string): Promise<EventReferenceSyncReport> {
  const linkRows = await db
    .select({
      distributionCandidateId: distributionPostCandidates.id,
      sourceRegistryId: distributionPostCandidates.sourceRegistryId,
      linkOrdinal: distributionPostCandidateLinks.ordinal,
      href: distributionPostCandidateLinks.href,
    })
    .from(distributionPostCandidates)
    .innerJoin(
      distributionPostCandidateLinks,
      eq(distributionPostCandidateLinks.candidateId, distributionPostCandidates.id),
    )
    .where(and(
      eq(distributionPostCandidates.sourceRegistryId, sourceRegistryId),
      eq(distributionPostCandidates.sourcePresence, "present"),
      eq(distributionPostCandidateLinks.kind, "external"),
    ));

  const resolved = linkRows.flatMap((row) => {
    const event = resolveExplicitScardioEventReference(row.href);
    return event ? [{ ...row, event }] : [];
  });

  const uniqueEvents = new Map(resolved.map((row) => [row.event.id, row.event]));
  const existingEvents = await db.select({ id: eventReferenceCandidates.id }).from(eventReferenceCandidates);
  const existingEventIds = new Set(existingEvents.map((row) => row.id));
  const existingMentions = await db
    .select({ id: eventReferenceMentions.id })
    .from(eventReferenceMentions)
    .where(eq(eventReferenceMentions.sourceRegistryId, sourceRegistryId));
  const existingMentionIds = new Set(existingMentions.map((row) => row.id));

  const now = new Date().toISOString();
  const currentMentionIds = new Set<string>();

  await db.transaction(async (tx) => {
    await tx.update(eventReferenceMentions).set({ sourcePresence: "missing" }).where(eq(eventReferenceMentions.sourceRegistryId, sourceRegistryId));

    for (const event of uniqueEvents.values()) {
      await tx.insert(eventReferenceCandidates).values({
        id: event.id,
        normalizedUrl: event.normalizedUrl,
        host: event.host,
        resolutionBasis: event.basis,
        lastObservedAt: now,
      }).onConflictDoUpdate({
        target: eventReferenceCandidates.id,
        set: { lastObservedAt: now },
      });
    }

    for (const row of resolved) {
      const id = eventReferenceMentionId({
        distributionCandidateId: row.distributionCandidateId,
        linkOrdinal: row.linkOrdinal,
        eventCandidateId: row.event.id,
      });
      currentMentionIds.add(id);
      await tx.insert(eventReferenceMentions).values({
        id,
        eventCandidateId: row.event.id,
        distributionCandidateId: row.distributionCandidateId,
        sourceRegistryId: row.sourceRegistryId,
        linkOrdinal: row.linkOrdinal,
        observedHref: row.href,
        sourcePresence: "present",
        lastSeenAt: now,
      }).onConflictDoUpdate({
        target: eventReferenceMentions.id,
        set: {
          observedHref: row.href,
          sourcePresence: "present",
          lastSeenAt: now,
        },
      });
    }
  });

  return {
    sourceRegistryId,
    externalLinksScanned: linkRows.length,
    resolvableMentions: resolved.length,
    uniqueEventCandidates: uniqueEvents.size,
    insertedCandidates: [...uniqueEvents.keys()].filter((id) => !existingEventIds.has(id)).length,
    existingCandidates: [...uniqueEvents.keys()].filter((id) => existingEventIds.has(id)).length,
    insertedMentions: [...currentMentionIds].filter((id) => !existingMentionIds.has(id)).length,
    existingMentions: [...currentMentionIds].filter((id) => existingMentionIds.has(id)).length,
    missingMentionsAfterSync: existingMentions.reduce((count, row) => count + (currentMentionIds.has(row.id) ? 0 : 1), 0),
    ontologyWrites: 0,
  };
}
