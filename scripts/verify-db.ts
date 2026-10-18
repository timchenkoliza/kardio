import { pool } from "@/db/client";

interface CheckResult {
  name: string;
  actual: number;
  expected?: number;
  minimum?: number;
  ok: boolean;
}

async function scalar(sql: string, params: unknown[] = []): Promise<number> {
  const result = await pool.query<{ value: string }>(sql, params);
  return Number(result.rows[0]?.value ?? 0);
}

try {
  const checks: CheckResult[] = [];
  const exact = async (name: string, table: string, expected: number) => {
    const actual = await scalar(`select count(*)::text as value from ${table}`);
    checks.push({ name, actual, expected, ok: actual === expected });
  };

  await exact("datasets", "datasets", 1);
  await exact("canonical sources", "sources", 18);
  await exact("canonical content", "content_objects", 54);
  await exact("evaluation slice", "evaluation_items", 24);
  await exact("ontology nodes", "ontology_nodes", 131);
  await exact("ontology edges", "ontology_edges", 504);
  await exact("evidence records", "evidence_records", 634);
  await exact("state facts", "node_state_facts", 257);

  const oncologyLegacyContent = await scalar(
    "select count(*)::text as value from content_objects where specialty = $1",
    ["oncology"],
  );
  checks.push({ name: "legacy oncology fallback content", actual: oncologyLegacyContent, expected: 0, ok: oncologyLegacyContent === 0 });

  const duplicateArchiveItems = await scalar(`
    select count(*)::text as value
    from (
      select provider, provider_item_id
      from raw_archive_artifacts
      group by provider, provider_item_id
      having count(*) > 1
    ) duplicates
  `);
  checks.push({ name: "duplicate raw archive identities", actual: duplicateArchiveItems, expected: 0, ok: duplicateArchiveItems === 0 });

  const prematurelyPromotedArchiveItems = await scalar(`
    select count(*)::text as value
    from raw_archive_artifacts
    where promoted_node_id is not null
  `);
  checks.push({
    name: "raw archive items promoted before parser/review",
    actual: prematurelyPromotedArchiveItems,
    expected: 0,
    ok: prematurelyPromotedArchiveItems === 0,
  });

  const duplicateDistributionCandidates = await scalar(`
    select count(*)::text as value
    from (
      select source_registry_id, message_id
      from distribution_post_candidates
      group by source_registry_id, message_id
      having count(*) > 1
    ) duplicates
  `);
  checks.push({
    name: "duplicate distribution candidate identities",
    actual: duplicateDistributionCandidates,
    expected: 0,
    ok: duplicateDistributionCandidates === 0,
  });

  const candidateSourceArtifactOrphans = await scalar(`
    select count(*)::text as value
    from distribution_post_candidates c
    left join raw_archive_artifacts a on a.id = c.source_artifact_id
    where a.id is null
  `);
  checks.push({
    name: "distribution candidates without raw source artifact",
    actual: candidateSourceArtifactOrphans,
    expected: 0,
    ok: candidateSourceArtifactOrphans === 0,
  });

  const duplicateEventReferenceCandidates = await scalar(`
    select count(*)::text as value
    from (
      select normalized_url
      from event_reference_candidates
      group by normalized_url
      having count(*) > 1
    ) duplicates
  `);
  checks.push({
    name: "duplicate event reference normalized URLs",
    actual: duplicateEventReferenceCandidates,
    expected: 0,
    ok: duplicateEventReferenceCandidates === 0,
  });

  const eventReferenceMentionOrphans = await scalar(`
    select count(*)::text as value
    from event_reference_mentions m
    left join distribution_post_candidates p on p.id = m.distribution_candidate_id
    left join event_reference_candidates e on e.id = m.event_candidate_id
    where p.id is null or e.id is null
  `);
  checks.push({
    name: "event reference mentions with missing staging parents",
    actual: eventReferenceMentionOrphans,
    expected: 0,
    ok: eventReferenceMentionOrphans === 0,
  });

  const prematurelyPromotedEventReferences = await scalar(`
    select count(*)::text as value
    from event_reference_candidates
    where promoted_node_id is not null
  `);
  checks.push({
    name: "event references promoted before review",
    actual: prematurelyPromotedEventReferences,
    expected: 0,
    ok: prematurelyPromotedEventReferences === 0,
  });

  const report = {
    ok: checks.every((check) => check.ok),
    checks,
    rawArchiveArtifacts: await scalar("select count(*)::text as value from raw_archive_artifacts"),
    distributionCandidates: await scalar("select count(*)::text as value from distribution_post_candidates"),
    distributionCandidatesPresent: await scalar("select count(*)::text as value from distribution_post_candidates where source_presence = 'present'"),
    distributionCandidatesMissing: await scalar("select count(*)::text as value from distribution_post_candidates where source_presence = 'missing'"),
    distributionCandidateLinks: await scalar("select count(*)::text as value from distribution_post_candidate_links"),
    distributionCandidateMedia: await scalar("select count(*)::text as value from distribution_post_candidate_media"),
    distributionCandidatesPromoted: await scalar("select count(*)::text as value from distribution_post_candidates where promoted_node_id is not null"),
    eventReferenceCandidates: await scalar("select count(*)::text as value from event_reference_candidates"),
    eventReferenceMentionsPresent: await scalar("select count(*)::text as value from event_reference_mentions where source_presence = 'present'"),
    eventReferenceMentionsMissing: await scalar("select count(*)::text as value from event_reference_mentions where source_presence = 'missing'"),
    eventReferenceCandidatesPromoted: await scalar("select count(*)::text as value from event_reference_candidates where promoted_node_id is not null"),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database verification failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
