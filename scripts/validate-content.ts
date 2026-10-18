import { loadGoldenSet, validationReport } from "@/server/ingestion/goldenset";
try { console.log(JSON.stringify(validationReport(await loadGoldenSet()), null, 2)); }
catch (error) { console.error(error instanceof Error ? error.message : "Content validation failed"); process.exitCode = 1; }
