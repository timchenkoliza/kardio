import { asc, and, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { distributionPostCandidates } from "@/db/ontology-schema";
import { eventReferenceCandidates, eventReferenceMentions } from "@/db/resolution-schema";
import { diagnosticEventReferenceKey, inspectEventReferenceShape } from "@/server/ingestion/event-identity-shape";

const sampleLimit = Math.max(1, Math.min(25, Number(process.env.EVENT_IDENTITY_SAMPLE_LIMIT ?? 10) || 10));

function increment(map: Map<string, number>, key: string | null): void {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function top(map: Map<string, number>, limit = 20): Array<{ value: string; count: number }> {
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

function timestampMillis(instant: string | null, local: string | null): number | null {
  if (instant) {
    const value = Date.parse(instant);
    return Number.isFinite(value) ? value : null;
  }
  if (!local) return null;
  // This is used only for elapsed-span diagnostics. Appending Z avoids depending
  // on the machine timezone; it does not assert that the source-local time is UTC.
  const normalized = local.includes("T") ? `${local}Z` : `${local.replace(" ", "T")}Z`;
  const value = Date.parse(normalized);
  return Number.isFinite(value) ? value : null;
}

try {
  const candidates = await db
    .select({
      id: eventReferenceCandidates.id,
      url: eventReferenceCandidates.normalizedUrl,
    })
    .from(eventReferenceCandidates)
    .where(eq(eventReferenceCandidates.reviewState, "observed"))
    .orderBy(asc(eventReferenceCandidates.normalizedUrl));

  const mentions = await db
    .select({
      eventCandidateId: eventReferenceMentions.eventCandidateId,
      distributionCandidateId: eventReferenceMentions.distributionCandidateId,
      publishedAtInstant: distributionPostCandidates.publishedAtInstant,
      publishedAtLocal: distributionPostCandidates.publishedAtLocal,
    })
    .from(eventReferenceMentions)
    .innerJoin(
      distributionPostCandidates,
      eq(distributionPostCandidates.id, eventReferenceMentions.distributionCandidateId),
    )
    .where(and(
      eq(eventReferenceMentions.sourcePresence, "present"),
      eq(distributionPostCandidates.sourcePresence, "present"),
    ));

  const mentionsByCandidate = new Map<string, typeof mentions>();
  for (const mention of mentions) {
    const bucket = mentionsByCandidate.get(mention.eventCandidateId) ?? [];
    bucket.push(mention);
    mentionsByCandidate.set(mention.eventCandidateId, bucket);
  }

  const shapes = candidates.flatMap((candidate) => {
    const shape = inspectEventReferenceShape(candidate.url);
    return shape ? [{ ...candidate, shape }] : [];
  });

  const structuralGroups = new Map<string, Array<{ id: string; url: string }>>();
  for (const candidate of candidates) {
    const key = diagnosticEventReferenceKey(candidate.url);
    if (!key) continue;
    const bucket = structuralGroups.get(key) ?? [];
    bucket.push(candidate);
    structuralGroups.set(key, bucket);
  }
  const collisionGroups = [...structuralGroups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const structuralKeySet = new Set(structuralGroups.keys());
  const pathDepthCounts = new Map<string, number>();
  const rootSegments = new Map<string, number>();
  const leafSegments = new Map<string, number>();
  let candidatesWithQuery = 0;
  let candidatesWithYearToken = 0;
  let structuralParentMatches = 0;

  for (const candidate of shapes) {
    increment(pathDepthCounts, String(candidate.shape.pathDepth));
    increment(rootSegments, candidate.shape.rootSegment);
    increment(leafSegments, candidate.shape.leafSegment);
    if (candidate.shape.hasQuery) candidatesWithQuery += 1;
    if (candidate.shape.yearTokens.length > 0) candidatesWithYearToken += 1;
    if (candidate.shape.parentUrl && structuralKeySet.has(candidate.shape.parentUrl)) structuralParentMatches += 1;
  }

  const spanRows = shapes.map((candidate) => {
    const rows = mentionsByCandidate.get(candidate.id) ?? [];
    const times = rows
      .map((row) => timestampMillis(row.publishedAtInstant, row.publishedAtLocal))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const first = times[0] ?? null;
    const last = times.at(-1) ?? null;
    const spanDays = first !== null && last !== null ? (last - first) / 86_400_000 : null;
    return {
      id: candidate.id,
      url: candidate.url,
      pathDepth: candidate.shape.pathDepth,
      rootSegment: candidate.shape.rootSegment,
      leafSegment: candidate.shape.leafSegment,
      parentUrl: candidate.shape.parentUrl,
      parentCandidateObserved: candidate.shape.parentUrl ? structuralKeySet.has(candidate.shape.parentUrl) : false,
      yearTokens: candidate.shape.yearTokens,
      mentionCount: rows.length,
      postCount: new Set(rows.map((row) => row.distributionCandidateId)).size,
      mentionSpanDaysApprox: spanDays === null ? null : Math.round(spanDays * 10) / 10,
    };
  });

  const longestSpanSamples = spanRows
    .filter((row) => row.mentionSpanDaysApprox !== null)
    .sort((a, b) => (b.mentionSpanDaysApprox ?? 0) - (a.mentionSpanDaysApprox ?? 0) || b.mentionCount - a.mentionCount)
    .slice(0, sampleLimit);

  const parentChildSamples = spanRows
    .filter((row) => row.parentCandidateObserved)
    .sort((a, b) => b.pathDepth - a.pathDepth || b.mentionCount - a.mentionCount)
    .slice(0, sampleLimit);

  const candidatesInCollisionGroups = collisionGroups.reduce((sum, [, rows]) => sum + rows.length, 0);

  console.log(JSON.stringify({
    mode: "read_only_event_identity_shape_inspection",
    observedEventCandidates: candidates.length,
    parsedReferenceShapes: shapes.length,
    diagnosticDistinctStructuralKeys: structuralGroups.size,
    diagnosticCollisionGroups: collisionGroups.length,
    candidatesInCollisionGroups,
    candidatesWithQuery,
    candidatesWithYearToken,
    structuralParentMatches,
    pathDepthCounts: Object.fromEntries([...pathDepthCounts.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
    rootGroupCount: rootSegments.size,
    topRootSegments: top(rootSegments, 20),
    topLeafSegments: top(leafSegments, 25),
    mentionSpanOver30Days: spanRows.filter((row) => (row.mentionSpanDaysApprox ?? 0) > 30).length,
    mentionSpanOver180Days: spanRows.filter((row) => (row.mentionSpanDaysApprox ?? 0) > 180).length,
    mentionSpanOver365Days: spanRows.filter((row) => (row.mentionSpanDaysApprox ?? 0) > 365).length,
    collisionSamples: collisionGroups.slice(0, sampleLimit).map(([diagnosticStructuralKey, rows]) => ({
      diagnosticStructuralKey,
      urls: rows.map((row) => row.url),
      candidateIds: rows.map((row) => row.id),
    })),
    parentChildSamples,
    longestSpanSamples,
    ontologyWrites: 0,
    stagingWrites: 0,
  }, null, 2));
} finally {
  await pool.end();
}
