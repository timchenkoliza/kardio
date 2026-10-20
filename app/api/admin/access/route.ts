import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ACCESS_SUBJECT_IDS,
  DEFAULT_AGENT_ACCESS_POLICY,
  PRODUCT_AGENT_IDS,
  entitlementForSubject,
  type AccessSubjectId,
  type AgentAccessOverride,
  type ProductAgentId,
} from "@/lib/access/agent-entitlements";
import {
  DEMO_ACCESS_OVERRIDES_COOKIE,
  DEMO_ACCESS_SUBJECT_COOKIE,
  encodeOverrides,
  getRequestAccessStateFromRequest,
  previewAccessAdminEnabled,
} from "@/server/access/request-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subjectIds = new Set<string>(ACCESS_SUBJECT_IDS);
const agentIds = new Set<string>(PRODUCT_AGENT_IDS);

const bodySchema = z.object({
  activeSubjectId: z.string().optional(),
  changes: z.array(z.object({ subjectId: z.string(), agentId: z.string(), enabled: z.boolean() }).strict()).max(24).optional(),
}).strict();

function cookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 };
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const state = getRequestAccessStateFromRequest(request);
  return NextResponse.json({ ok: true, ...state });
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "origin_not_allowed" }, { status: 403 });
  if (!previewAccessAdminEnabled()) return NextResponse.json({ ok: false, error: "admin_mutation_disabled" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });

  const current = getRequestAccessStateFromRequest(request);
  const byKey = new Map<string, AgentAccessOverride>(current.overrides.map(override => [`${override.subjectId}:${override.agentId}`, override]));

  for (const change of parsed.data.changes ?? []) {
    if (!subjectIds.has(change.subjectId) || !agentIds.has(change.agentId)) return NextResponse.json({ ok: false, error: "unknown_access_target" }, { status: 400 });
    const subjectId = change.subjectId as AccessSubjectId;
    const agentId = change.agentId as ProductAgentId;
    if (!entitlementForSubject(DEFAULT_AGENT_ACCESS_POLICY, subjectId, agentId)) {
      return NextResponse.json({ ok: false, error: "grant_not_defined" }, { status: 400 });
    }
    byKey.set(`${subjectId}:${agentId}`, { subjectId, agentId, enabled: change.enabled });
  }

  const response = NextResponse.json({ ok: true });
  if (parsed.data.activeSubjectId !== undefined) {
    if (!subjectIds.has(parsed.data.activeSubjectId)) return NextResponse.json({ ok: false, error: "unknown_subject" }, { status: 400 });
    response.cookies.set(DEMO_ACCESS_SUBJECT_COOKIE, parsed.data.activeSubjectId, cookieOptions());
  }
  response.cookies.set(DEMO_ACCESS_OVERRIDES_COOKIE, encodeOverrides([...byKey.values()]), cookieOptions());
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "origin_not_allowed" }, { status: 403 });
  if (!previewAccessAdminEnabled()) return NextResponse.json({ ok: false, error: "admin_mutation_disabled" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(DEMO_ACCESS_SUBJECT_COOKIE);
  response.cookies.delete(DEMO_ACCESS_OVERRIDES_COOKIE);
  return response;
}
