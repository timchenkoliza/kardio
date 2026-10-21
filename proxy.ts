import { NextResponse, type NextRequest } from "next/server";

/**
 * One anonymous session per browser, decided once, before any API call.
 *
 * Without this, the first page load fired several API requests without a
 * session cookie (visit, catch-up, background research status, telemetry);
 * each minted its own session and the last Set-Cookie won. A run created under
 * one of them was later read under another and reported as «another
 * session». The page request now carries the id that every later request
 * (and every server instance) sees; the stores adopt a well-formed id.
 */

const SESSION_COOKIE = "kardio_session";
const SESSION_ID = /^[a-f0-9]{64}$/u;
const MAX_AGE = 180 * 24 * 60 * 60;

function newSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  if (existing && SESSION_ID.test(existing)) return NextResponse.next();
  const id = newSessionId();
  // Visible to this very render (server components read the request cookies) …
  const headers = new Headers(request.headers);
  const others = (request.headers.get("cookie") ?? "").split(";").map(part => part.trim()).filter(part => part && !part.startsWith(`${SESSION_COOKIE}=`));
  headers.set("cookie", [...others, `${SESSION_COOKIE}=${id}`].join("; "));
  const response = NextResponse.next({ request: { headers } });
  // … and to every later request from this browser.
  response.cookies.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.SESSION_SECURE === "false" ? false : process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
  return response;
}

export const config = {
  // Pages only: API routes keep their own session handling; static assets need no session.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|.*\\.[a-zA-Z0-9]+$).*)"],
};
