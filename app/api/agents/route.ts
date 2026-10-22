import { after, type NextRequest } from "next/server";
import { HttpError, failure, json, rateLimit } from "@/server/http";
import { getRequestAccessStateFromRequest } from "@/server/access/request-access";
import { agentCommandSchema, executeAgentCommand } from "@/server/agents/commands";
import { agentSession, assertSameOriginRequest, attachAgentCookies, readJsonBody } from "@/server/agents/http";
import { SESSION_COOKIE } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    assertSameOriginRequest(request, "json");
    const access = getRequestAccessStateFromRequest(request);
    if (access.subject.role === "pharma" || access.subject.role === "editorial") {
      throw new HttpError(403, "У текущего workspace-пользователя нет доступа к агентам врача.");
    }
    const key = request.cookies.get(SESSION_COOKIE)?.value ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    rateLimit(`agents:${key}`, 60);
    const command = agentCommandSchema.parse(await readJsonBody(request));
    const sessionId = await agentSession(request, command.specialty);
    // The run is durable before this returns; its work continues after the response.
    const result = await executeAgentCommand(sessionId, command, { schedule: task => after(task) });
    return attachAgentCookies(json(result), sessionId, command.specialty);
  } catch (error) {
    return failure(error);
  }
}
