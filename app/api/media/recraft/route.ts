import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ArticleContext, RecraftInput } from "@/lib/recraft/contract";
import { getRequestAccessStateFromRequest } from "@/server/access/request-access";
import { runRecraft } from "@/server/recraft/pipeline";
import { recraftProviders } from "@/server/recraft/providers";
import { getContent } from "@/server/repositories/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BASE64 = 8 * 1024 * 1024;

const bodySchema = z.object({
  contentId: z.string().min(1).max(300),
  usage: z.enum(["article_card", "hero", "digest"]).default("article_card"),
  source: z.object({
    id: z.string().min(1).max(200),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    base64: z.string().min(16).max(MAX_BASE64),
    credit: z.string().max(300).nullable(),
    caption: z.string().max(2000).nullable(),
  }).strict(),
}).strict();

/** Editorial-only: runs Clinical Visual Recraft for one article ↔ source image pair. */
export async function POST(request: NextRequest) {
  const access = getRequestAccessStateFromRequest(request);
  if (access.subject.role !== "editorial" && access.subject.role !== "admin") {
    return NextResponse.json({ ok: false, error: "editorial_only" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  const { contentId, usage, source } = parsed.data;
  const content = await getContent("cardiology", contentId);
  if (!content) return NextResponse.json({ ok: false, error: "content_not_found" }, { status: 404 });

  const article: ArticleContext = {
    contentId: content.id,
    title: content.title,
    caption: source.caption?.trim() || null,
    clinicalSubject: content.topics.join(", ") || null,
    clinicalJob: content.kind,
    excerpt: content.summary || null,
    contentPassport: null,
  };
  const input: RecraftInput = {
    source: { id: source.id, mimeType: source.mimeType, base64: source.base64, role: "clinical_source_of_truth", credit: source.credit },
    article,
    target: { format: "2:1", usage, specialty: "cardiology" },
  };
  const result = await runRecraft(input, recraftProviders());
  return NextResponse.json({ ok: true, result });
}
