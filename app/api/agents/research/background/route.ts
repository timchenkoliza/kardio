import { SPECIALTY_IDS } from "@/lib/domain/types";
import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { RESEARCH_CONTENT_SCOPES, RESEARCH_MODES, RESEARCH_SOURCE_SCOPES, normalizeResearchDomains } from "@/lib/agents/research-options";
import { getRequestAccessStateFromRequest } from "@/server/access/request-access";
import { agentSession, assertSameOriginRequest, attachAgentCookies, readJsonBody } from "@/server/agents/http";
import { getResearchJob, listResearchJobs, processResearchJob, queueResearchJob } from "@/server/agents/research-jobs";
import { HttpError, failure, json, rateLimit } from "@/server/http";
import { STORAGE_UNAVAILABLE } from "@/server/agents/commands";
import { durableRunStoreMissing } from "@/server/agents/store";
import { SESSION_COOKIE } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  specialty: z.enum(SPECIALTY_IDS),
  text: z.string().trim().min(2).max(1200),
  mode: z.enum(RESEARCH_MODES),
  sourceScope: z.enum(RESEARCH_SOURCE_SCOPES),
  contentScope: z.enum(RESEARCH_CONTENT_SCOPES),
  includeDomains: z.array(z.string().max(200)).max(8).default([]),
  excludeDomains: z.array(z.string().max(200)).max(8).default([]),
}).strict();

const querySchema = z.object({
  specialty: z.enum(SPECIALTY_IDS),
  job: z.string().startsWith("rjob-").max(80).optional(),
});

function assertPhysicianAccess(request: NextRequest) {
  const access = getRequestAccessStateFromRequest(request);
  if (access.subject.role === "pharma" || access.subject.role === "editorial") {
    throw new HttpError(403, "У текущего workspace-пользователя нет доступа к исследованиям врача.");
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginRequest(request, "json");
    if (durableRunStoreMissing()) throw new HttpError(503, STORAGE_UNAVAILABLE, "storage_unavailable");
    assertPhysicianAccess(request);
    const key = request.cookies.get(SESSION_COOKIE)?.value ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    rateLimit(`agents-research-background:${key}`, 12);
    const body = bodySchema.parse(await readJsonBody(request));
    const sessionId = await agentSession(request, body.specialty);
    const excludeDomains = normalizeResearchDomains(body.excludeDomains);
    const job = await queueResearchJob(sessionId, body.specialty, body.text, {
      mode: body.mode,
      sourceScope: body.sourceScope,
      contentScope: body.contentScope,
      includeDomains: normalizeResearchDomains(body.includeDomains).filter(domain => !excludeDomains.includes(domain)),
      excludeDomains,
    });

    if (job.status === "queued") {
      after(async () => {
        await processResearchJob(sessionId, job.id);
      });
    }
    return attachAgentCookies(json({ ok: true, job }, job.status === "queued" ? 202 : 200), sessionId, body.specialty);
  } catch (error) {
    return failure(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    assertPhysicianAccess(request);
    const parsed = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    const key = request.cookies.get(SESSION_COOKIE)?.value ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    rateLimit(`agents-research-background-read:${key}`, 120);
    const sessionId = await agentSession(request, parsed.specialty);
    if (parsed.job) {
      const job = await getResearchJob(sessionId, parsed.specialty, parsed.job);
      if (!job) throw new HttpError(404, "Фоновое исследование не найдено.");
      return attachAgentCookies(json({ ok: true, job }), sessionId, parsed.specialty);
    }
    const jobs = await listResearchJobs(sessionId, parsed.specialty, 10);
    return attachAgentCookies(json({ ok: true, jobs }), sessionId, parsed.specialty);
  } catch (error) {
    return failure(error);
  }
}
