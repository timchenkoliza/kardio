import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import renderManifestJson from "@/data/article-motion-render-manifest.json";

export type ArticleMotionRenderStatus = "queued" | "rendering" | "ready" | "failed" | "blocked";
export type ArticleMotionSourceProvider = "google_drive_api" | "yandex_disk_api";

export interface ArticleMotionRenderEntry {
  content_id: string;
  specialty: SpecialtyId;
  status: ArticleMotionRenderStatus;
  source_provider: ArticleMotionSourceProvider;
  source_collection_id: string;
  source_item_id: string;
  source_filename: string;
  source_mime_type: string;
  source_image_url: string | null;
  source_image_ref: string;
  output_url: string | null;
  output_format: "gif";
  width: number | null;
  height: number | null;
  prompt_version: string;
  prompt: string;
  provenance_note: string;
  error: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface ArticleMotionRenderManifest {
  version: number;
  entries: ArticleMotionRenderEntry[];
}

const renderManifest = renderManifestJson as ArticleMotionRenderManifest;

export function readyArticleMotionForContent(
  content: Pick<ContentObject, "id" | "specialty">,
): ArticleMotionRenderEntry | null {
  return renderManifest.entries.find(entry =>
    entry.content_id === content.id
    && entry.specialty === content.specialty
    && entry.status === "ready"
    && Boolean(entry.output_url),
  ) ?? null;
}

export function shouldQueueArticleMotion(
  content: Pick<ContentObject, "asset">,
  hasGenericFallback: boolean,
): boolean {
  return !content.asset?.url && hasGenericFallback;
}

function compactSourceContext(content: Pick<ContentObject, "title" | "summary" | "topics" | "tags" | "kind">): string {
  const topics = content.topics.slice(0, 4).join(", ");
  const tags = content.tags.slice(0, 6).join(", ");
  return [
    `Тип материала: ${content.kind}.`,
    `Заголовок: ${content.title}.`,
    content.summary ? `Краткое содержание: ${content.summary}` : "",
    topics ? `Темы: ${topics}.` : "",
    tags ? `Теги: ${tags}.` : "",
  ].filter(Boolean).join(" ");
}

/**
 * The renderer must be image-to-image-to-motion, not text-only generation.
 * The source article image is the visual anchor. The prompt deliberately forbids
 * adding anatomy, pathology, devices, labels or diagnostic findings that are not
 * visibly present in the source image or explicitly supported by article context.
 */
export function buildArticleMotionPrompt(
  content: Pick<ContentObject, "title" | "summary" | "topics" | "tags" | "kind">,
): string {
  return [
    "Create a short seamless looping 16:9 GIF for a professional physician content card using the supplied original article image as the mandatory visual source.",
    "Preserve the source image identity, composition, clinically meaningful structures, devices and findings. Do not replace it with generic medical stock imagery.",
    "Add only restrained motion that is plausible for the existing image: subtle camera drift, parallax, pulse, scan sweep, cine-like motion or focus transition when appropriate.",
    "Do not invent new anatomy, pathology, procedures, measurements, text labels, patient identifiers, logos, captions or diagnostic conclusions.",
    "If the source is a chart, document or static scientific figure, animate emphasis and depth only; do not alter values or claims.",
    "No text, no watermark, no UI chrome. Keep the center readable and the loop calm enough for repeated feed viewing.",
    compactSourceContext(content),
  ].join(" ");
}
