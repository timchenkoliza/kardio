import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditSite } from "../audit";
import type { Viewport } from "../types";
import { ds, fixture, ORIGIN, serve, YEAR } from "./helpers";

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });

async function findingsFor(rule: string, name: string, options: { route?: string; viewports?: Viewport[] } = {}) {
  const route = options.route ?? "/cardiology/fixture";
  const audit = await auditSite({ url: ORIGIN, routes: [route], viewports: options.viewports ?? ["desktop"], year: YEAR, ds, setupContext: serve({ [route]: fixture(name) }) }, browser);
  return audit.findings.filter(f => f.id === rule);
}

/** One bad and one good page per rule; the bad one must trigger the rule, the good one must not. */
const CASES: Array<{ rule: string; file: string; route?: string; viewports?: Viewport[] }> = [
  { rule: "R-01", file: "r01" },
  { rule: "R-02", file: "r02" },
  { rule: "R-03", file: "r03" },
  { rule: "R-04", file: "r04" },
  { rule: "R-05", file: "r05", viewports: ["mobile"] },
  { rule: "R-06", file: "r06" },
  { rule: "R-07", file: "r07" },
  { rule: "R-08", file: "r08" },
  { rule: "R-09", file: "r09" },
  { rule: "R-10", file: "r10" },
  { rule: "R-11", file: "r11" },
  { rule: "R-12", file: "r12", route: "/oncology/fixture" },
  { rule: "R-13", file: "r13" },
];

describe("deterministic rules on HTML fixtures", () => {
  for (const c of CASES) {
    it(`${c.rule}: bad fixture is flagged`, async () => {
      expect((await findingsFor(c.rule, `${c.file}-bad`, c)).length).toBeGreaterThan(0);
    });
    it(`${c.rule}: good fixture is clean`, async () => {
      expect(await findingsFor(c.rule, `${c.file}-good`, c)).toEqual([]);
    });
  }

  it("R-00: a page that answers 500 is a blocking finding", async () => {
    const audit = await auditSite({ url: ORIGIN, routes: ["/cardiology/broken"], viewports: ["desktop"], year: YEAR, ds, setupContext: serve({ "/cardiology/broken": 500 }) }, browser);
    expect(audit.findings.map(f => [f.id, f.blocking])).toEqual([["R-00", true]]);
  });

  it("every good fixture is clean for every rule", async () => {
    const pages = Object.fromEntries(CASES.map(c => [c.route ?? `/cardiology/${c.file}`, fixture(`${c.file}-good`)]));
    const routes = Object.keys(pages);
    const audit = await auditSite({ url: ORIGIN, routes, viewports: ["desktop", "mobile"], year: YEAR, ds, setupContext: serve(pages) }, browser);
    expect(audit.findings.map(f => `${f.id} ${f.pages} ${f.fact}`)).toEqual([]);
  });

  it("R-02: white label on accent in the primary button (14 px / 600) is a warning, not an error", async () => {
    const html = fixture("r02-good").replace("</main>", `<button class="ws-button is-primary" type="button" style="background: var(--ws-accent); color: var(--ws-inverse-text); font-size: 14px; font-weight: 600; line-height: 1.35">Найти</button></main>`);
    const audit = await auditSite({ url: ORIGIN, routes: ["/cardiology/x"], viewports: ["desktop"], year: YEAR, ds, setupContext: serve({ "/cardiology/x": html }) }, browser);
    const contrast = audit.findings.filter(f => f.id === "R-02");
    expect(contrast).toHaveLength(1);
    expect(contrast[0].blocking).toBe(false);
  });
});
