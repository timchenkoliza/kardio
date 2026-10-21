import { createHash } from "node:crypto";
import { canonicalJson } from "../identity/fingerprint";
import type { Finding, PageSnapshot } from "../types";

export const SEMANTIC_PROMPT_VERSION = 1;

/**
 * Content digest of a page: visible text with locators and the DOM outline.
 * Screenshot pixels are left out on purpose (not byte-stable between runs).
 */
export function pageDigest(snapshots: PageSnapshot[]): string {
  const outline = [...snapshots].sort((a, b) => a.viewport.localeCompare(b.viewport)).map(s => ({
    viewport: s.viewport,
    texts: s.texts.map(t => [t.component, t.text]),
    headings: s.headings.map(h => [h.level, h.text]),
    targets: s.targets.map(t => t.component),
  }));
  return createHash("sha256").update(canonicalJson(outline)).digest("hex");
}

/** Same page content + same model/mode/prompt/DS/rules ⇒ same key, whatever the commit SHA. */
export function semanticCacheKey(input: { model: string; mode: string; effort: string; dsVersion: string; rulesetVersion: string; route: string; snapshots: PageSnapshot[]; deterministic: Finding[] }): string {
  return createHash("sha256").update(canonicalJson([
    input.model, input.mode, input.effort, SEMANTIC_PROMPT_VERSION, input.dsVersion, input.rulesetVersion, input.route,
    pageDigest(input.snapshots),
    input.deterministic.filter(f => f.pages.includes(input.route)).map(f => f.fingerprint).sort(),
  ])).digest("hex").slice(0, 32);
}
