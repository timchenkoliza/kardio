import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { analyticsEvents } from "@/db/schema";
import { assertSameOrigin, failure, json, parseBody, rateLimit, specialtySchema, idSchema } from "@/server/http";
import { ensureSession, SESSION_COOKIE } from "@/server/services/state";

const eventSchema = z.object({
  event: z.enum([
    "search_submitted",
    "shell_changed",
    "specialty_changed",
    "quick_job_opened",
    "content_opened",
    "content_saved",
    "content_unsaved",
  ]),
  specialty: specialtySchema,
  shell: z.enum(["explore", "practice", "workspace"]),
  contentId: idSchema.optional(),
  sourceId: idSchema.optional(),
  rankPosition: z.number().int().min(0).max(1000).optional(),
  currentness: z.enum(["current", "review", "superseded", "archived"]).optional(),
}).strict();

const COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

function withSessionCookie(response: NextResponse, sessionId: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const candidate = request.cookies.get(SESSION_COOKIE)?.value;
    rateLimit(`events:${candidate ?? request.headers.get("x-forwarded-for") ?? "anonymous"}`, 180);
    const payload = eventSchema.parse(await parseBody(request));
    const session = await ensureSession(candidate);
    await db.insert(analyticsEvents).values({
      sessionId: session.id,
      event: payload.event,
      payload,
    });
    return withSessionCookie(json({ ok: true }, 201), session.id);
  } catch (error) {
    return failure(error);
  }
}
