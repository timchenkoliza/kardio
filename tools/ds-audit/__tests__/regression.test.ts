import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditSite, buildReport, type SiteAudit } from "../audit";
import { resolveBaseline } from "../baseline/resolve";
import { runPipeline } from "../pipeline";
import { renderMarkdown } from "../publish/report-md";
import { StateStore } from "../state/store";
import type { Report } from "../types";
import { ds, fixture, ORIGIN, serve, YEAR } from "./helpers";

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });

const CLEAN = { "/cardiology/a": fixture("r09-good"), "/cardiology/b": fixture("r03-good") };
/** Same site with one artificial NEW violation: «мы» and a slug on page a. */
const WITH_NEW = { ...CLEAN, "/cardiology/a": fixture("r09-bad") };
/** Existing debt on page b that both sides share. */
const DEBT = { "/cardiology/a": fixture("r09-good"), "/cardiology/b": fixture("r03-bad") };
const DEBT_WITH_NEW = { ...DEBT, "/cardiology/a": fixture("r09-bad") };

const audit = (pages: Record<string, string>) => auditSite({ url: ORIGIN, routes: Object.keys(pages), viewports: ["desktop", "mobile"], year: YEAR, ds, setupContext: serve(pages) }, browser);

function report(current: SiteAudit, base: SiteAudit | null, status: Report["baseline_status"] = base ? "exact" : "unavailable"): Report {
  return buildReport({ audit: current, mode: "preview", commitSha: "head000", baseSha: "base000", baseline: { status, sha: base ? "base000" : null, url: base ? ORIGIN : null, findings: base?.findings ?? null }, now: new Date("2026-10-21T00:00:00Z") });
}

describe("regression gate", () => {
  it("existing DS debt alone keeps the gate green", async () => {
    const base = await audit(DEBT);
    const r = report(await audit(DEBT), base);
    expect(r.count_existing).toBeGreaterThan(0);
    expect(r.count_new).toBe(0);
    expect(r.gate.state).toBe("success");
  });

  it("an artificial NEW blocking violation fails the gate; existing debt stays EXISTING", async () => {
    const base = await audit(DEBT);
    const r = report(await audit(DEBT_WITH_NEW), base);
    const fresh = r.findings.filter(f => f.status === "NEW");
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every(f => f.id === "R-09" && f.pages[0] === "/cardiology/a")).toBe(true);
    expect(r.findings.some(f => f.status === "EXISTING" && f.id === "R-03")).toBe(true);
    expect(r.gate).toMatchObject({ state: "failure", advisory: false });
    expect(r.gate.blocking_new).toBe(fresh.filter(f => f.blocking).length);
  });

  it("after the violation is removed it is classified FIXED and the gate is green", async () => {
    const base = await audit(WITH_NEW);
    const r = report(await audit(CLEAN), base);
    expect(r.count_new).toBe(0);
    expect(r.count_fixed).toBeGreaterThan(0);
    expect(r.fixed.every(f => f.status === "FIXED" && f.id === "R-09")).toBe(true);
    expect(r.gate.state).toBe("success");
  });

  it("a NEW warning (R-10) does not fail the gate", async () => {
    const base = await audit(CLEAN);
    const r = report(await audit({ ...CLEAN, "/cardiology/b": fixture("r10-bad") }), base);
    const fresh = r.findings.filter(f => f.status === "NEW");
    expect(fresh.map(f => f.viewport).sort()).toEqual(["desktop", "mobile"]);
    expect(fresh.every(f => f.id === "R-10" && !f.blocking)).toBe(true);
    expect(r.gate.state).toBe("success");
  });

  it("without a baseline the audit is advisory: success, never a false failure", async () => {
    const r = report(await audit(WITH_NEW), null);
    expect(r.gate).toMatchObject({ state: "success", advisory: true });
    expect(r.baseline_status).toBe("unavailable");
  });

  it("baseline findings on pages not audited this time are not reported as FIXED", async () => {
    const base = await audit(WITH_NEW);
    const current = await auditSite({ url: ORIGIN, routes: ["/cardiology/b"], viewports: ["desktop", "mobile"], year: YEAR, ds, setupContext: serve(WITH_NEW) }, browser);
    const r = report(current, base);
    expect(r.count_fixed).toBe(0);
    expect(r.not_compared).toBeGreaterThan(0);
  });
});

describe("determinism", () => {
  it("two identical audits give identical fingerprints, classification and report", async () => {
    const base = await audit(DEBT);
    const first = report(await audit(DEBT_WITH_NEW), base);
    const second = report(await audit(DEBT_WITH_NEW), base);
    expect(second.findings.map(f => [f.fingerprint, f.status])).toEqual(first.findings.map(f => [f.fingerprint, f.status]));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("the origin of the deployment is not part of the fingerprint (preview vs production)", async () => {
    const a = await audit(DEBT);
    const b = await auditSite({ url: "http://other-host.test", routes: Object.keys(DEBT), viewports: ["desktop", "mobile"], year: YEAR, ds, setupContext: async context => {
      await context.route("http://other-host.test/**", async route => {
        const { pathname } = new URL(route.request().url());
        await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: DEBT[pathname as keyof typeof DEBT] });
      });
    } }, browser);
    expect(b.findings.map(f => f.fingerprint)).toEqual(a.findings.map(f => f.fingerprint));
  });
});

