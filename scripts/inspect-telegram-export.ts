import { loadDriveSourceRegistry } from "@/server/ingestion/drive-source";
import { googleDriveProviderFromEnv } from "@/server/ingestion/google-drive-api";
import { LocalDriveMirrorProvider } from "@/server/ingestion/local-drive-mirror";
import { parseTelegramDesktopHtml } from "@/server/ingestion/telegram-html";

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

const children = await provider.listChildren(source.folder_id, { specialty: source.specialty, sourceRegistryId: source.id });
const entry = children.find((item) => !item.isFolder && item.name === source.expected_entry);
if (!entry) {
  throw new Error(`${source.id}: ${source.expected_entry} is not present at export root`);
}

const html = await provider.readText(entry.id);
const posts = parseTelegramDesktopHtml(html, { sourceRegistryId: source.id, specialty: source.specialty });
const actualPosts = posts.filter((post) => post.kind === "post");
const services = posts.length - actualPosts.length;
const withText = actualPosts.filter((post) => post.text.length > 0).length;
const withMedia = actualPosts.filter((post) => post.media.length > 0).length;
const linkCount = actualPosts.reduce((sum, post) => sum + post.links.length, 0);
const mediaCount = actualPosts.reduce((sum, post) => sum + post.media.length, 0);
const hashtagCount = new Set(actualPosts.flatMap((post) => post.hashtags)).size;
const sampleLimit = Math.max(0, Math.min(20, Number(process.env.TELEGRAM_INSPECT_LIMIT ?? 5) || 5));

console.log(JSON.stringify({
  provider: provider.kind,
  sourceRegistryId: source.id,
  specialty: source.specialty,
  entry: { id: entry.id, name: entry.name, size: entry.size, modifiedAt: entry.modifiedAt },
  parsedMessages: posts.length,
  posts: actualPosts.length,
  serviceMessages: services,
  postsWithText: withText,
  postsWithMedia: withMedia,
  links: linkCount,
  mediaRefs: mediaCount,
  uniqueHashtags: hashtagCount,
  samples: actualPosts.slice(0, sampleLimit).map((post) => ({
    stableId: post.stableId,
    publishedAt: post.publishedAt,
    authorName: post.authorName,
    excerpt: post.text.slice(0, 180),
    hashtags: post.hashtags,
    links: post.links.slice(0, 3).map((link) => link.href),
    media: post.media.slice(0, 3),
    rawFragmentSha256: post.rawFragmentSha256,
  })),
}, null, 2));
