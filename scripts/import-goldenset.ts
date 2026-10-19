import { pool } from "@/db/client";
import { importGoldenSet } from "@/server/ingestion/import";
try { console.log(JSON.stringify(await importGoldenSet(), null, 2)); }
catch (error) { console.error(error instanceof Error ? error.message : "Import failed"); process.exitCode = 1; }
finally { await pool.end(); }
