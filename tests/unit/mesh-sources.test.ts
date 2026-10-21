import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileIntent } from "@/lib/mesh/intent";
import { isAllowedByRobots, parseRobots } from "@/server/mesh/browser/robots";
import { BrowserSourceTool, resetBrowserToolState } from "@/server/mesh/browser/tool";
import { createMediAdapter, extractFromHtml, guidelineExtractor, instructionExtractor, MEDI_DESCRIPTOR, MEDI_SITE, mediInnSlug, parseMediDate } from "@/server/mesh/sources/medi";
import { createSourceRegistry } from "@/server/mesh/sources/registry";
import type { SourceRequest } from "@/server/mesh/sources/types";
import { testContext } from "./agent-test-utils";
import { FixtureDriver, fixtureHtml, MEDI_FIXTURE_ROUTES } from "./mesh-test-utils";

const ACCEPTANCE = "Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?";
const FAST = { minIntervalMs: 0 };

async function request(operation: SourceRequest["operation"], requirement: SourceRequest["requirement"], text = ACCEPTANCE): Promise<SourceRequest> {
  const ctx = await testContext({ agentId: "reference", topics: [], text, job: "guidelines" });
  return { stepId: "step-1", operation, requirement, intent: compileIntent(text, "cardiology"), ctx };
}

beforeEach(() => resetBrowserToolState());
afterEach(() => { delete process.env.MEDI_DISABLED; });

describe("BrowserSourceTool — generic and policy-bound", () => {
  it("parses robots.txt for all agents and refuses disallowed paths before any page is opened", async () => {
    const rules = parseRobots(fixtureHtml("robots.txt"));
    expect(rules).toContain("/search");
    expect(rules).not.toContain("/");
    expect(isAllowedByRobots("https://medi.ru/search/?q=x", rules)).toBe(false);
    expect(isAllowedByRobots("https://medi.ru/analogi-mnn/empagliflozin/", rules)).toBe(true);

    const driver = new FixtureDriver();
    const tool = new BrowserSourceTool({ ...MEDI_SITE, ...FAST, allowedPathPrefixes: ["/"] }, driver);
    await expect(tool.open("https://medi.ru/search/?Search%5Bq%5D=x")).rejects.toMatchObject({ code: "robots_disallow" });
    expect(driver.calls.filter(url => !url.endsWith("robots.txt"))).toEqual([]);
  });

  it("refuses pages outside the recipe's allowed paths and other hosts", async () => {
    const tool = new BrowserSourceTool({ ...MEDI_SITE, ...FAST }, new FixtureDriver());
    await expect(tool.open("https://medi.ru/news/")).rejects.toMatchObject({ code: "outside_allowed_paths" });
    await expect(tool.open("https://example.org/analogi-mnn/x/")).rejects.toMatchObject({ code: "outside_allowed_paths" });
  });

  it("caches pages and records provenance of every visit", async () => {
    const driver = new FixtureDriver();
    const tool = new BrowserSourceTool({ ...MEDI_SITE, ...FAST }, driver);
    await tool.open("https://medi.ru/analogi-mnn/empagliflozin/");
    await tool.open("https://medi.ru/analogi-mnn/empagliflozin/");
    expect(driver.calls.filter(url => url.includes("analogi-mnn"))).toHaveLength(1);
    expect(tool.provenance().visits.map(visit => visit.cached)).toEqual([false, true]);
  });
});

