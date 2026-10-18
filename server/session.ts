import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { ensureSession, readState, SESSION_COOKIE } from "@/server/services/state";

export async function getPageState() {
  return readState((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requestSession(request: NextRequest) {
  return ensureSession(request.cookies.get(SESSION_COOKIE)?.value);
}
export function attachSession(response: NextResponse, id: string) {
  response.cookies.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.SESSION_SECURE === "false" ? false : process.env.NODE_ENV === "production", path: "/", maxAge: 180 * 24 * 60 * 60 });
  return response;
}
