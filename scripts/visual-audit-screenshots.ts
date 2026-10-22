import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

/**
 * Screenshots of the key shell surfaces at 390 / 768 / 1440 for visual
 * acceptance. Writes PNGs to docs/visual-audit/<date>/ against the server in
 * PLAYWRIGHT_BASE_URL (default http://127.0.0.1:3000).
 *
 *   npx tsx scripts/visual-audit-screenshots.ts [outDir]
 */

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const outDir = process.argv[2] ?? join("docs", "visual-audit", new Date().toISOString().slice(0, 10));
const VIEWPORTS = [{ name: "390", width: 390, height: 844 }, { name: "768", width: 768, height: 1024 }, { name: "1440", width: 1440, height: 900 }];
const PAGES: Array<{ name: string; path: string; prepare?: (page: import("@playwright/test").Page) => Promise<void> }> = [
  { name: "home", path: "/cardiology" },
  { name: "home-mode-selected", path: "/cardiology", prepare: async page => { await page.getByRole("radio", { name: /Режим исследования/ }).click(); await page.getByRole("textbox", { name: "Что хотите узнать или сделать?" }).fill("Апиксабан: противопоказания и взаимодействия"); } },
  { name: "profile", path: "/cardiology/settings" },
  { name: "materials", path: "/cardiology/materials" },
  { name: "anonymizer", path: "/cardiology/anonymizer" },
  { name: "visual-audit", path: "/__visual-audit" },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: "ru-RU", hasTouch: viewport.width < 1024, isMobile: viewport.width < 768, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await context.newPage();
  for (const target of PAGES) {
    await page.goto(`${base}${target.path}`, { waitUntil: "networkidle" });
    await target.prepare?.(page);
    await page.waitForTimeout(300);
    const file = join(outDir, `${target.name}-${viewport.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
  await context.close();
}
await browser.close();
