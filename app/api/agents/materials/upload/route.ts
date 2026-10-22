import { SPECIALTY_IDS } from "@/lib/domain/types";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { failure, HttpError, json, rateLimit } from "@/server/http";
import { agentSession, assertSameOriginRequest, attachAgentCookies } from "@/server/agents/http";
import { materialFromUpload, MAX_UPLOAD_BYTES, parseUpload } from "@/server/agents/services/material";
import { workspaceStore } from "@/server/agents/store";
import { recordAgentEvent } from "@/server/agents/telemetry";
import { SESSION_COOKIE } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fieldsSchema = z.object({
  specialty: z.enum(SPECIALTY_IDS),
  title: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
});

/** upload → parse → de-identify → index → personal retrieval. */
export async function POST(request: NextRequest) {
  try {
    assertSameOriginRequest(request, "multipart");
    const key = request.cookies.get(SESSION_COOKIE)?.value ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    rateLimit(`upload:${key}`, 20);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, "Файл должен быть не больше 4 МБ.");
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new HttpError(400, "Выберите файл.");
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Файл должен быть не больше 4 МБ.");
    const fields = fieldsSchema.parse({
      specialty: form.get("specialty"),
      title: typeof form.get("title") === "string" && form.get("title") ? form.get("title") : undefined,
      note: typeof form.get("note") === "string" && form.get("note") ? form.get("note") : undefined,
    });
    const sessionId = await agentSession(request, fields.specialty);
    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = parseUpload(file.name, file.type || "application/octet-stream", bytes);
    if (parsed.parseStatus === "rejected") throw new HttpError(422, parsed.parseNote ?? "Этот тип файла не принимается.");
    const material = materialFromUpload({ specialty: fields.specialty, fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, parsed, title: fields.title, note: fields.note, now: new Date().toISOString() });
    await workspaceStore().saveMaterial(sessionId, material);
    await recordAgentEvent(sessionId, "file_uploaded", { specialty: fields.specialty, agentId: "materials", status: material.parseStatus });
    const response = json({ ok: true, material: { ...material, text: null }, notices: material.redactions.length ? ["В файле были персональные данные — в индексе они замаскированы."] : [] }, 201);
    return attachAgentCookies(response, sessionId, fields.specialty);
  } catch (error) {
    return failure(error);
  }
}
