import { pool } from "@/db/client";
import { loadDriveSourceRegistry } from "@/server/ingestion/drive-source";
import { googleDriveProviderFromEnv } from "@/server/ingestion/google-drive-api";
import { LocalDriveMirrorProvider } from "@/server/ingestion/local-drive-mirror";
import { syncTelegramDistributionCandidates } from "@/server/ingestion/telegram-candidate-sync";

try {
  const registry = await loadDriveSourceRegistry();
  const sourceId = process.env.TELEGRAM_SOURCE_ID ?? "cardiology_channel_01";
  const source = registry.telegram_exports.find((entry) => entry.id === sourceId);
  if (!source) throw new Error(`Unknown TELEGRAM_SOURCE_ID ${sourceId}`);

  const mode = process.env.GOOGLE_DRIVE_PROVIDER ?? "google_drive_api";
  const provider = mode === "local_mirror"
    ? new LocalDriveMirrorProvider(
        process.env.GOOGLE_DRIVE_LOCAL_MIRROR ?? (() => { throw new Error("GOOGLE_DRIVE_LOCAL_MIRROR is required for local_mirror mode"); })(),
        registry,
      )
    : googleDriveProviderFromEnv();

  const report = await syncTelegramDistributionCandidates({ provider, source });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Telegram candidate sync failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
