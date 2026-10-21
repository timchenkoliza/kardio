import { createHash } from "node:crypto";

/**
 * Content fingerprints. Text is normalised (whitespace, NBSP, case of nothing)
 * before hashing so that a re-render of the same words is not a «change»,
 * while any change of words, numbers or punctuation is.
 */
export function normalizeForFingerprint(text: string): string {
  return text.normalize("NFKC").replace(/ /gu, " ").replace(/\s+/gu, " ").trim();
}

export function fingerprint(text: string): string {
  return `sha256:${createHash("sha256").update(normalizeForFingerprint(text)).digest("hex").slice(0, 32)}`;
}

export function combineFingerprints(parts: readonly string[]): string {
  return fingerprint(parts.join("|"));
}

/** Deterministic id within a namespace (no random ids for knowledge objects). */
export function deterministicId(namespace: string, ...parts: Array<string | number | null | undefined>): string {
  const digest = createHash("sha256").update(parts.map(part => String(part ?? "")).join("␟")).digest("hex").slice(0, 16);
  return `${namespace}:${digest}`;
}
