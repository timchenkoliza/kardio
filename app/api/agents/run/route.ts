import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgent } from "@/server/agent-first/run-agent";

const agentId = z.enum(["whats-new", "guideline-change", "drug-change", "research", "events", "learning", "materials"]);
const requestSchema = z.object({
  specialty: z.enum(["cardiology", "oncology"]),
  input: z.string().trim().min(1).max(4000),
  requestedAgent: agentId.optional(),
  lastSeenAt: z.string().datetime().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос", details: parsed.error.flatten() }, { status: 400 });

  try {
    return NextResponse.json(await runAgent({ specialty: parsed.data.specialty, prompt: parsed.data.input, requestedAgent: parsed.data.requestedAgent, lastSeenAt: parsed.data.lastSeenAt }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось выполнить задачу агента." }, { status: 500 });
  }
}
