import { pool } from "@/db/client";
import { inspectEventReferenceShape } from "@/server/ingestion/event-identity-shape";
import { diagnoseEventReferenceRole, type DiagnosticEventRole } from "@/server/ingestion/event-role-signals";

const sampleLimit = Math.max(1, Math.min(25, Number(process.env.EVENT_ROLE_SAMPLE_LIMIT ?? 10) || 10));

interface GroupRow {
  id: string;
  canonical_reference_url: string;
  member_count: string;
  mention_count: string;
  post_count: string;
  first_local: string | null;
  last_local: string | null;
  first_instant: string | null;
  last_instant: string | null;
}

function spanDays(row: GroupRow): number | null {
  const pair = row.first_local && row.last_local
    ? [row.first_local, row.last_local]
    : row.first_instant && row.last_instant
      ? [row.first_instant, row.last_instant]
      : null;
  if (!pair) return null;
  const normalize = (value: string) => value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const start = Date.parse(normalize(pair[0]));
  const end = Date.parse(normalize(pair[1]));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round(((end - start) / 86_400_000) * 10) / 10;
}

try {
  const result = await pool.query<GroupRow>(`
    select
      g.id,
      g.canonical_reference_url,
      count(distinct m.event_candidate_id)::text as member_count,
      (count(distinct em.id) filter (where em.source_presence = 'present'))::text as mention_count,
      (count(distinct em.distribution_candidate_id) filter (where em.source_presence = 'present'))::text as post_count,
      (min(p.published_at_local) filter (where em.source_presence = 'present'))::text as first_local,
      (max(p.published_at_local) filter (where em.source_presence = 'present'))::text as last_local,
      (min(p.published_at_instant) filter (where em.source_presence = 'present'))::text as first_instant,
      (max(p.published_at_instant) filter (where em.source_presence = 'present'))::text as last_instant
    from event_reference_transport_groups g
    join event_reference_transport_members m on m.transport_group_id = g.id
    left join event_reference_mentions em on em.event_candidate_id = m.event_candidate_id
    left join distribution_post_candidates p on p.id = em.distribution_candidate_id
    group by g.id, g.canonical_reference_url
    order by g.canonical_reference_url
  `);

  const canonicalUrls = new Set(result.rows.map((row) => row.canonical_reference_url));
  const roleCounts: Record<DiagnosticEventRole, number> = {
    page_surface_like: 0,
    occurrence_like: 0,
    series_like: 0,
    unresolved: 0,
  };

  const samples: Record<DiagnosticEventRole, Array<Record<string, unknown>>> = {
    page_surface_like: [],
    occurrence_like: [],
    series_like: [],
    unresolved: [],
  };

  const rootFamilies = new Map<string, {
    transportGroups: number;
    yearBearingGroups: number;
    pageSurfaceGroups: number;
    occurrenceLikeGroups: number;
    seriesLikeGroups: number;
    unresolvedGroups: number;
  }>();

  let groupsWithObservedParent = 0;
  let pageSurfaceWithObservedParent = 0;
  let groupsWithYearToken = 0;
  let groupsWithMultipleMembers = 0;
  let mentionSpanOver180Days = 0;

  for (const row of result.rows) {
    const shape = inspectEventReferenceShape(row.canonical_reference_url);
    const mentionSpanDaysApprox = spanDays(row);
    const diagnosis = diagnoseEventReferenceRole({
      canonicalReferenceUrl: row.canonical_reference_url,
      mentionSpanDaysApprox,
    });
    roleCounts[diagnosis.role] += 1;

    const hasObservedParent = Boolean(shape?.parentUrl && canonicalUrls.has(shape.parentUrl));
    if (hasObservedParent) groupsWithObservedParent += 1;
    if (diagnosis.role === "page_surface_like" && hasObservedParent) pageSurfaceWithObservedParent += 1;
    if ((shape?.yearTokens.length ?? 0) > 0) groupsWithYearToken += 1;
    if (Number(row.member_count) > 1) groupsWithMultipleMembers += 1;
    if (mentionSpanDaysApprox !== null && mentionSpanDaysApprox >= 180) mentionSpanOver180Days += 1;

    if (shape?.rootSegment) {
      const family = rootFamilies.get(shape.rootSegment) ?? {
        transportGroups: 0,
        yearBearingGroups: 0,
        pageSurfaceGroups: 0,
        occurrenceLikeGroups: 0,
        seriesLikeGroups: 0,
        unresolvedGroups: 0,
      };
      family.transportGroups += 1;
      if (shape.yearTokens.length > 0) family.yearBearingGroups += 1;
      if (diagnosis.role === "page_surface_like") family.pageSurfaceGroups += 1;
      if (diagnosis.role === "occurrence_like") family.occurrenceLikeGroups += 1;
      if (diagnosis.role === "series_like") family.seriesLikeGroups += 1;
      if (diagnosis.role === "unresolved") family.unresolvedGroups += 1;
      rootFamilies.set(shape.rootSegment, family);
    }

    if (samples[diagnosis.role].length < sampleLimit) {
      samples[diagnosis.role].push({
        transportGroupId: row.id,
        canonicalReferenceUrl: row.canonical_reference_url,
        memberCount: Number(row.member_count),
        mentionCount: Number(row.mention_count),
        postCount: Number(row.post_count),
        mentionSpanDaysApprox,
        pathDepth: shape?.pathDepth ?? null,
        rootSegment: shape?.rootSegment ?? null,
        leafSegment: shape?.leafSegment ?? null,
        yearTokens: shape?.yearTokens ?? [],
        parentUrl: shape?.parentUrl ?? null,
        parentTransportGroupObserved: hasObservedParent,
        diagnosticRole: diagnosis.role,
        evidence: diagnosis.evidence,
      });
    }
  }

  const rootFamilySamples = [...rootFamilies.entries()]
    .filter(([, value]) => value.transportGroups >= 2)
    .sort((a, b) => b[1].transportGroups - a[1].transportGroups || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([rootSegment, value]) => ({ rootSegment, ...value }));

  const rootFamiliesWithMultipleYearBearingGroups = [...rootFamilies.values()]
    .filter((value) => value.yearBearingGroups >= 2).length;

  console.log(JSON.stringify({
    mode: "read_only_event_semantic_role_inspection",
    transportGroups: result.rows.length,
    groupsWithMultipleTransportMembers: groupsWithMultipleMembers,
    groupsWithObservedParent,
    groupsWithYearToken,
    mentionSpanOver180Days,
    diagnosticRoleCounts: roleCounts,
    pageSurfaceWithObservedParent,
    rootFamilyCount: rootFamilies.size,
    rootFamiliesWithMultipleYearBearingGroups,
    rootFamilySamples,
    sampleLimitPerRole: sampleLimit,
    samples,
    ontologyWrites: 0,
    stagingWrites: 0,
  }, null, 2));
} finally {
  await pool.end();
}
