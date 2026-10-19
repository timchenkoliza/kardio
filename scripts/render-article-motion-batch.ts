import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GoogleDriveApiProvider } from "@/server/ingestion/google-drive-api";
import { YandexDiskApiProvider } from "@/server/ingestion/yandex-disk-api";
import { articleMotionRendererFromEnv } from "@/server/media/article-motion-renderer";
import type { ArticleMotionRenderEntry, ArticleMotionSourceProvider } from "@/lib/ui/article-motion-media";

interface RenderManifest {
  version: 1;
  purpose: string;
  entries: ArticleMotionRenderEntry[];
}

const manifestPath = join(process.cwd(), "data/article-motion-render-manifest.json");

function sourceProvider(kind: ArticleMotionSourceProvider) {
  if (kind === "google_drive_api") {
    const token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim();
    if (!token) throw new Error("GOOGLE_DRIVE_ACCESS_TOKEN is required for queued cardiology media");
    return new GoogleDriveApiProvider(token);
  }
  const token = process.env.YANDEX_DISK_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("YANDEX_DISK_ACCESS_TOKEN is required for queued oncology media");
  return new YandexDiskApiProvider(token);
}

async function persist(manifest: RenderManifest): Promise<void> {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RenderManifest;
  const renderer = articleMotionRendererFromEnv();
  const maxJobs = process.env.ARTICLE_MOTION_RENDER_MAX_JOBS ? Number(process.env.ARTICLE_MOTION_RENDER_MAX_JOBS) : 10;
  const queued = manifest.entries.filter(entry => entry.status === "queued").slice(0, maxJobs);
  let ready = 0;
  let failed = 0;

  for (const entry of queued) {
    const index = manifest.entries.findIndex(candidate => candidate.specialty === entry.specialty && candidate.content_id === entry.content_id);
    if (index < 0) continue;

    manifest.entries[index] = { ...entry, status: "rendering", error: null, updated_at: new Date().toISOString() };
    await persist(manifest);

    try {
      const provider = sourceProvider(entry.source_provider);
      const sourcePath = await provider.materializeBinary(entry.source_item_id);
      const result = await renderer.render(entry, sourcePath);
      manifest.entries[index] = {
        ...entry,
        status: "ready",
        output_url: result.outputUrl,
        width: result.width,
        height: result.height,
        provenance_note: result.provenanceNote ?? entry.provenance_note,
        error: null,
        updated_at: new Date().toISOString(),
      };
      ready += 1;
    } catch (error) {
      manifest.entries[index] = {
        ...entry,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown render error",
        updated_at: new Date().toISOString(),
      };
      failed += 1;
    }
    await persist(manifest);
  }

  console.log(JSON.stringify({
    mode: "render_article_motion_batch",
    requested: queued.length,
    ready,
    failed,
    remainingQueued: manifest.entries.filter(entry => entry.status === "queued").length,
    manifestPath,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Article motion batch render failed");
  process.exitCode = 1;
}
