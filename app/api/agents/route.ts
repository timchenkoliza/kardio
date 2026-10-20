import type { NextRequest } from "next/server";
import { failure, json, rateLimit } from "@/server/http";
import { agentCommandSchema, executeAgentCommand } from "@/server/agents/commands";
import { agentSession, assertSameOriginRequest, attachAgentCookies, readJsonBody } from "@/server/agents/http";
import { SESSION_COOKIE } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    assertSameOriginRequest(request, "json");
    const key = request.cookies.get(SESSION_COOKIE)?.value ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    rateLimit(`agents:${key}`, 60);
    const command = agentCommandSchema.parse(await readJsonBody(request));
    const sessionId = await agentSession(request, command.specialty);
    const result = await executeAgentCommand(sessionId, command);
    return attachAgentCookies(json(result), sessionId, command.specialty);
  } catch (error) {
    return failure(error);
  }
}
