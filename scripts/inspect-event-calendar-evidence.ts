import { pool } from "@/db/client";
import { inspectEventReferenceShape } from "@/server/ingestion/event-identity-shape";
import { diagnoseEventReferenceRole, type DiagnosticEventRole } from "@/server/ingestion/event-role-signals";
import {
  extractEventCalendarSignals,
  isExplicitDateSignal,
  type EventCalendarSignal,
} from "@/server/ingestion/event-calendar-signals";

const sampleLimit = Math.max(1, Math.min(25, Number(process.env.EVENT_CALENDAR_SAMPLE_LIMIT ?? 10) || 10));

interface MentionRow {
  transport_group_id: string;
  canonical_reference_url: string;
  event_candidate_id: string;
  mention_id: string;
  distribution_candidate_id: string;
  link_label: string | null;
  body_text: string;
  published_at_local: string | null;
  published_at_instant: string | null;
}

interface GroupEvidence {
  id: string;
  url: string;
  rows: MentionRow[];
}

function parseTimestamp(value: string): number | null {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function mentionSpanDays(rows: readonly MentionRow[]): number | null {
  const local = rows.flatMap((row) => row.published_at_local ? [parseTimestamp(row.published_at_local)] : []).filter((value): value is number => value !== null);
  const instant = rows.flatMap((row) => row.published_at_instant ? [parseTimestamp(row.published_at_instant)] : []).filter((value): value is number => value !== null);
  const values = local.length > 0 ? local : instant;
  if (values.length === 0) return null;
  return Math.round(((Math.max(...values) - Math.min(...values)) / 86_400_000) * 10) / 10;
}

function dayMonthSignature(signal: EventCalendarSignal): string | null {
  if (!isExplicitDateSignal(signal)) return null;
  if (signal.kind === "date_range") {
    const match = signal.normalizedKey.match(/^range:(?:20\d{2}|\?)-(\d{2})-(\d{2})-(\d{2})$/);
    return match ? `range:${match[1]}-${match[2]}-${match[3]}` : signal.normalizedKey;
  }
  const match = signal.normalizedKey.match(/^date:(?:20\d{2}|\?)-(\d{2})-(\d{2})$/);
  return match ? `date:${match[1]}-${match[2]}` : signal.normalizedKey;
}

function explicitYear(signal: EventCalendarSignal): string | null {
  if (signal.kind === "year") return signal.normalizedKey.slice("year:".length);
  const match = signal.normalizedKey.match(/^(?:date|range):(20\d{2})-/);
  return match?.[1] ?? null;
}

function compactSignal(signal: EventCalendarSignal, source: "body" | "label", postId: string): Record<string, unknown> {
  return {
    source,
    postId,
    kind: signal.kind,
    raw: signal.raw,
    normalizedKey: signal.normalizedKey,
  };
}

try {
  const result = await pool.query<MentionRow>(`
    select
      g.id as transport_group_id,
      g.canonical_reference_url,
      tm.event_candidate_id,
      em.id as mention_id,
      em.distribution_candidate_id,
      l.label as link_label,
      p.body_text,
      p.published_at_local::text,
      p.published_at_instant::text
    from event_reference_transport_groups g
    join event_reference_transport_members tm on tm.transport_group_id = g.id
    join event_reference_mentions em
      on em.event_candidate_id = tm.event_candidate_id
      and em.source_presence = 'present'
    join distribution_post_candidates p on p.id = em.distribution_candidate_id
    left join distribution_post_candidate_links l
      on l.candidate_id = em.distribution_candidate_id
      and l.ordinal = em.link_ordinal
    order by g.canonical_reference_url, em.distribution_candidate_id, em.link_ordinal
  `);

  const groups = new Map<string, GroupEvidence>();
  for (const row of result.rows) {
    const group = groups.get(row.transport_group_id) ?? {
      id: row.transport_group_id,
      url: row.canonical_reference_url,
      rows: [],
    };
    group.rows.push(row);
    groups.set(row.transport_group_id, group);
  }

  const canonicalUrls = new Set([...groups.values()].map((group) => group.url));
  const roleCounts: Record<DiagnosticEventRole, number> = {
    page_surface_like: 0,
    occurrence_like: 0,
    series_like: 0,
    unresolved: 0,
  };

  let groupsWithAnyDateExpression = 0;
  let groupsWithDateExpressionInLabel = 0;
  let groupsWithDateExpressionInBody = 0;
  let groupsWithMultipleDistinctDayMonthSignatures = 0;
  let groupsWithMultipleDistinctExplicitYears = 0;
  let groupsWithRelativeDayCue = 0;
  let unresolvedWithAnyDateExpression = 0;
  let unresolvedWithSingleDayMonthSignature = 0;
  let unresolvedWithMultipleDayMonthSignatures = 0;
  let unresolvedWithExplicitYearSignal = 0;
  let unresolvedWithoutDateExpression = 0;
  let occurrenceLikeWithMultipleDayMonthSignatures = 0;
  let seriesLikeWithMultipleDayMonthSignatures = 0;

  const unresolvedSingleDateSamples: Array<Record<string, unknown>> = [];
  const unresolvedMultipleDateSamples: Array<Record<string, unknown>> = [];
  const unresolvedNoDateSamples: Array<Record<string, unknown>> = [];
  const observedParentNonSurfaceSamples: Array<Record<string, unknown>> = [];

  for (const group of groups.values()) {
    const span = mentionSpanDays(group.rows);
    const diagnosis = diagnoseEventReferenceRole({ canonicalReferenceUrl: group.url, mentionSpanDaysApprox: span });
    roleCounts[diagnosis.role] += 1;
    const shape = inspectEventReferenceShape(group.url);
    const hasObservedParent = Boolean(shape?.parentUrl && canonicalUrls.has(shape.parentUrl));

    const dayMonthSignatures = new Set<string>();
    const explicitYears = new Set<string>();
    const examples: Array<Record<string, unknown>> = [];
    let labelHasDate = false;
    let bodyHasDate = false;
    let hasRelativeDay = false;

    for (const row of group.rows) {
      const bodySignals = extractEventCalendarSignals(row.body_text);
      const labelSignals = extractEventCalendarSignals(row.link_label ?? "");
      if (bodySignals.some(isExplicitDateSignal)) bodyHasDate = true;
      if (labelSignals.some(isExplicitDateSignal)) labelHasDate = true;
      if ([...bodySignals, ...labelSignals].some((signal) => signal.kind === "relative_day")) hasRelativeDay = true;

      for (const [source, signals] of [["body", bodySignals], ["label", labelSignals]] as const) {
        for (const signal of signals) {
          const signature = dayMonthSignature(signal);
          if (signature) dayMonthSignatures.add(signature);
          const year = explicitYear(signal);
          if (year) explicitYears.add(year);
          if (examples.length < 8 && (isExplicitDateSignal(signal) || signal.kind === "relative_day" || signal.kind === "year")) {
            examples.push(compactSignal(signal, source, row.distribution_candidate_id));
          }
        }
      }
    }

    const hasDate = dayMonthSignatures.size > 0;
    if (hasDate) groupsWithAnyDateExpression += 1;
    if (labelHasDate) groupsWithDateExpressionInLabel += 1;
    if (bodyHasDate) groupsWithDateExpressionInBody += 1;
    if (dayMonthSignatures.size >= 2) groupsWithMultipleDistinctDayMonthSignatures += 1;
    if (explicitYears.size >= 2) groupsWithMultipleDistinctExplicitYears += 1;
    if (hasRelativeDay) groupsWithRelativeDayCue += 1;

    if (diagnosis.role === "unresolved") {
      if (hasDate) unresolvedWithAnyDateExpression += 1;
      else unresolvedWithoutDateExpression += 1;
      if (dayMonthSignatures.size === 1) unresolvedWithSingleDayMonthSignature += 1;
      if (dayMonthSignatures.size >= 2) unresolvedWithMultipleDayMonthSignatures += 1;
      if (explicitYears.size > 0) unresolvedWithExplicitYearSignal += 1;

      const sample = {
        transportGroupId: group.id,
        canonicalReferenceUrl: group.url,
        mentionCount: group.rows.length,
        postCount: new Set(group.rows.map((row) => row.distribution_candidate_id)).size,
        mentionSpanDaysApprox: span,
        dayMonthSignatures: [...dayMonthSignatures].sort(),
        explicitYears: [...explicitYears].sort(),
        examples,
      };
      if (dayMonthSignatures.size === 1 && unresolvedSingleDateSamples.length < sampleLimit) unresolvedSingleDateSamples.push(sample);
      if (dayMonthSignatures.size >= 2 && unresolvedMultipleDateSamples.length < sampleLimit) unresolvedMultipleDateSamples.push(sample);
      if (dayMonthSignatures.size === 0 && unresolvedNoDateSamples.length < sampleLimit) unresolvedNoDateSamples.push(sample);
    }

    if (diagnosis.role === "occurrence_like" && dayMonthSignatures.size >= 2) occurrenceLikeWithMultipleDayMonthSignatures += 1;
    if (diagnosis.role === "series_like" && dayMonthSignatures.size >= 2) seriesLikeWithMultipleDayMonthSignatures += 1;

    if (hasObservedParent && diagnosis.role !== "page_surface_like" && observedParentNonSurfaceSamples.length < sampleLimit) {
      observedParentNonSurfaceSamples.push({
        transportGroupId: group.id,
        canonicalReferenceUrl: group.url,
        parentUrl: shape?.parentUrl ?? null,
        leafSegment: shape?.leafSegment ?? null,
        diagnosticRole: diagnosis.role,
        dayMonthSignatures: [...dayMonthSignatures].sort(),
        mentionSpanDaysApprox: span,
      });
    }
  }

  console.log(JSON.stringify({
    mode: "read_only_event_calendar_evidence_inspection",
    transportGroups: groups.size,
    mentionRows: result.rows.length,
    diagnosticRoleCounts: roleCounts,
    groupsWithAnyDateExpression,
    groupsWithDateExpressionInLabel,
    groupsWithDateExpressionInBody,
    groupsWithMultipleDistinctDayMonthSignatures,
    groupsWithMultipleDistinctExplicitYears,
    groupsWithRelativeDayCue,
    unresolvedWithAnyDateExpression,
    unresolvedWithSingleDayMonthSignature,
    unresolvedWithMultipleDayMonthSignatures,
    unresolvedWithExplicitYearSignal,
    unresolvedWithoutDateExpression,
    occurrenceLikeWithMultipleDayMonthSignatures,
    seriesLikeWithMultipleDayMonthSignatures,
    sampleLimit,
    observedParentNonSurfaceSamples,
    unresolvedSingleDateSamples,
    unresolvedMultipleDateSamples,
    unresolvedNoDateSamples,
    ontologyWrites: 0,
    stagingWrites: 0,
  }, null, 2));
} finally {
  await pool.end();
}
