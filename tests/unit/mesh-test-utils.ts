import fs from "node:fs";
import path from "node:path";
import type { BrowserDriver, PageSnapshot } from "@/server/mesh/browser/drivers";
import { SourceToolError } from "@/server/mesh/browser/errors";

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
