import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { TOOL_DIR } from "./config";
import { RULESET_SEMVER } from "./rules";
import type { DesignSystem } from "./tokens";

/** Bump on behaviour changes of collection, identity, classification or publishing. */
export const AUDITOR_SEMVER = "1.0.1";

function hashFiles(files: string[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(path.relative(TOOL_DIR, file)).update("\0").update(readFileSync(file)).update("\0");
  }
  return hash.digest("hex").slice(0, 10);
}

function listFiles(dir: string, keep: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) {
      if (["__tests__", "__fixtures__", "reference", "node_modules"].includes(entry)) continue;
      out.push(...listFiles(file, keep));
    } else if (keep(file)) out.push(file);
  }
  return out;
}

export interface Versions { ds_version: string; ruleset_version: string; auditor_version: string }

/** Content hashes, not git: identical on a dirty working tree and in a shallow CI checkout. */
export function computeVersions(ds: DesignSystem): Versions {
  const ruleFiles = [...listFiles(path.join(TOOL_DIR, "rules"), f => f.endsWith(".ts")), path.join(TOOL_DIR, "banned-copy.ts"), path.join(TOOL_DIR, "specialty-lexicon.ts"), path.join(TOOL_DIR, "tokens.ts")];
  const auditorFiles = listFiles(TOOL_DIR, f => /\.(ts|js)$/.test(f) && !f.endsWith(".test.ts"));
  return {
    ds_version: `${ds.version}+${ds.contentHash}`,
    ruleset_version: `${RULESET_SEMVER}+${hashFiles(ruleFiles)}`,
    auditor_version: `${AUDITOR_SEMVER}+${hashFiles(auditorFiles)}`,
  };
}
