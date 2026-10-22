import fs from "node:fs";
import path from "node:path";
import type { BrowserDriver, PageSnapshot } from "@/server/mesh/browser/drivers";
import { SourceToolError } from "@/server/mesh/browser/errors";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { planSources } from "@/lib/mesh/planner";
import type { SourceId, SourceStatusReport } from "@/lib/mesh/sources";
import { executePlan } from "@/server/mesh/execute";
import { createSourceRegistry, descriptors } from "@/server/mesh/sources/registry";
import { fakeAbstracts, fakeArticle, fakePubmed, testContext } from "./agent-test-utils";

const FIXTURES = path.resolve("tests/fixtures/medi");

export const MEDI_FIXTURE_ROUTES: Record<string, string> = {
  "https://medi.ru/robots.txt": "robots.txt",
  "https://medi.ru/analogi-mnn/empagliflozin/": "inn-empagliflozin.html",
  "https://medi.ru/instrukciya/dzhardins_6916/": "instruction-dzhardins.html",
  "https://medi.ru/filters/doc_type/manuals/kardiologiya/": "filter-kardiologiya.html",
  "https://medi.ru/klinicheskie-rekomendatsii/khronicheskaya-serdechnaya-nedostatochnost_14015/": "guideline-hsn-v1.html",
};

export function fixtureHtml(file: string): string {
  return fs.readFileSync(path.join(FIXTURES, file), "utf8");
}

/** Deterministic driver over fixture files. Unknown URLs are 404; `network` URLs fail like a reset connection. */
export class FixtureDriver implements BrowserDriver {
  readonly calls: string[] = [];
  constructor(public routes: Record<string, string> = { ...MEDI_FIXTURE_ROUTES }, readonly kind: "http" | "playwright" = "playwright", private readonly failing: readonly string[] = []) {}

  async available() { return { ok: true, reason: "fixture" }; }

  async open(url: string): Promise<PageSnapshot> {
    this.calls.push(url);
    if (this.failing.includes(url)) throw new SourceToolError("network", "ECONNRESET", url);
    const file = this.routes[url];
    const html = file ? fixtureHtml(file) : "<html><body>Not found</body></html>";
    return { requestedUrl: url, finalUrl: url, status: file ? 200 : 404, html, fetchedAt: "2026-10-19T10:00:00.000Z", driver: this.kind, durationMs: 1 };
  }

  async interact(url: string): Promise<PageSnapshot> {
    return this.open(url);
  }
}

/* ------------------------------------------------------------------ */
/* Acceptance example end to end over fixtures (no network).           */
/* ------------------------------------------------------------------ */


export const ACCEPTANCE_QUESTION = "Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?";

export async function registryStatuses(registry: ReturnType<typeof createSourceRegistry>): Promise<Record<SourceId, SourceStatusReport>> {
  const entries = await Promise.all(Object.values(registry).map(async adapter => [adapter.id, await adapter.status()] as const));
  return Object.fromEntries(entries) as Record<SourceId, SourceStatusReport>;
}

export const HFPEF_REVIEW = { ...fakeArticle("38000001", "Empagliflozin in heart failure with preserved ejection fraction: a systematic review"), journal: "Cochrane Database Syst Rev", publicationTypes: ["Systematic Review"], sortDate: "2024-05-01" };
export const HFPEF_ABSTRACT = { pmid: "38000001", sections: [{ label: "AUTHORS' CONCLUSIONS", text: "In people with HFpEF, SGLT2 inhibitors reduced the risk of hospitalisation for heart failure." }], conclusion: "In people with HFpEF, SGLT2 inhibitors reduced the risk of hospitalisation for heart failure.", conclusionLabel: "AUTHORS' CONCLUSIONS" };

export async function acceptanceGraph(options: { driver?: FixtureDriver; specialty?: "cardiology" | "therapy"; sessionId?: string } = {}) {
  const driver = options.driver ?? new FixtureDriver();
  const registry = createSourceRegistry({ browserDriver: driver, site: { minIntervalMs: 0 } });
  const specialty = options.specialty ?? "cardiology";
  const ctx = await testContext({ agentId: "reference", topics: [], specialty, text: ACCEPTANCE_QUESTION, job: "guidelines", pubmed: fakePubmed([HFPEF_REVIEW]), abstracts: fakeAbstracts([HFPEF_ABSTRACT]) });
  const intent = compileIntent(ACCEPTANCE_QUESTION, specialty);
  const statuses = await registryStatuses(registry);
  const plan = planSources({ intent, sources: descriptors(registry), statuses });
  const execution = await executePlan({ plan, intent, registry, ctx, sessionId: options.sessionId ?? "acceptance-test" });
  const graph = buildEvidenceGraph({ id: "graph-1", intent, plan, results: execution.results, descriptors: descriptors(registry), statuses, now: ctx.nowIso });
  return { graph, plan, execution, driver, intent, registry, ctx };
}
