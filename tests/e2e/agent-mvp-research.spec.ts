import { expect, test } from "@playwright/test";

/**
 * Agent MVP slice «Разбор по исследованиям» (docs/agent-mvp/DECISION.md):
 * one door to the configured scenario, one compact answer, the answer before
 * the next question on a phone. PubMed may be reachable or not in CI; both
 * outcomes are valid, a false success is not.
 */

test("the home shortcut and the job link open the configured scenario", async ({ page }) => {
  await page.goto("/cardiology");
  await expect(page.locator('.pt-shortcut[data-job="research"]')).toHaveAttribute("href", "/cardiology/agents/research");
  await page.goto("/cardiology/ask?job=research");
  await expect(page).toHaveURL(/\/cardiology\/agents\/research$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Разбор по исследованиям" })).toBeVisible();
  await expect(page.getByText("Что получить")).toBeVisible();
  await expect(page.getByLabel("Источники")).toBeVisible();
  await expect(page.getByLabel("Тип")).toBeVisible();
  // Topic settings do not change a typed question, so the scenario does not show them.
  await expect(page.getByRole("button", { name: "Настроить проверку" })).toHaveCount(0);
});

test("a named publication gets one compact answer, details collapsed, answer before the next question on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cardiology/agents/research");
  // R1 A-7: the question is on the first screen of a phone, before what to get and where to search.
  const field = page.getByRole("textbox").first();
  const fieldBox = (await field.boundingBox())!;
  expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(844);
  await field.fill("PMID 99999999");
  // Enter sends, as on the home page.
  await field.press("Enter");
  // R1 B-6: one address per review — the result page, as from «История».
  await expect(page).toHaveURL(/\/cardiology\/ask\?run=/u, { timeout: 60_000 });

  const answer = page.locator("[data-research-answer]");
  await expect(answer).toBeVisible({ timeout: 60_000 });
  const kind = await answer.getAttribute("data-research-answer");
  // Not found when PubMed answers; unavailable when it does not. Never «study» for a PMID that does not exist.
  expect(["not_found", "unavailable"]).toContain(kind);
  await expect(answer.locator("img")).toHaveCount(0);

  const next = page.getByRole("heading", { name: "Уточнить или спросить другое" });
  await expect(next).toBeVisible();
  const answerTop = (await answer.boundingBox())!.y;
  const nextTop = (await next.boundingBox())!.y;
  expect(answerTop).toBeLessThan(nextTop);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The old scenario address of the same review opens the same result page.
  const runId = new URL(page.url()).searchParams.get("run")!;
  await page.goto(`/cardiology/agents/research?run=${runId}`);
  await expect(page).toHaveURL(new RegExp(`/cardiology/ask\\?run=${runId}`, "u"));

  // R1 B-9: opened from «История», the way back is «История».
  await page.goto("/cardiology/history");
  await page.getByRole("link", { name: "PMID 99999999" }).first().click();
  await expect(page.locator('.ws-back[data-back="history"]')).toHaveText(/История/u);
});

test("the portal input sends a study review to the same scenario and the same answer", async ({ page }) => {
  await page.goto("/cardiology");
  const input = page.getByRole("textbox", { name: "Что хотите узнать или сделать?" });
  await input.fill("Разбери статью PMID 99999999");
  await expect(page.locator(".ws-composer-preview")).toContainText("разбор по исследованиям · PubMed и каталог специальности");
  await page.locator("form.pt-composer button[type=submit]").click();
  await expect(page).toHaveURL(/\/cardiology\/ask\?run=/u, { timeout: 30_000 });
  await expect(page.locator("[data-research-answer]")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Разбор по исследованиям" })).toBeVisible();
});
