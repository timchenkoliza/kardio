import { pool } from "@/db/client";
import { googleDriveProviderFromEnv } from "@/server/ingestion/google-drive-api";
import { syncDriveRawArchiveInventory } from "@/server/ingestion/drive-sync";

try {
  const provider = googleDriveProviderFromEnv();
  const maxDepth = process.env.GOOGLE_DRIVE_SYNC_MAX_DEPTH ? Number(process.env.GOOGLE_DRIVE_SYNC_MAX_DEPTH) : undefined;
  const maxItems = process.env.GOOGLE_DRIVE_SYNC_MAX_ITEMS ? Number(process.env.GOOGLE_DRIVE_SYNC_MAX_ITEMS) : undefined;
  const report = await syncDriveRawArchiveInventory({ provider, maxDepth, maxItems });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Drive inventory sync failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
