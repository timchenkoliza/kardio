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
  await expect(page.getByRole("button", { name: "Настроить агента" })).toHaveCount(0);
});

test("a named publication gets one compact answer, details collapsed, answer before the next question on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cardiology/agents/research");
  await page.getByRole("textbox").first().fill("PMID 99999999");
  await page.locator("form button[type=submit]").first().click();
  await expect(page).toHaveURL(/run=/u, { timeout: 60_000 });

  const answer = page.locator("[data-research-answer]");
  await expect(answer).toBeVisible();
  const kind = await answer.getAttribute("data-research-answer");
  // Not found when PubMed answers; unavailable when it does not. Never «study» for a PMID that does not exist.
  expect(["not_found", "unavailable"]).toContain(kind);
  await expect(answer.locator("img")).toHaveCount(0);

  const newReview = page.getByRole("heading", { name: "Новый разбор" });
  await expect(newReview).toBeVisible();
  const answerTop = (await answer.boundingBox())!.y;
  const composerTop = (await newReview.boundingBox())!.y;
  expect(answerTop).toBeLessThan(composerTop);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
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
