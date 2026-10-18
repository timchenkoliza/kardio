import { pool } from "@/db/client";
import { importGoldenSetOntology } from "@/server/ingestion/ontology-import";

try {
  console.log(JSON.stringify(await importGoldenSetOntology(), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Ontology import failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
