import { NextResponse } from "next/server";
import { z } from "zod";
import { expertTwinsCouncilForSpecialty, expertTwinsPanels, type ExpertTwinsCase } from "@/lib/integrations/expert-twins";
import { expertTwinsBaseUrl, runExpertConsilium } from "@/server/services/expert-twins";

export const runtime = "nodejs";

const specialtySchema = z.enum(["cardiology", "oncology"]);
const caseStateSchema = z.object({
  diagnosis: z.string().optional(),
  stage: z.string().optional(),
  line_of_therapy: z.string().optional(),
  risk_group: z.string().optional(),
  prior_therapy: z.array(z.string()).optional(),
  comorbidities: z.array(z.string()).optional(),
  biomarkers: z.array(z.string()).optional(),
  symptoms: z.array(z.string()).optional(),
  tests: z.record(z.string(), z.unknown()).optional(),
  other: z.record(z.string(), z.unknown()).optional(),
});

const requestSchema = z.object({
  specialty: specialtySchema,
  question: z.string().trim().min(3).max(1200),
  domain_tags: z.array(z.string().trim().min(1)).max(12).optional(),
  state: caseStateSchema.optional(),
  max_evidence_per_expert: z.number().int().min(1).max(10).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const specialtyResult = specialtySchema.safeParse(url.searchParams.get("specialty"));
  if (!specialtyResult.success) {
    return NextResponse.json({ error: "Unsupported specialty" }, { status: 400 });
  }

  const council = expertTwinsCouncilForSpecialty(specialtyResult.data);
  let configured = false;
  try {
    configured = Boolean(expertTwinsBaseUrl());
  } catch {
    configured = false;
  }

  return NextResponse.json({
    configured,
    council,
    experts: expertTwinsPanels[council],
    fallback: configured ? null : "deterministic_consilium_v1",
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid consilium request" }, { status: 400 });
  }

  let baseUrl: string | null;
  try {
    baseUrl = expertTwinsBaseUrl();
  } catch (error) {
    console.error("Expert Twins configuration error", error);
    return NextResponse.json({ error: "Expert Twins configuration is invalid" }, { status: 500 });
  }

  if (!baseUrl) {
    return NextResponse.json({
      error: "Expert Twins is not configured",
      code: "EXPERT_TWINS_NOT_CONFIGURED",
    }, { status: 503 });
  }

  const council = expertTwinsCouncilForSpecialty(parsed.data.specialty);
  const input: ExpertTwinsCase = {
    council,
    question: parsed.data.question,
    domain_tags: parsed.data.domain_tags,
    state: parsed.data.state,
    max_evidence_per_expert: parsed.data.max_evidence_per_expert,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const result = await runExpertConsilium(input, { baseUrl, signal: controller.signal });
    return NextResponse.json({ source: "expert_twins", result });
  } catch (error) {
    console.error("Expert Twins request failed", error);
    return NextResponse.json({
      error: "Expert Twins is temporarily unavailable",
      code: "EXPERT_TWINS_UNAVAILABLE",
    }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
