import { pool } from "@/db/client";

const limit = Math.max(1, Math.min(25, Number(process.env.EVENT_CONTEXT_INSPECT_LIMIT ?? 10) || 10));
const sampleMentionsPerEvent = Math.max(1, Math.min(5, Number(process.env.EVENT_CONTEXT_MENTIONS_PER_EVENT ?? 3) || 3));

function excerpt(value: string, max = 320): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}…`;
}

interface StatsRow {
  mention_rows: string;
  distribution_posts_referenced: string;
  candidates_with_mentions: string;
  mentions_with_link_label: string;
  candidates_with_link_label: string;
  mentions_with_hashtags: string;
}

interface SampleEventRow {
  id: string;
  normalized_url: string;
  mention_count: string;
  post_count: string;
}

interface MentionRow {
  distribution_candidate_id: string;
  published_at_instant: string | null;
  published_at_local: string | null;
  published_at_raw: string | null;
  body_text: string;
  hashtags: string[];
  link_label: string | null;
  observed_href: string;
}

try {
  const observedCountResult = await pool.query<{ value: string }>(`
    select count(*)::text as value
    from event_reference_candidates
    where review_state = 'observed'
  `);

  const statsResult = await pool.query<StatsRow>(`
    with present as (
      select
        e.id as event_id,
        m.id as mention_id,
        d.id as distribution_id,
        l.label as link_label,
        d.hashtags as hashtags
      from event_reference_candidates e
      join event_reference_mentions m on m.event_candidate_id = e.id
      join distribution_post_candidates d on d.id = m.distribution_candidate_id
      left join distribution_post_candidate_links l
        on l.candidate_id = m.distribution_candidate_id
       and l.ordinal = m.link_ordinal
      where e.review_state = 'observed'
        and m.source_presence = 'present'
        and d.source_presence = 'present'
    )
    select
      count(*)::text as mention_rows,
      count(distinct distribution_id)::text as distribution_posts_referenced,
      count(distinct event_id)::text as candidates_with_mentions,
      count(*) filter (where nullif(btrim(coalesce(link_label, '')), '') is not null)::text as mentions_with_link_label,
      count(distinct event_id) filter (where nullif(btrim(coalesce(link_label, '')), '') is not null)::text as candidates_with_link_label,
      count(*) filter (where jsonb_array_length(hashtags) > 0)::text as mentions_with_hashtags
    from present
  `);

  const multiResult = await pool.query<{ value: string }>(`
    select count(*)::text as value
    from (
      select e.id
      from event_reference_candidates e
      join event_reference_mentions m on m.event_candidate_id = e.id
      join distribution_post_candidates d on d.id = m.distribution_candidate_id
      where e.review_state = 'observed'
        and m.source_presence = 'present'
        and d.source_presence = 'present'
      group by e.id
      having count(*) > 1
    ) multi
  `);

  const sampleEvents = await pool.query<SampleEventRow>(`
    select
      e.id,
      e.normalized_url,
      count(m.id)::text as mention_count,
      count(distinct d.id)::text as post_count
    from event_reference_candidates e
    join event_reference_mentions m on m.event_candidate_id = e.id
    join distribution_post_candidates d on d.id = m.distribution_candidate_id
    where e.review_state = 'observed'
      and m.source_presence = 'present'
      and d.source_presence = 'present'
    group by e.id, e.normalized_url
    order by count(m.id) desc, e.normalized_url asc
    limit $1
  `, [limit]);

  const samples: Array<Record<string, unknown>> = [];
  for (const event of sampleEvents.rows) {
    const mentions = await pool.query<MentionRow>(`
      select
        d.id as distribution_candidate_id,
        d.published_at_instant::text,
        d.published_at_local::text,
        d.published_at_raw,
        d.body_text,
        d.hashtags,
        l.label as link_label,
        m.observed_href
      from event_reference_mentions m
      join distribution_post_candidates d on d.id = m.distribution_candidate_id
      left join distribution_post_candidate_links l
        on l.candidate_id = m.distribution_candidate_id
       and l.ordinal = m.link_ordinal
      where m.event_candidate_id = $1
        and m.source_presence = 'present'
        and d.source_presence = 'present'
      order by d.message_id asc, m.link_ordinal asc
      limit $2
    `, [event.id, sampleMentionsPerEvent]);

    samples.push({
      eventCandidateId: event.id,
      normalizedUrl: event.normalized_url,
      mentionCount: Number(event.mention_count),
      postCount: Number(event.post_count),
      mentions: mentions.rows.map((row) => ({
        distributionCandidateId: row.distribution_candidate_id,
        publishedAtInstant: row.published_at_instant,
        publishedAtLocal: row.published_at_local,
        publishedAtRaw: row.published_at_raw,
        linkLabel: row.link_label,
        observedHref: row.observed_href,
        hashtags: row.hashtags,
        excerpt: excerpt(row.body_text),
      })),
    });
  }

  const stats = statsResult.rows[0];
  console.log(JSON.stringify({
    mode: "read_only_event_mention_context_inspection",
    observedEventCandidates: Number(observedCountResult.rows[0]?.value ?? 0),
    candidatesWithMentions: Number(stats?.candidates_with_mentions ?? 0),
    candidatesWithMultipleMentions: Number(multiResult.rows[0]?.value ?? 0),
    mentionRows: Number(stats?.mention_rows ?? 0),
    distributionPostsReferenced: Number(stats?.distribution_posts_referenced ?? 0),
    mentionsWithLinkLabel: Number(stats?.mentions_with_link_label ?? 0),
    candidatesWithLinkLabel: Number(stats?.candidates_with_link_label ?? 0),
    mentionsWithHashtags: Number(stats?.mentions_with_hashtags ?? 0),
    requestedEventSampleLimit: limit,
    sampleMentionsPerEvent,
    samples,
    ontologyWrites: 0,
    stagingWrites: 0,
  }, null, 2));
} finally {
  await pool.end();
}
