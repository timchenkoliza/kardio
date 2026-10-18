import { pool } from "@/db/client";
import { loadDriveSourceRegistry } from "@/server/ingestion/drive-source";
import { googleDriveProviderFromEnv } from "@/server/ingestion/google-drive-api";
import { LocalDriveMirrorProvider } from "@/server/ingestion/local-drive-mirror";
import { syncDriveRawArchiveInventory } from "@/server/ingestion/drive-sync";

try {
  const mode = process.env.GOOGLE_DRIVE_PROVIDER ?? "google_drive_api";
  const provider = mode === "local_mirror"
    ? new LocalDriveMirrorProvider(
        process.env.GOOGLE_DRIVE_LOCAL_MIRROR ?? (() => { throw new Error("GOOGLE_DRIVE_LOCAL_MIRROR is required for local_mirror mode"); })(),
        await loadDriveSourceRegistry(),
      )
    : googleDriveProviderFromEnv();

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
