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
  const minimum = async (name: string, table: string, min: number) => {
    const actual = await scalar(`select count(*)::text as value from ${table}`);
    checks.push({ name, actual, minimum: min, ok: actual >= min });
  };

  await exact("datasets", "datasets", 1);
  await exact("canonical sources", "sources", 18);
  await exact("canonical content", "content_objects", 54);
  await exact("evaluation slice", "evaluation_items", 24);
  await minimum("ontology nodes", "ontology_nodes", 131);
  await minimum("ontology edges", "ontology_edges", 504);
  await minimum("evidence records", "evidence_records", 634);
  await minimum("state facts", "node_state_facts", 257);

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

  const report = {
    ok: checks.every((check) => check.ok),
    checks,
    rawArchiveArtifacts: await scalar("select count(*)::text as value from raw_archive_artifacts"),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database verification failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
