import { pool } from "@/db/client";
import { syncEventReferenceTransportGroups } from "@/server/ingestion/event-reference-transport-sync";

try {
  const report = await syncEventReferenceTransportGroups();
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Event reference transport grouping failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
