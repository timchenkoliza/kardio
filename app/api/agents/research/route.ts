import type { NextRequest } from "next/server";
import { z } from "zod";
import { RESEARCH_CONTENT_SCOPES, RESEARCH_MODES, RESEARCH_SOURCE_SCOPES } from "@/lib/agents/research-options";
import { getRequestAccessStateFromRequest } from "@/server/access/request-access";
import { agentSession, assertSameOriginRequest, attachAgentCookies, readJsonBody } from "@/server/agents/http";
import { executeResearchRun } from "@/server/agents/research-run";
import { HttpError, failure, json, rateLimit } from "@/server/http";
import { SESSION_COOKIE } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  specialty: z.enum(["cardiology", "oncology"]),
  text: z.string().trim().min(2).max(1200),
  mode: z.enum(RESEARCH_MODES),
  sourceScope: z.enum(RESEARCH_SOURCE_SCOPES),
  contentScope: z.enum(RESEARCH_CONTENT_SCOPES),
}).strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginRequest(request, "json");
    const access = getRequestAccessStateFromRequest(request);
    if (access.subject.role === "pharma" || access.subject.role === "editorial") {
      throw new HttpError(403, "У текущего workspace-пользователя нет доступа к агентам врача.");
    }

    const key = request.cookies.get(SESSION_COOKIE)?.value ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    rateLimit(`agents-research:${key}`, 30);
    const body = bodySchema.parse(await readJsonBody(request));
    const sessionId = await agentSession(request, body.specialty);
    const outcome = await executeResearchRun(sessionId, body.specialty, body.text, {
      mode: body.mode,
      sourceScope: body.sourceScope,
      contentScope: body.contentScope,
    });

    return attachAgentCookies(json({
      ok: true,
      profileChanged: true,
      runId: outcome.run.id,
      agentId: "research",
      notices: outcome.run.riskNotices,
    }), sessionId, body.specialty);
  } catch (error) {
    return failure(error);
  }
}