describe("baseline resolution and state", () => {
  it("stored baseline → exact; known deployment → recomputed; nothing → unavailable", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ds-audit-state-"));
    const store = new StateStore(dir);
    const current = await audit(CLEAN);
    const auditBase = () => audit(DEBT);

    const none = await resolveBaseline({ baseSha: "aaaa111", versions: current.versions, store, auditBase });
    expect(none.status).toBe("unavailable");

    store.recordDeployment({ sha: "aaaa111", url: ORIGIN, environment: "production", project: "kardio", observed_at: "2026-10-21T00:00:00Z" });
    const recomputed = await resolveBaseline({ baseSha: "aaaa111", versions: current.versions, store, auditBase });
    expect(recomputed.status).toBe("recomputed");

    store.saveBaseline(buildReport({ audit: await audit(DEBT), mode: "baseline", commitSha: "aaaa111", baseSha: null, baseline: { status: "not_applicable", sha: null, url: null, findings: null } }));
    const exact = await resolveBaseline({ baseSha: "aaaa111", versions: current.versions, store, auditBase: () => { throw new Error("must not re-audit"); } });
    expect(exact.status).toBe("exact");
    expect(exact.findings?.length).toBeGreaterThan(0);

    // A different auditor version does not reuse the stored report.
    const other = await resolveBaseline({ baseSha: "aaaa111", versions: { ...current.versions, auditor_version: "9.9.9+x" }, store, auditBase });
    expect(other.status).toBe("recomputed");
  });

  it("pipeline with --baseline writes report.json/report.md with versions, SHAs and counts", async () => {
    const out = mkdtempSync(path.join(tmpdir(), "ds-audit-out-"));
    const baseFile = path.join(out, "base.json");
    writeFileSync(baseFile, JSON.stringify(report(await audit(DEBT), null)));
    const { report: r } = await runPipeline({ url: ORIGIN, routes: Object.keys(DEBT_WITH_NEW), viewports: ["desktop", "mobile"], outDir: out, mode: "manual", commitSha: "head111", baseSha: "base111", baselineFile: baseFile, noAi: true, year: YEAR, setupContext: serve(DEBT_WITH_NEW) }, browser);
    const json = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8")) as Report;
    for (const key of ["ds_version", "ruleset_version", "auditor_version", "commit_sha", "base_sha", "preview_url", "count_new", "count_existing", "count_fixed"] as const) expect(json[key]).not.toBeUndefined();
    expect(json.commit_sha).toBe("head111");
    expect(json.base_sha).toBe("base111");
    expect(r.gate.state).toBe("failure");
    expect(json.semantic.mode).toBe("skipped");
    const md = readFileSync(path.join(out, "report.md"), "utf8");
    expect(md).toContain("| № | P | Страницы | Что не так | Правило DS | Что сделать | Где искать | Проверка |");
    expect(md).toContain("Новые — блокируют мерж");
    expect(renderMarkdown(r, { limit: 1 })).toContain("<!-- ds-audit -->");
  });
});

describe("protected deployments", () => {
  it("a redirect to another host (Vercel login) is a page-load failure, not a page to audit", async () => {
    // A real HTTP server answers like a protected Vercel deployment: 302 to a login page on another host.
    const login = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><html lang=en><title>Login</title><h1>Log in</h1></html>"); });
    await new Promise<void>(resolve => login.listen(0, "127.0.0.1", resolve));
    const loginPort = (login.address() as AddressInfo).port;
    const site = createServer((req, res) => { res.writeHead(302, { location: `http://localhost:${loginPort}/sso-api?url=${encodeURIComponent(req.url ?? "/")}` }); res.end(); });
    await new Promise<void>(resolve => site.listen(0, "127.0.0.1", resolve));
    try {
      const audit = await auditSite({ url: `http://127.0.0.1:${(site.address() as AddressInfo).port}`, routes: ["/cardiology"], viewports: ["desktop"], year: YEAR, ds }, browser);
      expect(audit.findings.map(f => f.id)).toEqual(["R-00"]);
      expect(audit.findings[0].fact).toContain(`localhost:${loginPort}/sso-api`);
    } finally {
      site.close();
      login.close();
    }
  });

  it("the bypass secret reaches the deployment origin and never a third party", async () => {
    const seen: Array<[string, string | undefined]> = [];
    const page = fixture("r09-good").replace("</main>", `<img src="http://third.test/pixel.gif" alt="Пиксель" width="1" height="1"></main>`);
    await auditSite({ url: ORIGIN, routes: ["/cardiology"], viewports: ["desktop"], year: YEAR, ds, bypassSecret: "test-secret", setupContext: async context => {
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        seen.push([url.origin, route.request().headers()["x-vercel-protection-bypass"]]);
        if (url.origin === ORIGIN) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: page });
        return route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAAAAACw=", "base64") });
      });
    } }, browser);
    expect(seen.filter(([origin]) => origin === ORIGIN).every(([, header]) => header === "test-secret")).toBe(true);
    expect(seen.some(([origin]) => origin === ORIGIN)).toBe(true);
    expect(seen.filter(([origin]) => origin === "http://third.test").every(([, header]) => header === undefined)).toBe(true);
  });
});
