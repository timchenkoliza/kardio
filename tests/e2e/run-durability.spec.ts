import { expect, test, type Page } from "@playwright/test";

/**
 * Release gate: a run id handed to the browser is durable.
 *
 * Submit → result shell at once → progress → first validated module →
 * completion; then refresh, open the same URL in another tab, open it on
 * another server instance (PLAYWRIGHT_SECOND_BASE_URL — the same deployment
 * when testing a Preview), and reopen it later. The same run must be there
 * every time; nothing may depend on the memory of one server instance.
 */

const QUESTION = "Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?";
const CONTENT_MODULES = '[data-module="key_takeaway"], [data-module="recommendation_delta"], [data-module="drug_reference"], [data-module="evidence"]';

async function expectSameRun(page: Page, runId: string) {
  await expect(page.locator("[data-run-unavailable]")).toHaveCount(0);
  await expect(page.locator("[data-run-state]")).toBeVisible();
  await expect(page.locator(".pt-question")).toContainText(QUESTION);
  expect(new URL(page.url()).searchParams.get("run")).toBe(runId);
}

test("a run survives refresh, another tab, another instance and reopening later", async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(150_000);
  const second = process.env.PLAYWRIGHT_SECOND_BASE_URL ?? baseURL!;
  await page.goto("/cardiology");
  await page.getByRole("textbox", { name: "Что хотите узнать или сделать?" }).fill(QUESTION);

  const t0 = Date.now();
  await page.locator(".pt-input .ws-composer-run").click();
  await expect(page).toHaveURL(/\/cardiology\/ask\?run=run-/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Клинические рекомендации" })).toBeVisible();
  const shellMs = Date.now() - t0;
  const runId = new URL(page.url()).searchParams.get("run")!;

  // Progress is visible while sources are checked, unless the run already finished.
  const progress = page.locator("[data-run-progress]");
  const state = await page.locator("[data-run-state]").getAttribute("data-run-state");
  if (state !== "done") await expect(progress).toBeVisible();

  await expect(page.locator(CONTENT_MODULES).first()).toBeVisible({ timeout: 60_000 });
  const firstModuleMs = Date.now() - t0;
  // The follow-up input keeps what the physician typed while modules arrive.
  await page.getByRole("textbox", { name: "Следующий вопрос" }).fill("черновик уточнения");

  await expect(page.locator('[data-run-state="done"]')).toBeVisible({ timeout: 90_000 });
  const completeMs = Date.now() - t0;
  await expect(page.getByRole("textbox", { name: "Следующий вопрос" })).toHaveValue("черновик уточнения");
  const modules = await page.locator("[data-module]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-module")));
  expect(modules).toContain("sources");
  expect(modules.at(-1)).toBe("next_actions");

  // 1. Refresh.
  await page.reload();
  await expectSameRun(page, runId);
  await expect(page.locator('[data-run-state="done"]')).toBeVisible();
  expect(await page.locator("[data-module]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-module")))).toEqual(modules);

  // 2. Another tab.
  const tab = await context.newPage();
  await tab.goto(page.url());
  await expectSameRun(tab, runId);

  // 3. Another server instance (same deployment on Preview).
  const other = await context.newPage();
  await other.goto(new URL(`/cardiology/ask?run=${runId}`, second).toString());
  await expectSameRun(other, runId);
  await expect(other.locator('[data-run-state="done"]')).toBeVisible();

  // 4. Reopen later.
  await page.waitForTimeout(3_000);
  const later = await context.newPage();
  await later.goto(new URL(`/cardiology/ask?run=${runId}`, baseURL).toString());
  await expectSameRun(later, runId);
  expect(await later.locator("[data-module]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-module")))).toEqual(modules);

  // An unknown run is «not found», never «another device».
  await later.goto("/cardiology/ask?run=run-00000000-0000-4000-8000-000000000000");
  await expect(later.locator('[data-run-unavailable="run_not_found"]')).toBeVisible();

  const timings = { runId, shellMs, firstModuleMs, completeMs, modules, second };
  await testInfo.attach("timings", { body: JSON.stringify(timings, null, 2), contentType: "application/json" });
  console.log(`RUN_TIMINGS ${JSON.stringify(timings)}`);
});
