import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, failure, json, parseBody, rateLimit } from "@/server/http";
import { ensureSession, mutateState, SESSION_COOKIE, stateCommandSchema } from "@/server/services/state";

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
    const key = request.cookies.get(SESSION_COOKIE)?.value ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    rateLimit(`state:${key}`, 90);
    const command = stateCommandSchema.parse(await parseBody(request));
    const session = await ensureSession(request.cookies.get(SESSION_COOKIE)?.value);
    const state = await mutateState(session.id, command);
    return withSessionCookie(json(state), session.id);
  } catch (error) {
    return failure(error);
  }
}
