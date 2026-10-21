import { mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { AXE_EXCLUDED_RULES, AXE_TAGS, MAX_TAB_STOPS, NAVIGATION, TOOL_DIR, VIEWPORTS } from "../config";
import type { AxeViolation, FocusItem, PageSnapshot, Viewport } from "../types";

const IN_PAGE = path.join(TOOL_DIR, "collect/in-page.js");

export interface CollectOptions {
  /** Origin of the deployment, e.g. https://kardio-eta.vercel.app */
  baseUrl: string;
  routes: string[];
  viewports?: Viewport[];
  screenshotDir?: string | null;
  /** Tests install request routing here to serve fixtures. */
  setupContext?: (context: BrowserContext) => Promise<void>;
}

const emptySnapshot = (route: string, viewport: Viewport, url: string, error: string, status: number | null = null): PageSnapshot => ({
  route, viewport, url, status, error, title: "", lang: null, bodyText: "", texts: [], backgrounds: [], targets: [], headings: [], h1Count: 0, images: [], navLinks: [], css: [], focus: [], axe: [], screenshot: null,
});

async function runAxe(page: Page): Promise<AxeViolation[]> {
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).disableRules(AXE_EXCLUDED_RULES).analyze();
  const targets = result.violations.flatMap(v => v.nodes.map(node => node.target.map(String).join(" ")));
  const components = await page.evaluate((selectors: string[]) => selectors.map(selector => (window as unknown as { __dsAudit: { locateSelector(s: string): string | null } }).__dsAudit.locateSelector(selector)), targets);
  let index = 0;
  return result.violations.map(v => ({
    id: v.id, impact: v.impact ?? null, help: v.help, tags: v.tags,
    nodes: v.nodes.map(node => ({ target: node.target.map(String).join(" "), component: components[index++] ?? null, html: node.html.slice(0, 200) })),
  }));
}

/** Tabs through the page until focus comes back to an element already visited (one full cycle). */
async function walkFocus(page: Page): Promise<FocusItem[]> {
  const seen = new Map<string, FocusItem>();
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur?.(); window.scrollTo(0, 0); });
  let empty = 0;
  for (let i = 0; i < MAX_TAB_STOPS && empty < 3; i++) {
    await page.keyboard.press("Tab");
    const probe = await page.evaluate(() => (window as unknown as { __dsAudit: { focusProbe(): (FocusItem & { revisit: boolean }) | null } }).__dsAudit.focusProbe());
    if (!probe) { empty++; continue; }
    if (probe.revisit) break;
    const { revisit: _revisit, ...item } = probe;
    if (!seen.has(item.instance)) seen.set(item.instance, item);
  }
  return [...seen.values()].sort((a, b) => a.instance.localeCompare(b.instance));
}

async function snapshotPage(context: BrowserContext, baseUrl: string, route: string, viewport: Viewport, screenshotDir: string | null): Promise<PageSnapshot> {
  const url = new URL(route, baseUrl).toString();
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: NAVIGATION.waitUntil, timeout: NAVIGATION.timeoutMs });
    const status = response?.status() ?? null;
    if (status !== null && status >= 400) return emptySnapshot(route, viewport, url, `HTTP ${status}`, status);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(NAVIGATION.settleMs);
    const data = await page.evaluate(() => (window as unknown as { __dsAudit: { collect(): Omit<PageSnapshot, "route" | "viewport" | "url" | "status" | "error" | "focus" | "axe" | "screenshot"> } }).__dsAudit.collect());
    const axe = await runAxe(page);
    const focus = viewport === "desktop" ? await walkFocus(page) : [];
    let screenshot: string | null = null;
    if (screenshotDir) {
      mkdirSync(screenshotDir, { recursive: true });
      screenshot = path.join(screenshotDir, `${viewport}${route.replace(/\//g, "_") || "_root"}.png`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: screenshot, fullPage: false });
    }
    return { route, viewport, url, status, error: null, ...data, focus, axe, screenshot };
  } catch (error) {
    return emptySnapshot(route, viewport, url, String(error instanceof Error ? error.message : error).split("\n")[0].slice(0, 200));
  } finally {
    await page.close();
  }
}

export async function openContext(browser: Browser, viewport: Viewport, setup?: CollectOptions["setupContext"]): Promise<BrowserContext> {
  const v = VIEWPORTS.find(item => item.name === viewport);
  if (!v) throw new Error(`Unknown viewport ${viewport}`);
  const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.isMobile, hasTouch: v.hasTouch, deviceScaleFactor: 1, locale: "ru-RU", timezoneId: "Europe/Moscow", reducedMotion: "reduce", colorScheme: "light" });
  await context.addInitScript({ path: IN_PAGE });
  if (setup) await setup(context);
  return context;
}

/** Sequential on purpose: one page at a time keeps load on the deployment low and results stable. */
export async function collectSnapshots(options: CollectOptions, browser?: Browser): Promise<PageSnapshot[]> {
  const own = !browser;
  const instance = browser ?? await chromium.launch();
  const snapshots: PageSnapshot[] = [];
  try {
    for (const viewport of options.viewports ?? (["desktop", "mobile"] as Viewport[])) {
      const context = await openContext(instance, viewport, options.setupContext);
      try {
        for (const route of options.routes) snapshots.push(await snapshotPage(context, options.baseUrl, route, viewport, options.screenshotDir ?? null));
      } finally {
        await context.close();
      }
    }
  } finally {
    if (own) await instance.close();
  }
  return snapshots;
}

export { chromium };
