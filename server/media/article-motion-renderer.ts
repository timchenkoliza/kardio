import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ArticleMotionRenderEntry } from "@/lib/ui/article-motion-media";

const responseSchema = z.object({
  output_url: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  provenance_note: z.string().min(1).optional(),
}).strict();

export interface ArticleMotionRendererResult {
  outputUrl: string;
  width: number;
  height: number;
  provenanceNote: string | null;
}

export class ArticleMotionRendererClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | null,
  ) {
    if (!baseUrl.trim()) throw new Error("ARTICLE_MOTION_RENDERER_URL is required");
  }

  async render(entry: ArticleMotionRenderEntry, sourcePath: string): Promise<ArticleMotionRendererResult> {
    const bytes = await readFile(sourcePath);
    const response = await fetch(`${this.baseUrl.replace(/\/$/u, "")}/v1/render`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        content_id: entry.content_id,
        specialty: entry.specialty,
        prompt_version: entry.prompt_version,
        prompt: entry.prompt,
        source: {
          filename: entry.source_filename,
          mime_type: entry.source_mime_type,
          data_base64: bytes.toString("base64"),
        },
        output: {
          format: "gif",
          aspect_ratio: "16:9",
          width: 960,
          height: 540,
          duration_seconds: 4,
          loop: true,
          motion_strength: "subtle",
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Article motion renderer ${response.status}: ${body.slice(0, 500)}`);
    }

    const payload = responseSchema.parse(await response.json());
    return {
      outputUrl: payload.output_url,
      width: payload.width,
      height: payload.height,
      provenanceNote: payload.provenance_note ?? null,
    };
  }
}

export function articleMotionRendererFromEnv(): ArticleMotionRendererClient {
  const url = process.env.ARTICLE_MOTION_RENDERER_URL;
  if (!url) throw new Error("ARTICLE_MOTION_RENDERER_URL is required for article motion rendering");
  return new ArticleMotionRendererClient(url, process.env.ARTICLE_MOTION_RENDERER_TOKEN?.trim() || null);
}
