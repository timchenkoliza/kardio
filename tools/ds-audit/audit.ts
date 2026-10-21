import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { classify, computeGate } from "./baseline/classify";
import { collectSnapshots, type CollectOptions } from "./collect/browser";
import { discoverRoutes } from "./collect/crawl";
import { DEFAULT_ROUTES, DS_README, DS_TOKENS } from "./config";
import { runRules } from "./findings";
import { normalizeRoute } from "./identity/fingerprint";
import { loadDesignSystem, type DesignSystem } from "./tokens";
import type { BaselineStatus, Finding, PageSnapshot, Report, SemanticSummary, Viewport } from "./types";
import { computeVersions, type Versions } from "./version";

export interface SiteAuditOptions {
  url: string;
  routes?: string[];
  crawl?: boolean;
  viewports?: Viewport[];
  outDir?: string | null;
  year?: number;
  setupContext?: CollectOptions["setupContext"];
  ds?: DesignSystem;
  /** Defaults to VERCEL_AUTOMATION_BYPASS_SECRET from the environment. */
  bypassSecret?: string | null;
}

export interface SiteAudit {
  url: string;
  routes: string[];
  viewports: Viewport[];
  snapshots: PageSnapshot[];
  findings: Finding[];
  versions: Versions;
}

export function originOf(url: string): string {
  const withScheme = /^https?:\/\//.test(url) ? url : `https://${url}`;
  return new URL(withScheme).origin;
}

/** Deterministic layer for one deployment: collect every route × viewport, run R-00…R-13. */
export async function auditSite(options: SiteAuditOptions, browser?: Browser): Promise<SiteAudit> {
  const ds = options.ds ?? loadDesignSystem(DS_TOKENS, DS_README);
  const url = originOf(options.url);
  const viewports = options.viewports ?? ["desktop", "mobile"];
  const screenshotDir = options.outDir ? path.join(options.outDir, "screenshots") : null;
  const own = !browser;
  const instance = browser ?? await chromium.launch();
  try {
    let routes = (options.routes?.length ? options.routes : [...DEFAULT_ROUTES]).map(normalizeRoute);
    const collect = (list: string[], vps: Viewport[]) => collectSnapshots({ baseUrl: url, routes: list, viewports: vps, screenshotDir, setupContext: options.setupContext, bypassSecret: options.bypassSecret ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? null }, instance);
    let snapshots = await collect(routes, viewports);
    if (options.crawl ?? !options.routes?.length) {
      const extra = discoverRoutes(snapshots, routes, url);
      if (extra.length) {
        snapshots = snapshots.concat(await collect(extra, viewports));
        routes = routes.concat(extra);
      }
    }
    const findings = runRules(snapshots, ds, options.year ?? new Date().getFullYear());
    return { url, routes: [...routes].sort(), viewports, snapshots, findings, versions: computeVersions(ds) };
  } finally {
    if (own) await instance.close();
  }
}

export const SEMANTIC_DISABLED: SemanticSummary = { mode: "skipped", model: null, effort: null, routes: [], cache_hits: 0, cost_usd: 0, skipped_reason: "Смысловой слой в v1 отключён: Anthropic API не вызывается" };

export interface ReportInput {
  audit: SiteAudit;
  mode: Report["mode"];
  commitSha: string | null;
  baseSha: string | null;
  baseline: { status: BaselineStatus; sha: string | null; url: string | null; findings: Finding[] | null };
  semantic?: SemanticSummary;
  now?: Date;
}

/** Classification + gate + metadata. Field order is fixed so report.json diffs stay readable. */
export function buildReport(input: ReportInput): Report {
  const { audit } = input;
  const comparable = input.baseline.status === "exact" || input.baseline.status === "recomputed";
  const result = classify(audit.findings, comparable ? input.baseline.findings : null, { routes: audit.routes, viewports: audit.viewports });
  return {
    ds_version: audit.versions.ds_version,
    ruleset_version: audit.versions.ruleset_version,
    auditor_version: audit.versions.auditor_version,
    commit_sha: input.commitSha,
    base_sha: input.baseSha,
    baseline_sha: comparable ? input.baseline.sha : null,
    baseline_status: input.baseline.status,
    preview_url: audit.url,
    base_url: input.baseline.url,
    mode: input.mode,
    routes: audit.routes,
    viewports: audit.viewports,
    count_new: result.counts.count_new,
    count_existing: result.counts.count_existing,
    count_fixed: result.counts.count_fixed,
    gate: computeGate(result.findings, input.baseline.status),
    findings: result.findings,
    fixed: result.fixed,
    not_compared: result.notCompared,
    semantic: input.semantic ?? SEMANTIC_DISABLED,
    page_errors: audit.snapshots.filter(s => s.error).map(s => ({ route: s.route, viewport: s.viewport, error: s.error as string })).sort((a, b) => a.route.localeCompare(b.route) || a.viewport.localeCompare(b.viewport)),
    generated_at: (input.now ?? new Date()).toISOString(),
  };
}
