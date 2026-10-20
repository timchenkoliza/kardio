import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canUseAgentCapability } from "@/lib/access/agent-entitlements";
import type { SpecialtyId } from "@/lib/domain/types";
import { createContentStudioPackage, requestContentStudioReview, updatePublicationDraft } from "@/lib/pharma/content-studio";
import { getRequestAccessStateFromRequest } from "@/server/access/request-access";
import { assertSameOriginRequest, readJsonBody } from "@/server/agents/http";
import { failure, HttpError, json, rateLimit } from "@/server/http";
import { ingestContentStudioSource } from "@/server/pharma/source-ingestion";
import { contentStudioStore, contentStudioWorkspaceIdForSubject } from "@/server/pharma/store";
import { ensureSession, SESSION_COOKIE } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const specialty = z.enum(["cardiology", "oncology"]);
const packageId = z.string().regex(/^pkg-[a-f0-9-]{36}$/);
const draftId = z.string().regex(/^draft-[a-f0-9-]{36}$/);
const httpUrl = z.string().trim().max(1200).refine(value => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch { return false; }
}, "Ожидается HTTP(S) URL");
const sourceUrl = z.union([httpUrl, z.literal("")]).transform(value => value || null);
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), specialty, briefText: z.string().trim().min(4).max(6000) }).strict(),
  z.object({ action: z.literal("addSource"), specialty, packageId, sourceKind: z.enum(["partner_material", "external_reference"]), title: z.string().trim().min(2).max(240), url: sourceUrl, text: z.string().trim().min(20).max(30000) }).strict(),
  z.object({ action: z.literal("updateDraft"), specialty, packageId, draftId, title: z.string().trim().min(2).max(240), content: z.string().trim().min(2).max(12000) }).strict(),
  z.object({ action: z.literal("requestReview"), specialty, packageId }).strict(),
]);

type Command = z.infer<typeof commandSchema>;

function secureCookies(): boolean {
  return process.env.SESSION_SECURE === "false" ? false : process.env.NODE_ENV === "production";
}

function attachSessionCookie(response: NextResponse, sessionId: string) {
  response.cookies.set(SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: 180 * 24 * 60 * 60 });
  return response;
}

function capabilityFor(command: Command) {
  if (command.action === "create") return "run" as const;
  if (command.action === "addSource") return "upload_source" as const;
  if (command.action === "updateDraft") return "edit_draft" as const;
  return "request_review" as const;
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginRequest(request, "json");
    const key = request.cookies.get(SESSION_COOKIE)?.value ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    rateLimit(`content-studio:${key}`, 50);
    const command = commandSchema.parse(await readJsonBody(request, 48 * 1024));
    const access = getRequestAccessStateFromRequest(request);
    const workspaceId = contentStudioWorkspaceIdForSubject(access.subject.id);
    if (!workspaceId) throw new HttpError(403, "Студия контента недоступна для вашей роли.");
    if (!canUseAgentCapability(access.policy, access.subject.id, "content_studio", capabilityFor(command))) {
      throw new HttpError(403, "Для этого действия нет доступа.");
    }

    const session = await ensureSession(request.cookies.get(SESSION_COOKIE)?.value);
    const store = contentStudioStore();
    const specialtyId = command.specialty as SpecialtyId;

    if (command.action === "create") {
      const pkg = createContentStudioPackage({ specialty: specialtyId, ownerSubjectId: access.subject.id, briefText: command.briefText });
      await store.savePackage(session.id, pkg);
      return attachSessionCookie(json({ ok: true, package: pkg, storage: store.kind }, 201), session.id);
    }

    const current = await store.getPackage(session.id, specialtyId, workspaceId, command.packageId);
    if (!current) throw new HttpError(404, "Пакет публикации не найден.");

    if (command.action === "addSource") {
      if (current.status !== "draft") throw new HttpError(409, "Пакет уже на проверке — новые источники добавить нельзя.");
      let pkg;
      try {
        pkg = ingestContentStudioSource(current, { kind: command.sourceKind, title: command.title, url: command.url, text: command.text });
      } catch (error) {
        if (error instanceof Error && error.message === "source_content_required") throw new HttpError(400, "Добавьте название и текст источника.");
        throw error;
      }
      await store.savePackage(session.id, pkg);
      return attachSessionCookie(json({ ok: true, package: pkg, storage: store.kind }), session.id);
    }

    if (command.action === "updateDraft") {
      if (current.status !== "draft") throw new HttpError(409, "Пакет уже на проверке — редактирование закрыто.");
      let pkg;
      try { pkg = updatePublicationDraft(current, command.draftId, { title: command.title, content: command.content }); }
      catch (error) {
        if (error instanceof Error && error.message === "draft_not_found") throw new HttpError(404, "Черновик не найден.");
        throw error;
      }
      await store.savePackage(session.id, pkg);
      return attachSessionCookie(json({ ok: true, package: pkg, storage: store.kind }), session.id);
    }

    if (current.status !== "draft") throw new HttpError(409, "Пакет уже на проверке или проверен.");
    let pkg;
    try { pkg = requestContentStudioReview(current); }
    catch (error) {
      if (error instanceof Error && error.message === "source_required") throw new HttpError(409, "Перед проверкой добавьте хотя бы один исходный материал.");
      if (error instanceof Error && error.message === "claim_map_required") throw new HttpError(409, "Перед проверкой нужно хотя бы одно медицинское утверждение из источника.");
      throw error;
    }
    await store.savePackage(session.id, pkg);
    return attachSessionCookie(json({ ok: true, package: pkg, storage: store.kind }), session.id);
  } catch (error) {
    return failure(error);
  }
}
