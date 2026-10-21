import { describe, expect, it } from "vitest";
import { classify, computeGate } from "../baseline/classify";
import { resolveTrigger, type ResolveEnv } from "../context/resolve";
import { fingerprint, normalizeRoute } from "../identity/fingerprint";
import { selectorRoot } from "../rules/r11-css-tokens";
import { semanticCacheKey } from "../semantic/cache-key";
import { filterFacts } from "../semantic/fact-filter";
import { runSemantic } from "../semantic/run";
import { canonicalColor, normalizeValue } from "../tokens";
import type { Finding, PageSnapshot } from "../types";

const base = { ruleId: "R-05", identityVersion: 1, route: "/cardiology", viewport: "mobile", locator: "body button.ws-chip", evidenceKey: "" };

describe("fingerprint", () => {
  it("is deterministic and independent of origin, query and trailing slash", () => {
    expect(fingerprint(base)).toBe(fingerprint({ ...base }));
    expect(fingerprint({ ...base, route: "https://kardio-abc.vercel.app/cardiology/?x=1#y" })).toBe(fingerprint(base));
    expect(normalizeRoute("/cardiology/")).toBe("/cardiology");
  });
  it("changes with the violating thing, not with measurements", () => {
    expect(fingerprint({ ...base, locator: "body button.ws-composer-run" })).not.toBe(fingerprint(base));
    expect(fingerprint({ ...base, viewport: "desktop" })).not.toBe(fingerprint(base));
    expect(fingerprint({ ...base, identityVersion: 2 })).not.toBe(fingerprint(base));
    expect(fingerprint(base)).toMatch(/^R-05:[0-9a-f]{16}$/);
  });
});

const finding = (fp: string, over: Partial<Finding> = {}): Finding => ({ id: "R-09", priority: "P1", pages: ["/a"], viewport: "desktop", fact: "", rule: "", fix: "", where: "", check: "", blocking: true, fingerprint: fp, status: "NEW", layer: "deterministic", occurrences: 1, examples: [], ...over });

describe("classify and gate", () => {
  it("NEW / EXISTING / FIXED and only NEW blocking deterministic findings fail", () => {
    const result = classify([finding("x"), finding("y")], [finding("y"), finding("z")], { routes: ["/a"], viewports: ["desktop"] });
    expect(result.findings.map(f => [f.fingerprint, f.status])).toEqual([["x", "NEW"], ["y", "EXISTING"]]);
    expect(result.fixed.map(f => f.fingerprint)).toEqual(["z"]);
    expect(computeGate(result.findings, "exact").state).toBe("failure");
    expect(computeGate([finding("x", { blocking: false })], "exact").state).toBe("success");
    expect(computeGate([finding("x", { layer: "semantic" })], "exact").state).toBe("success");
    expect(computeGate([finding("x")], "unavailable")).toMatchObject({ state: "success", advisory: true });
  });
});

describe("tokens", () => {
  it("normalizes colours and numbers", () => {
    expect(canonicalColor("#FFF")).toBe("#ffffff");
    expect(canonicalColor("rgb(114 117 255 / 28%)")).toBe("#7275ff47");
    expect(normalizeValue("-.04em")).toBe(normalizeValue("-0.040em"));
    expect(normalizeValue("1.20")).toBe("1.2");
    expect(normalizeValue("{accent}")).toBe("var(--ws-accent)");
  });
  it("selector root keeps the meaningful compound", () => {
    expect(selectorRoot(".ws-app .ws-feed-card:hover")).toBe(".ws-feed-card");
    expect(selectorRoot('.ws-app[data-specialty="oncology"]')).toBe('.ws-app[data-specialty="oncology"]');
  });
});

const env: ResolveEnv = { eventName: "repository_dispatch", eventPath: undefined, project: "kardio", projectId: null, productionRef: "main", allowedHosts: [] };
const payload = (over: Record<string, unknown> = {}) => ({ action: "vercel.deployment.success", client_payload: { url: "kardio-abc.vercel.app", id: "dpl_1", environment: "preview", state: { type: "success" }, project: { name: "kardio", id: "prj" }, git: { ref: "feature", sha: "a".repeat(40), shortSha: "aaaaaaa" }, ...over } });

