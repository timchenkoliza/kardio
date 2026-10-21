import { SPECIALTY_IDS } from "@/lib/domain/types";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const specialtySchema = z.enum(SPECIALTY_IDS);
export const idSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_:.-]+$/);
const windows = new Map<string, { count: number; expires: number }>();
export function rateLimit(key: string, limit = 120) {
  const now = Date.now();
  const old = windows.get(key);
  if (old && old.expires > now) {
    if (++old.count > limit) throw new HttpError(429, "Слишком много запросов. Попробуйте через минуту.");
  } else {
    if (windows.size >= 5000) for (const [id, item] of windows) if (item.expires <= now) windows.delete(id);
    if (windows.size >= 5000) throw new HttpError(429, "Сервис занят. Попробуйте через минуту.");
    windows.set(key, { count: 1, expires: now + 60_000 });
  }
}
function requestOrigin(request: NextRequest): string | null {
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) {
    try { return new URL(configured).origin; } catch { return null; }
  }
  const host = request.headers.get("host")?.trim();
  if (!host) return null;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(/:$/, "");
  return `${protocol}://${host}`;
}
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowed = requestOrigin(request);
  let normalizedOrigin: string | null = null;
  try { normalizedOrigin = origin ? new URL(origin).origin : null; } catch { normalizedOrigin = null; }
  if (!normalizedOrigin || !allowed || normalizedOrigin !== allowed) throw new HttpError(403, "Запрос отклонён. Откройте приложение и повторите действие.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "Ожидается JSON.");
}
export async function parseBody(request: NextRequest) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 8192) throw new HttpError(413, "Запрос слишком большой.");
  const text = await request.text();
  if (Buffer.byteLength(text) > 8192) throw new HttpError(413, "Запрос слишком большой.");
  try { return JSON.parse(text) as unknown; } catch { throw new HttpError(400, "Не удалось прочитать запрос."); }
}
export function failure(error: unknown) {
  const status = error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 503;
  const message = error instanceof HttpError ? error.message : error instanceof z.ZodError ? "Проверьте параметры запроса." : "Сервис временно недоступен. Попробуйте ещё раз.";
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
