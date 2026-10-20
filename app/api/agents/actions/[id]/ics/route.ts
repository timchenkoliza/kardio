import type { NextRequest } from "next/server";
import { buildIcs, icsEventsFromResults } from "@/server/agents/services/action-confirmation";
import { workspaceStore } from "@/server/agents/store";
import { SESSION_COOKIE } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Calendar artifact of a confirmed action. Only the owning session can fetch it. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId) || !/^act-[a-f0-9-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const store = workspaceStore();
  const action = await store.getAction(sessionId, id);
  if (!action || action.kind !== "calendar_write" || action.status !== "completed") return new Response("Not found", { status: 404 });
  const results = (await Promise.all(action.resultIds.map(resultId => store.getResult(sessionId, resultId)))).filter((value): value is NonNullable<typeof value> => Boolean(value));
  const ics = buildIcs(icsEventsFromResults(results), new Date());
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="kardio-events-${action.id.slice(4, 12)}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
