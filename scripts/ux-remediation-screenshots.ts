import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

/**
 * Before/after evidence for docs/ux-remediation: the same physician paths at
 * 390 / 768 / 1440, with page-level horizontal overflow measured per screen.
 *   npx tsx scripts/ux-remediation-screenshots.ts <baseUrl> <outDir> [name,name]
 */
const base = process.argv[2];
const outDir = process.argv[3];
const only = process.argv[4]?.split(",");
const VIEWPORTS = [{ name: "390", width: 390, height: 844 }, { name: "768", width: 768, height: 1024 }, { name: "1440", width: 1440, height: 900 }];

async function submit(page: Page, text: string) {
  const box = page.locator("textarea").first();
  await box.waitFor({ timeout: 15000 });
  await box.fill(text);
  const before = page.url();
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL(url => url.toString() !== before, { timeout: 60000 }).catch(() => {});
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const state = await page.locator("[data-run-state]").first().getAttribute("data-run-state").catch(() => null);
    if (!state || state === "done" || state === "failed" || state === "expired" || state === "blocked") break;
    await page.waitForTimeout(1500);
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
}

async function typeOnly(page: Page, text: string) {
  const box = page.locator("textarea").first();
  await box.waitFor({ timeout: 15000 });
  await box.fill(text);
  await page.waitForTimeout(600);
}

async function openFirstFeedCard(page: Page) {
  const link = page.locator(".pt-card-link").first();
  await link.waitFor({ timeout: 15000 });
  await link.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
}

const PAGES: Array<{ name: string; path: string; run?: (page: Page) => Promise<void> }> = [
  { name: "home", path: "/cardiology" },
  { name: "home-typed-hsn", path: "/cardiology", run: page => typeOnly(page, "ХСН") },
  { name: "answer-hsn", path: "/cardiology", run: page => submit(page, "ХСН") },
  { name: "answer-unrecognised", path: "/cardiology", run: page => submit(page, "???") },
  { name: "answer-question", path: "/cardiology", run: page => submit(page, "Апиксабан у пожилых с фибрилляцией предсердий и сниженной функцией почек: что известно о безопасности?") },
  { name: "agents", path: "/cardiology/agents" },
  { name: "agent-research", path: "/cardiology/agents/research" },
  { name: "research-result", path: "/cardiology/agents/research", run: page => submit(page, "ПОАК у пожилых с фибрилляцией предсердий") },
  { name: "job-drug", path: "/cardiology/ask?job=drug" },
  { name: "feed-item", path: "/cardiology", run: openFirstFeedCard },
  { name: "materials", path: "/cardiology/materials" },
  { name: "settings", path: "/cardiology/settings" },
  { name: "anonymizer", path: "/cardiology/anonymizer" },
];

await mkdir(outDir, { recursive: true });
const report: string[] = [];
const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "ru-RU", isMobile: vp.width < 768, hasTouch: vp.width < 768, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  for (const target of PAGES) {
    if (only && !only.includes(target.name)) continue;
    const started = Date.now();
    try {
      const res = await page.goto(`${base}${target.path}`, { waitUntil: "networkidle", timeout: 60000 });
      await target.run?.(page);
      await page.screenshot({ path: join(outDir, `${target.name}-${vp.name}.png`), fullPage: true });
      await page.screenshot({ path: join(outDir, `${target.name}-${vp.name}-fold.png`), fullPage: false });
      const m = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth - window.innerWidth }));
      const line = `${target.name}-${vp.name} status=${res?.status()} url=${page.url().replace(base, "")} height=${m.height} overflowX=${m.overflow} ms=${Date.now() - started}`;
      report.push(line);
      console.log(line);
    } catch (error) {
      const line = `${target.name}-${vp.name} ERROR ${(error as Error).message.split("\n")[0]}`;
      report.push(line);
      console.log(line);
    }
  }
  await context.close();
}
await browser.close();
await writeFile(join(outDir, "report.txt"), `${report.join("\n")}\n`);