describe("MEDI adapter — a source, not an agent", () => {
  it("maps lexicon INNs to MEDI pages and parses MEDI dates", () => {
    expect(mediInnSlug("empagliflozin")).toBe("empagliflozin");
    expect(mediInnSlug("acetaminophen")).toBe("paracetamol");
    expect(mediInnSlug("insulin glargine")).toBeNull();
    expect(parseMediDate("13 дек. 2022 г..")).toBe("2022-12-13");
  });

  it("declares its usage policy: robots-bound, excerpts with attribution, open licensing questions", () => {
    expect(MEDI_DESCRIPTOR.usagePolicy.robots?.disallow).toContain("/search");
    expect(MEDI_DESCRIPTOR.usagePolicy.reuse).toBe("excerpt_with_attribution");
    expect(MEDI_DESCRIPTOR.usagePolicy.agreement).toBe("none");
    expect(MEDI_DESCRIPTOR.usagePolicy.openQuestions.length).toBeGreaterThanOrEqual(3);
    expect(MEDI_DESCRIPTOR.authority).toBe("professional");
  });

  it("drug reference: INN page → mono-component product → instruction, with verbatim secondary-labelled claims", async () => {
    const driver = new FixtureDriver();
    const medi = createMediAdapter({ driver, site: FAST });
    const result = await medi.execute(await request("drug_reference", "russian_drug_reference"));
    expect(result.invocation.outcome).toBe("ok");
    expect(result.invocation.status).toBe("LIVE");
    expect(result.invocation.urls).toEqual(["https://medi.ru/analogi-mnn/empagliflozin/", "https://medi.ru/instrukciya/dzhardins_6916/"]);
    const instruction = result.documents.find(document => document.kind === "drug_instruction")!;
    expect(instruction.attributes.registration).toBe("ЛП-002735");
    expect(instruction.version.date).toBe("2022-12-13");
    const hf = instruction.claims.find(claim => claim.kind === "indication" && claim.entityIds.includes("nosology:cardiology/heart_failure"))!;
    expect(hf.polarity).toBe("positive");
    expect(hf.covers).toContain("cardiology/heart_failure/hfpef");
    expect(hf.method).toBe("verbatim");
    expect(hf.quote).toContain("независимо от фракции выброса");
    expect(hf.verification).toBe("PARTIALLY_SUPPORTED");
    expect(hf.verificationNote).toMatch(/ГРЛС/);
    for (const claim of instruction.claims) expect((claim.quote ?? "").length).toBeLessThanOrEqual(MEDI_DESCRIPTOR.usagePolicy.maxExcerptChars!);
    // The diabetes indication mentions HF outcomes in its body but is not an HF indication.
    expect(instruction.claims.find(claim => claim.statement.startsWith("Сахарный диабет"))?.entityIds).not.toContain("nosology:cardiology/heart_failure");
  });

  it("guideline discovery: specialty catalogue → adult guideline → metadata, currentness, subtype statement, absence of the drug", async () => {
    const medi = createMediAdapter({ driver: new FixtureDriver(), site: FAST });
    const result = await medi.execute(await request("guideline_discovery", "russian_guideline"));
    expect(result.invocation.outcome).toBe("ok");
    const guideline = result.documents[0];
    expect(guideline.url).not.toMatch(/u-detej/u);
    expect(guideline.attributes.guidelineId).toBe("КР156");
    const kinds = guideline.claims.map(claim => claim.kind);
    expect(kinds).toEqual(expect.arrayContaining(["guideline_metadata", "currentness", "guideline_statement", "drug_not_mentioned"]));
    const currentness = guideline.claims.find(claim => claim.kind === "currentness")!;
    expect(currentness.method).toBe("rule_derived");
    expect(currentness.statement).toMatch(/2019/u);
    const statement = guideline.claims.find(claim => claim.kind === "guideline_statement")!;
    expect(statement.polarity).toBe("negative");
    expect(statement.covers).toEqual(["cardiology/heart_failure/hfpef"]);
    // Only sections the answer needs keep text; every section keeps a fingerprint.
    expect(guideline.chunks.every(chunk => chunk.fingerprint.startsWith("sha256:"))).toBe(true);
    expect(guideline.chunks.filter(chunk => chunk.text).length).toBe(1);
  });

  it("fails explicitly when the page layout changes — no guessed result", async () => {
    const driver = new FixtureDriver({ ...MEDI_FIXTURE_ROUTES, "https://medi.ru/instrukciya/dzhardins_6916/": "instruction-layout-changed.html" });
    const result = await createMediAdapter({ driver, site: FAST }).execute(await request("drug_reference", "russian_drug_reference"));
    expect(result.invocation.outcome).toBe("failed");
    expect(result.invocation.errorCode).toMatch(/^layout_changed:medi\.instruction/u);
    expect(result.documents).toHaveLength(0);
    expect(() => extractFromHtml(instructionExtractor, fixtureHtml("instruction-layout-changed.html"), "https://medi.ru/instrukciya/x/")).toThrow(/layout_changed/u);
    expect(() => extractFromHtml(guidelineExtractor, fixtureHtml("instruction-layout-changed.html"), "https://medi.ru/klinicheskie-rekomendatsii/x/")).toThrow(/layout_changed/u);
  });

  it("network failures are failures; a missing INN page is an honest empty result", async () => {
    const failing = new FixtureDriver(MEDI_FIXTURE_ROUTES, "playwright", ["https://medi.ru/analogi-mnn/empagliflozin/"]);
    const failed = await createMediAdapter({ driver: failing, site: FAST }).execute(await request("drug_reference", "russian_drug_reference"));
    expect(failed.invocation.outcome).toBe("failed");
    expect(failed.invocation.errorCode).toMatch(/^network/u);
    const missing = await createMediAdapter({ driver: new FixtureDriver(), site: FAST }).execute(await request("drug_reference", "russian_drug_reference", "Дапаглифлозин при ХСН"));
    expect(missing.invocation.outcome).toBe("empty");
    expect(missing.documents).toHaveLength(0);
  });

  it("never automates MEDI's own search: article search is a hand-off with no page opened", async () => {
    const driver = new FixtureDriver();
    const result = await createMediAdapter({ driver, site: FAST }).execute(await request("professional_article_search", "professional_article"));
    expect(result.invocation.outcome).toBe("handoff");
    expect(result.invocation.errorCode).toBe("robots_disallow:/search");
    expect(driver.calls).toHaveLength(0);
  });

  it("reports its execution honestly: browser LIVE, HTTP LIMITED, disabled UNAVAILABLE", async () => {
    expect((await createMediAdapter({ driver: new FixtureDriver(MEDI_FIXTURE_ROUTES, "playwright") }).status()).status).toBe("LIVE");
    expect((await createMediAdapter({ driver: new FixtureDriver(MEDI_FIXTURE_ROUTES, "http") }).status())).toMatchObject({ status: "LIMITED", execution: "http" });
    expect((await createMediAdapter({ driver: null }).status()).status).toBe("UNAVAILABLE");
    process.env.MEDI_DISABLED = "1";
    expect((await createMediAdapter({ driver: new FixtureDriver() }).status()).status).toBe("UNAVAILABLE");
  });

  it("the registry exposes every source through one contract", async () => {
    const registry = createSourceRegistry({ browserDriver: new FixtureDriver() });
    for (const adapter of Object.values(registry)) {
      expect(adapter.provides.length).toBeGreaterThan(0);
      expect(["official", "primary", "professional", "secondary"]).toContain(adapter.authority);
      expect(typeof adapter.execute).toBe("function");
      expect(["LIVE", "LIMITED", "SNAPSHOT", "HANDOFF", "UNAVAILABLE"]).toContain((await adapter.status()).status);
    }
  });
});
