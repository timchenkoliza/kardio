import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Browser } from "@playwright/test";
import { auditSite, buildReport, type SiteAudit } from "./audit";
import { resolveBaseline } from "./baseline/resolve";
import { renderMarkdown } from "./publish/report-md";
import { runSemantic } from "./semantic/run";
import type { StateStore } from "./state/store";
import type { Report, Viewport } from "./types";

export interface PipelineOptions {
  url: string;
  routes?: string[];
  crawl?: boolean;
  viewports?: Viewport[];
  outDir: string;
  mode: Report["mode"];
  commitSha: string | null;
  baseSha: string | null;
  baselineFile?: string | null;
  baseUrl?: string | null;
  store?: StateStore | null;
  noAi: boolean;
  year?: number;
  setupContext?: Parameters<typeof auditSite>[0]["setupContext"];
  runUrl?: string | null;
}

export interface PipelineResult { report: Report; audit: SiteAudit; markdown: string; baselineNote: string | null }

/** Audit → baseline → classification → gate → report.json + report.md. Publishing is the caller's job. */
export async function runPipeline(options: PipelineOptions, browser?: Browser): Promise<PipelineResult> {
  const audit = await auditSite({ url: options.url, routes: options.routes, crawl: options.crawl, viewports: options.viewports, outDir: options.outDir, year: options.year, setupContext: options.setupContext }, browser);
  const baseline = options.mode === "baseline"
    ? { status: "not_applicable" as const, sha: null, url: null, findings: null, note: null }
    : await resolveBaseline({
      baseSha: options.baseSha,
      versions: audit.versions,
      store: options.store,
      baselineFile: options.baselineFile,
      baseUrl: options.baseUrl,
      auditBase: async url => {
        const base = await auditSite({ url, routes: audit.routes, crawl: false, viewports: audit.viewports, outDir: null, year: options.year, setupContext: options.setupContext }, browser);
        if (options.store && options.baseSha) {
          options.store.saveBaseline(buildReport({ audit: base, mode: "baseline", commitSha: options.baseSha, baseSha: null, baseline: { status: "not_applicable", sha: null, url: null, findings: null } }));
        }
        return base;
      },
    });
  const semantic = runSemantic({ mode: options.mode === "deep" ? "deep" : "pr", noAi: options.noAi, routes: audit.routes });
  const report = buildReport({ audit, mode: options.mode, commitSha: options.commitSha, baseSha: options.baseSha, baseline, semantic });
  const markdown = renderMarkdown(report, { runUrl: options.runUrl ?? null, marker: false });
  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(path.join(options.outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(options.outDir, "report.md"), markdown);
  return { report, audit, markdown, baselineNote: baseline.note };
}
