import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canUseAgentCapability } from "@/lib/access/agent-entitlements";
import type { SpecialtyId } from "@/lib/domain/types";
import { getRequestAccessStateFromRequest } from "@/server/access/request-access";
import { assertSameOriginRequest } from "@/server/agents/http";
import { MAX_UPLOAD_BYTES, parseUpload } from "@/server/agents/services/material";
import { failure, HttpError, json, rateLimit } from "@/server/http";
import { ingestContentStudioSource } from "@/server/pharma/source-ingestion";
import { contentStudioStore, contentStudioWorkspaceIdForSubject } from "@/server/pharma/store";
import { ensureSession, SESSION_COOKIE } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const packageId = z.string().regex(/^pkg-[a-f0-9-]{36}$/);
const httpUrl = z.string().trim().max(1200).refine(value => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch { return false; }
});
const fieldsSchema = z.object({
  specialty: z.enum(["cardiology", "oncology"]),
  packageId,
  sourceKind: z.enum(["partner_material", "external_reference"]),
  title: z.string().trim().max(240).optional(),
  url: z.union([httpUrl, z.literal("")]).transform(value => value || null),
});

function secureCookies(): boolean {
  return process.env.SESSION_SECURE === "false" ? false : process.env.NODE_ENV === "production";
}

function attachSessionCookie(response: NextResponse, sessionId: string) {
  response.cookies.set(SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: 180 * 24 * 60 * 60 });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginRequest(request, "multipart");
    const key = request.cookies.get(SESSION_COOKIE)?.value ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    rateLimit(`content-studio-source-upload:${key}`, 20);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_UPLOAD_BYTES + 128 * 1024) throw new HttpError(413, "Файл должен быть не больше 4 МБ.");

    const access = getRequestAccessStateFromRequest(request);
    const workspaceId = contentStudioWorkspaceIdForSubject(access.subject.id);
    if (!workspaceId || !canUseAgentCapability(access.policy, access.subject.id, "content_studio", "upload_source")) {
      throw new HttpError(403, "Нет доступа к загрузке источников Content Studio.");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new HttpError(400, "Выберите файл.");
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Файл должен быть не больше 4 МБ.");

    const fields = fieldsSchema.parse({
      specialty: form.get("specialty"),
      packageId: form.get("packageId"),
      sourceKind: form.get("sourceKind"),
      title: typeof form.get("title") === "string" && form.get("title") ? form.get("title") : undefined,
      url: typeof form.get("url") === "string" ? form.get("url") : "",
    });

    const session = await ensureSession(request.cookies.get(SESSION_COOKIE)?.value);
    const store = contentStudioStore();
    const current = await store.getPackage(session.id, fields.specialty as SpecialtyId, workspaceId, fields.packageId);
    if (!current) throw new HttpError(404, "Пакет публикации не найден.");
    if (current.status !== "draft") throw new HttpError(409, "Пакет уже передан на review и закрыт для новых источников.");

    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = parseUpload(file.name, file.type || "application/octet-stream", bytes);
    if (parsed.parseStatus === "rejected") throw new HttpError(422, parsed.parseNote ?? "Этот тип файла не принимается.");
    if (!parsed.text) throw new HttpError(422, parsed.parseNote ?? "Из этого файла пока нельзя извлечь текст для Claim Map.");

    const pkg = ingestContentStudioSource(current, {
      kind: fields.sourceKind,
      title: fields.title?.trim() || file.name,
      url: fields.url,
      text: parsed.text,
    });
    await store.savePackage(session.id, pkg);
    const notices = parsed.redactions.length ? ["В исходнике найдены персональные данные — перед Claim Map они были замаскированы."] : [];
    return attachSessionCookie(json({ ok: true, package: pkg, storage: store.kind, notices }, 201), session.id);
  } catch (error) {
    return failure(error);
  }
}
