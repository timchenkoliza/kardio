import type { NextRequest, NextResponse } from "next/server";
import type { SpecialtyId } from "@/lib/domain/types";
import { HttpError } from "@/server/http";
import { ensureSession, SESSION_COOKIE } from "@/server/services/state";
import { restoreFromMirror, workspaceStore } from "./store";
import { encodeProfileMirror, PROFILE_MIRROR_COOKIE } from "./store/mirror";
import { loadProfile } from "./workspace";

const COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

function secureCookies(): boolean {
  return process.env.SESSION_SECURE === "false" ? false : process.env.NODE_ENV === "production";
}

export async function readJsonBody(request: NextRequest, maxBytes = 64 * 1024): Promise<unknown> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new HttpError(413, "Запрос слишком большой.");
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw new HttpError(413, "Запрос слишком большой.");
  try { return JSON.parse(text) as unknown; } catch { throw new HttpError(400, "Не удалось прочитать запрос."); }
}

export function assertSameOriginRequest(request: NextRequest, contentType: "json" | "multipart") {
  const origin = request.headers.get("origin");
  const configured = process.env.APP_ORIGIN?.trim();
  let allowed: string | null = null;
  try {
    if (configured) allowed = new URL(configured).origin;
    else {
      const host = request.headers.get("host");
      const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(/:$/, "");
      allowed = host ? `${protocol}://${host}` : null;
    }
  } catch { allowed = null; }
  let normalized: string | null = null;
  try { normalized = origin ? new URL(origin).origin : null; } catch { normalized = null; }
  if (!normalized || !allowed || normalized !== allowed) throw new HttpError(403, "Запрос отклонён. Откройте приложение и повторите действие.");
  const type = request.headers.get("content-type") ?? "";
  if (contentType === "json" && !type.startsWith("application/json")) throw new HttpError(415, "Ожидается JSON.");
  if (contentType === "multipart" && !type.startsWith("multipart/form-data")) throw new HttpError(415, "Ожидается файл.");
}

/** Resolve the anonymous session and, without a database, restore the mirrored profile. */
export async function agentSession(request: NextRequest, specialty: SpecialtyId): Promise<string> {
  const session = await ensureSession(request.cookies.get(SESSION_COOKIE)?.value);
  await restoreFromMirror(session.id, specialty, request.cookies.get(PROFILE_MIRROR_COOKIE(specialty))?.value);
  return session.id;
}

export async function attachAgentCookies(response: NextResponse, sessionId: string, specialty: SpecialtyId): Promise<NextResponse> {
  response.cookies.set(SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: COOKIE_MAX_AGE });
  if (workspaceStore().kind === "memory") {
    const mirror = encodeProfileMirror(await loadProfile(sessionId, specialty));
    if (mirror) response.cookies.set(PROFILE_MIRROR_COOKIE(specialty), mirror, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: COOKIE_MAX_AGE });
  }
  return response;
}
