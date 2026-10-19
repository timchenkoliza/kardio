import type { ExpertTwinsCase, ExpertTwinsResult } from "@/lib/integrations/expert-twins";

export function expertTwinsBaseUrl(): string | null {
  const raw = process.env.EXPERT_TWINS_URL?.trim();
  if (!raw) return null;

  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("EXPERT_TWINS_URL must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("EXPERT_TWINS_URL must not contain credentials");
  }

  return url.toString().replace(/\/$/, "");
}

export async function runExpertConsilium(
  input: ExpertTwinsCase,
  opts: { baseUrl?: string; signal?: AbortSignal } = {},
): Promise<ExpertTwinsResult> {
  const baseUrl = opts.baseUrl ?? expertTwinsBaseUrl();
  if (!baseUrl) throw new Error("Expert Twins is not configured");

  const response = await fetch(`${baseUrl}/v1/consilium/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: opts.signal,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Expert Twins ${response.status}: ${body}`);
  }

  return response.json() as Promise<ExpertTwinsResult>;
}
