import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

/**
 * Same screens on two builds for the agent MVP comparison (docs/agent-mvp).
 *   npx tsx scripts/agent-mvp-screenshots.ts <baseUrl> <outDir> [name,name]
 */
const base = process.argv[2];
const outDir = process.argv[3];
const only = process.argv[4]?.split(",");
const QUESTION = process.env.SHOT_QUESTION ?? "Апиксабан у пожилых с фибрилляцией предсердий и сниженной функцией почек: что известно о безопасности?";
const VIEWPORTS = [{ name: "390", width: 390, height: 844 }, { name: "1440", width: 1440, height: 900 }];

async function ask(page: Page) {
  const box = page.locator("textarea").first();
  await box.waitFor({ timeout: 15000 });
  await box.fill(QUESTION);
  const before = page.url();
  const submit = page.locator("form button[type=submit]").first();
  if (await submit.count()) await submit.click(); else await box.press("Enter");
  await page.waitForURL(url => url.toString() !== before, { timeout: 30000 }).catch(() => {});
  // wait for a finished run: no pending/running markers for up to 120 s
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const busy = await page.locator("[data-state=running], [data-status=running], [aria-busy=true], .is-running").count();
    if (!busy) break;
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: "networkidle" }).catch(() => {});
  }
  await page.waitForTimeout(1500);
}

async function research(page: Page) {
  const question = process.env.SHOT_RESEARCH ?? "ПОАК у пожилых с фибрилляцией предсердий";
  await page.locator("textarea").first().fill(question);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL(/run=/, { timeout: 120000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
}

const PAGES: Array<{ name: string; path: string; run?: (page: Page) => Promise<void> }> = [
  { name: "home", path: "/cardiology" },
  { name: "agents", path: "/cardiology/agents" },
  { name: "agent-drugs", path: "/cardiology/agents/drugs" },
  { name: "agent-guidelines", path: "/cardiology/agents/guidelines" },
  { name: "agent-research", path: "/cardiology/agents/research" },
  { name: "materials", path: "/cardiology/materials" },
  { name: "settings", path: "/cardiology/settings" },
  { name: "answer", path: "/cardiology", run: ask },
  { name: "job-research", path: "/cardiology/ask?job=research" },
  { name: "research-result", path: "/cardiology/agents/research", run: research },
  { name: "job-drug", path: "/cardiology/ask?job=drug" },
];

await mkdir(outDir, { recursive: true });
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
      const file = join(outDir, `${target.name}-${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      console.log(`${target.name}-${vp.name} status=${res?.status()} url=${page.url().replace(base, "")} height=${height} ms=${Date.now() - started}`);
    } catch (error) {
      console.log(`${target.name}-${vp.name} ERROR ${(error as Error).message.split("\n")[0]}`);
    }
  }
  await context.close();
}
await browser.close();