describe("trigger resolution", () => {
  it("accepts a Vercel preview success and normalizes the URL", () => {
    expect(resolveTrigger(env, payload())).toMatchObject({ kind: "preview", url: "https://kardio-abc.vercel.app", sha: "a".repeat(40) });
  });
  it("treats production from main as a baseline run", () => {
    expect(resolveTrigger(env, payload({ environment: "production", git: { ref: "main", sha: "b".repeat(40) } }))).toMatchObject({ kind: "production" });
    expect(resolveTrigger(env, payload({ environment: "production", git: { ref: "other", sha: "b".repeat(40) } })).kind).toBe("ignored");
  });
  it("rejects other projects, foreign hosts and other events", () => {
    expect(resolveTrigger(env, payload({ project: { name: "evil", id: "x" } })).kind).toBe("ignored");
    expect(resolveTrigger(env, payload({ url: "https://evil.example.com" })).kind).toBe("ignored");
    expect(resolveTrigger(env, { ...payload(), action: "vercel.deployment.error" }).kind).toBe("ignored");
    expect(resolveTrigger({ ...env, projectId: "prj-other" }, payload()).kind).toBe("ignored");
  });
  it("workflow_dispatch needs a url; baseline mode needs a sha", () => {
    const wd = { ...env, eventName: "workflow_dispatch" };
    expect(resolveTrigger(wd, { inputs: { url: "https://kardio-eta.vercel.app", mode: "manual", pr_number: "12" } })).toMatchObject({ kind: "manual", pr: 12 });
    expect(resolveTrigger(wd, { inputs: { url: "https://kardio-eta.vercel.app", mode: "baseline" } }).kind).toBe("ignored");
    expect(resolveTrigger(wd, { inputs: {} }).kind).toBe("ignored");
  });
});

const snapshot = (over: Partial<PageSnapshot> = {}): PageSnapshot => ({ route: "/a", viewport: "desktop", url: "", status: 200, error: null, title: "", lang: "ru", bodyText: "Мы показываем материал", texts: [{ component: "main p.ws-muted", instance: "", tag: "p", text: "Мы показываем материал", raw: "Мы показываем материал", fontSize: 13, lineHeight: 18, lineHeightRatio: 1.4, fontWeight: 400, colorRaw: null, fg: null, bg: null, bgLayers: [], bgImage: false, contrast: null, inSvg: false, disabled: false, primaryButton: false, role: "other", excluded: false, kind: "text" }], backgrounds: [], targets: [], headings: [], h1Count: 1, images: [], navLinks: [], css: [], focus: [], axe: [], screenshot: null, ...over });

describe("semantic layer (prepared, off in v1)", () => {
  it("never runs: returns a skipped summary", () => {
    expect(runSemantic({ mode: "pr", noAi: false, routes: ["/a"] })).toMatchObject({ mode: "skipped", cost_usd: 0 });
    expect(runSemantic({ mode: "deep", noAi: true, routes: [] }).skipped_reason).toContain("--no-ai");
  });
  it("fact filter keeps only findings with a real selector and verbatim quote", () => {
    const raw = { id: "AI-01", priority: "P2" as const, pages: ["/a"], viewport: "desktop" as const, fact: "", rule: "", fix: "", check: "" };
    const { kept, dropped } = filterFacts([
      { ...raw, selector: "main p.ws-muted", quote: "Мы показываем" },
      { ...raw, selector: "main p.ws-muted", quote: "такого текста нет" },
      { ...raw, selector: "div.unknown", quote: "Мы показываем" },
    ], [snapshot()]);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(2);
  });
  it("cache key follows page content, not the commit", () => {
    const input = { model: "m", mode: "pr", effort: "medium", dsVersion: "1", rulesetVersion: "1", route: "/a", snapshots: [snapshot()], deterministic: [] };
    expect(semanticCacheKey(input)).toBe(semanticCacheKey({ ...input }));
    expect(semanticCacheKey({ ...input, snapshots: [snapshot({ texts: [] })] })).not.toBe(semanticCacheKey(input));
  });
});

describe("vercel protection bypass", () => {
  it("adds the header only for the audited origin and only when a secret is set", async () => {
    const { bypassHeaders } = await import("../collect/browser");
    expect(bypassHeaders("https://kardio-x.vercel.app/cardiology", "https://kardio-x.vercel.app", "s")).toEqual({ "x-vercel-protection-bypass": "s", "x-vercel-set-bypass-cookie": "true" });
    expect(bypassHeaders("https://fonts.example.com/a.woff2", "https://kardio-x.vercel.app", "s")).toEqual({});
    expect(bypassHeaders("https://kardio-x.vercel.app/", "https://kardio-x.vercel.app", null)).toEqual({});
  });
});
