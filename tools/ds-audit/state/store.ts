import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Report } from "../types";

/**
 * Persistent audit state. In CI the directory is restored from and saved to the
 * GitHub Actions cache (see .github/workflows/ds-audit.yml), so it outlives the runner:
 *
 *   deployments/<sha>.json                         { url, environment, project, observed_at }
 *   baselines/<sha>/<auditor>__<ruleset>.json      deterministic report of a main commit
 *   semantic/<cache_key>.json                      semantic results (v2; unused while the layer is off)
 *   index.json                                     last access per entry, for pruning
 *
 * Every entry is content-addressed or keyed by an immutable SHA, so a lost write only
 * costs a recomputation and can never produce a wrong comparison.
 */

export interface DeploymentRecord { sha: string; url: string; environment: string; project: string | null; observed_at: string }

const safe = (value: string) => value.replace(/[^\w.-]+/g, "_");
const MAX_AGE_DAYS = 30;
const MAX_BYTES = 50 * 1024 * 1024;

export class StateStore {
  constructor(readonly dir: string) {}

  private file(...parts: string[]) { return path.join(this.dir, ...parts); }

  private readJson<T>(file: string): T | null {
    if (!existsSync(file)) return null;
    try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch { return null; }
  }

  private writeJson(file: string, value: unknown) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`);
    this.touch(path.relative(this.dir, file));
  }

  private touch(entry: string) {
    const indexFile = this.file("index.json");
    const index = this.readJson<Record<string, string>>(indexFile) ?? {};
    index[entry] = new Date().toISOString();
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(indexFile, `${JSON.stringify(index, null, 1)}\n`);
  }

  recordDeployment(record: DeploymentRecord) { this.writeJson(this.file("deployments", `${safe(record.sha)}.json`), record); }

  deployment(sha: string): DeploymentRecord | null {
    const file = this.file("deployments", `${safe(sha)}.json`);
    const value = this.readJson<DeploymentRecord>(file);
    if (value) this.touch(path.relative(this.dir, file));
    return value;
  }

  private baselineFile(sha: string, auditor: string, ruleset: string) { return this.file("baselines", safe(sha), `${safe(auditor)}__${safe(ruleset)}.json`); }

  saveBaseline(report: Report) {
    if (!report.commit_sha) throw new Error("A baseline needs commit_sha");
    this.writeJson(this.baselineFile(report.commit_sha, report.auditor_version, report.ruleset_version), report);
  }

  /** Exact baseline: same commit, same auditor and ruleset versions. */
  baseline(sha: string, auditor: string, ruleset: string): Report | null {
    const file = this.baselineFile(sha, auditor, ruleset);
    const value = this.readJson<Report>(file);
    if (value) this.touch(path.relative(this.dir, file));
    return value;
  }

  /** Drop entries not used for 30 days, then the oldest ones above 50 MB. */
  prune(now = new Date()) {
    const indexFile = this.file("index.json");
    const index = this.readJson<Record<string, string>>(indexFile) ?? {};
    const cutoff = now.getTime() - MAX_AGE_DAYS * 86_400_000;
    const entries = Object.entries(index).filter(([entry]) => existsSync(this.file(entry))).sort((a, b) => a[1].localeCompare(b[1]));
    let total = entries.reduce((sum, [entry]) => sum + statSync(this.file(entry)).size, 0);
    for (const [entry, at] of entries) {
      if (new Date(at).getTime() >= cutoff && total <= MAX_BYTES) continue;
      total -= statSync(this.file(entry)).size;
      rmSync(this.file(entry), { force: true });
      delete index[entry];
    }
    if (existsSync(this.dir)) writeFileSync(indexFile, `${JSON.stringify(index, null, 1)}\n`);
    for (const sub of ["baselines", "deployments", "semantic"]) {
      const dir = this.file(sub);
      if (!existsSync(dir)) continue;
      for (const child of readdirSync(dir)) {
        const childPath = path.join(dir, child);
        if (statSync(childPath).isDirectory() && readdirSync(childPath).length === 0) rmSync(childPath, { recursive: true, force: true });
      }
    }
  }
}
