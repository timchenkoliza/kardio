import type { NextRequest } from "next/server";
import { SPECIALTY_IDS, type SpecialtyId } from "@/lib/domain/types";
import { failure, HttpError, json } from "@/server/http";
import { isRunId, lookupRun, runStatusView } from "@/server/portal/run-state";
import { SESSION_COOKIE } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Durable status of one run, for the result page's progress poller.
 * Reads storage only (never creates a session, never executes anything).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const specialty = request.nextUrl.searchParams.get("specialty");
    if (!specialty || !(SPECIALTY_IDS as readonly string[]).includes(specialty)) throw new HttpError(400, "Проверьте параметры запроса.");
    if (!isRunId(id)) return json(runStatusView(id, { availability: "run_not_found", run: null }), 404);
    const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? null;
    const sessionId = cookie && /^[a-f0-9]{64}$/u.test(cookie) ? cookie : null;
    const view = runStatusView(id, await lookupRun(sessionId, specialty as SpecialtyId, id));
    return json(view, view.availability === "available" ? 200 : view.availability === "session_mismatch" ? 403 : 404);
  } catch (error) {
    return failure(error);
  }
}
