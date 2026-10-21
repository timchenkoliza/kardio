import { readFileSync } from "node:fs";
import type { SiteAudit } from "../audit";
import type { StateStore } from "../state/store";
import type { BaselineStatus, Finding, Report } from "../types";
import type { Versions } from "../version";

export interface ResolvedBaseline { status: BaselineStatus; sha: string | null; url: string | null; findings: Finding[] | null; note: string | null }

export interface ResolveOptions {
  baseSha: string | null;
  versions: Versions;
  store?: StateStore | null;
  /** Local use and tests: a report.json to compare against. */
  baselineFile?: string | null;
  /** Audit this deployment as the baseline (same routes and viewports). */
  baseUrl?: string | null;
  auditBase: (url: string) => Promise<SiteAudit>;
}

const sameVersions = (report: Report, versions: Versions) => report.auditor_version === versions.auditor_version && report.ruleset_version === versions.ruleset_version;

/**
 * 1. explicit report file → exact;
 * 2. stored baseline for base_sha made by this auditor/ruleset → exact;
 * 3. a known deployment of base_sha (or --base-url) → audit it now → recomputed;
 * 4. nothing → unavailable (the gate turns advisory).
 */
export async function resolveBaseline(options: ResolveOptions): Promise<ResolvedBaseline> {
  if (options.baselineFile) {
    const report = JSON.parse(readFileSync(options.baselineFile, "utf8")) as Report;
    const note = sameVersions(report, options.versions) ? null : `Базовый отчёт снят другой версией аудитора (${report.auditor_version}); сравнение может быть неточным`;
    return { status: "exact", sha: report.commit_sha, url: report.preview_url, findings: report.findings, note };
  }
  if (options.baseSha && options.store) {
    const stored = options.store.baseline(options.baseSha, options.versions.auditor_version, options.versions.ruleset_version);
    if (stored) return { status: "exact", sha: options.baseSha, url: stored.preview_url, findings: stored.findings, note: null };
  }
  const deployment = options.baseSha && options.store ? options.store.deployment(options.baseSha) : null;
  const url = options.baseUrl ?? deployment?.url ?? null;
  if (url) {
    const audit = await options.auditBase(url);
    return { status: "recomputed", sha: options.baseSha, url: audit.url, findings: audit.findings, note: null };
  }
  if (!options.baseSha) return { status: "not_applicable", sha: null, url: null, findings: null, note: "Базовый коммит не задан" };
  return { status: "unavailable", sha: options.baseSha, url: null, findings: null, note: `Для ${options.baseSha.slice(0, 7)} нет ни базового отчёта, ни известного деплоя` };
}
