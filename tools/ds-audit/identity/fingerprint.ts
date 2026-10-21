import { createHash } from "node:crypto";

/**
 * Deterministic identity of a finding. It describes WHICH thing violates WHICH rule,
 * never by how much: sizes, ratios, counts, coordinates and timestamps stay out,
 * so a partial fix or a reflow keeps the same fingerprint.
 */
export interface FingerprintInput {
  ruleId: string;
  identityVersion: number;
  route: string;
  viewport: string;
  locator: string;
  evidenceKey: string;
}

/** Path only: no origin, query or hash; no trailing slash. Origin differs between preview and production. */
export function normalizeRoute(route: string): string {
  if (route === "*") return route;
  let path = route;
  try { path = new URL(route, "http://x").pathname; } catch { /* keep as is */ }
  path = path.replace(/\/+$/, "");
  return path || "/";
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprint(input: FingerprintInput): string {
  const payload = canonicalJson([input.ruleId, input.identityVersion, normalizeRoute(input.route), input.viewport, input.locator.normalize("NFKC"), input.evidenceKey.normalize("NFKC")]);
  return `${input.ruleId}:${createHash("sha256").update(payload).digest("hex").slice(0, 16)}`;
}
