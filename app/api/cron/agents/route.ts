import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDueSchedules } from "@/server/agents/scheduler";
import { databaseConfigured } from "@/server/agents/store";
import { executeRun } from "@/server/agents/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Background checks outside any open tab. Called by Vercel Cron (vercel.json)
 * with `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 * The response carries counts only — never session ids or findings.
 */

function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "scheduler_not_configured", message: "CRON_SECRET не задан: фоновые проверки выключены, агенты обновляются при открытии портала." }, { status: 503 });
  if (!authorized(request, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ error: "storage_unavailable", message: "Фоновые проверки требуют PostgreSQL." }, { status: 503 });
  const report = await runDueSchedules({ run: (sessionId, specialty, agentId) => executeRun(sessionId, specialty, agentId, { trigger: "scheduled" }), budgetMs: 45_000 });
  console.info(`[scheduler] claimed=${report.claimed} ran=${report.ran} completed=${report.completed} partial=${report.partial} failed=${report.failed} skipped=${report.skipped} deferred=${report.deferred} ms=${report.durationMs}`);
  return NextResponse.json(report);
}
