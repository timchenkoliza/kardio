import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  RESEARCH_BIBLIOGRAPHY_ORDERS,
  RESEARCH_CITATION_STYLES,
  RESEARCH_EXPORT_FORMATS,
  buildResearchExport,
} from "@/lib/agents/research-citations";
import { RESEARCH_MODES } from "@/lib/agents/research-options";
import { getRequestAccessStateFromRequest } from "@/server/access/request-access";
import { agentSession, attachAgentCookies } from "@/server/agents/http";
import { workspaceStore } from "@/server/agents/store";
import { HttpError, failure, rateLimit } from "@/server/http";
import { SESSION_COOKIE } from "@/server/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  specialty: z.enum(["cardiology", "oncology"]),
  run: z.string().regex(/^run-/u).max(80),
  mode: z.enum(RESEARCH_MODES).default("brief"),
  style: z.enum(RESEARCH_CITATION_STYLES).default("gost"),
  order: z.enum(RESEARCH_BIBLIOGRAPHY_ORDERS).default("appearance"),
  bibliography: z.enum(["0", "1"]).default("1"),
  format: z.enum(RESEARCH_EXPORT_FORMATS),
  ids: z.string().max(5000).optional(),
});

const FORMAT_META = {
  markdown: { extension: "md", type: "text/markdown; charset=utf-8" },
  rtf: { extension: "rtf", type: "application/rtf; charset=utf-8" },
  latex: { extension: "tex", type: "application/x-tex; charset=utf-8" },
} as const;

export async function GET(request: NextRequest) {
  try {
    const access = getRequestAccessStateFromRequest(request);
    if (access.subject.role === "pharma" || access.subject.role === "editorial") throw new HttpError(403, "Нет доступа к отчётам врача.");

    const parsed = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    const key = request.cookies.get(SESSION_COOKIE)?.value ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    rateLimit(`agents-research-export:${key}`, 60);
    const sessionId = await agentSession(request, parsed.specialty);
    const store = workspaceStore();
    const [run, allResults] = await Promise.all([
      store.getRun(sessionId, parsed.run),
      store.listResults(sessionId, parsed.specialty, "research"),
    ]);
    if (!run || run.specialty !== parsed.specialty || run.agentId !== "research") throw new HttpError(404, "Отчёт не найден.");
    const selectedIds = parsed.ids ? new Set(parsed.ids.split(",").filter(Boolean)) : null;
    const results = allResults
      .filter(result => result.runId === run.id && !result.dismissed && (!selectedIds || selectedIds.has(result.id)))
      .sort((a, b) => a.rank - b.rank);
    const content = buildResearchExport({
      run,
      results,
      mode: parsed.mode,
      citationStyle: parsed.style,
      bibliographyOrder: parsed.order,
      includeBibliography: parsed.bibliography === "1",
      format: parsed.format,
    });
    const meta = FORMAT_META[parsed.format];
    const filename = `research-${parsed.specialty}-${run.id.slice(-8)}.${meta.extension}`;
    const response = new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": meta.type,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
    return attachAgentCookies(response, sessionId, parsed.specialty);
  } catch (error) {
    return failure(error);
  }
}
