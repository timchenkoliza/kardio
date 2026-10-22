import { expect, test, type Page } from "@playwright/test";

/**
 * Intent Skills & Flows — UX acceptance through the real interface.
 *
 *   A  a known job runs its Skill and Flow without a question, progressively, with provenance
 *   B  an ambiguous request gets one compact question; the question is preserved
 *   C  follow-ups patch the open result in place (same run, no blank rebuild)
 *   D  the non-cardiology Skill in its own specialty, with no cardiology evidence
 */

const CONTENT = '[data-module="key_takeaway"], [data-module="recommendation_delta"], [data-module="drug_reference"], [data-module="evidence"]';

async function ask(page: Page, specialty: string, text: string) {
  await page.goto(`/${specialty}`);
  await page.getByRole("textbox", { name: "Что хотите узнать или сделать?" }).fill(text);
  await page.locator(".pt-input .ws-composer-run").click();
}

async function done(page: Page) {
  await expect(page.locator('[data-run-state="done"]')).toBeVisible({ timeout: 90_000 });
}

test("A: «Что изменилось в рекомендациях по ХСН?» — no question, the version comparison, sources", async ({ page }) => {
  test.setTimeout(120_000);
  await ask(page, "cardiology", "Что изменилось в рекомендациях по ХСН?");
  await expect(page).toHaveURL(/\/cardiology\/ask\?run=run-/u, { timeout: 15_000 });
  await expect(page.locator("[data-clarification]")).toHaveCount(0);
  await expect(page.locator(CONTENT).first()).toBeVisible({ timeout: 60_000 });
  await done(page);
  await expect(page.locator('[data-explanation="skill"]')).toHaveText("Сравниваем текущую и предыдущую версии рекомендаций");
  await expect(page.locator('[data-module="recommendation_delta"]')).toBeVisible();
  await expect(page.locator('[data-module="sources"]')).toBeAttached();
  // Internal machinery is never shown.
  await expect(page.locator("body")).not.toContainText(/cardiology\.guideline_change|guideline_change\.flow|skill/iu);
});

test("B: «Подходит ли семаглутид?» — one compact question, the question kept, an option runs", async ({ page }) => {
  test.setTimeout(120_000);
  await ask(page, "endocrinology", "Подходит ли семаглутид?");
  const group = page.locator('[data-clarification="facet_changes_execution"]');
  await expect(group).toBeVisible({ timeout: 15_000 });
  await expect(group.getByText("Что важно уточнить про семаглутид?")).toBeVisible();
  await expect(group.locator("button")).toHaveText(["Показания", "Безопасность", "Дозирование", "Сравнить препараты", "Новые данные"]);
  await expect(page.getByRole("textbox", { name: "Что хотите узнать или сделать?" })).toHaveValue("Подходит ли семаглутид?");
  expect(new URL(page.url()).pathname).toBe("/endocrinology");
  await group.getByRole("button", { name: "Безопасность" }).click();
  await expect(page).toHaveURL(/\/endocrinology\/ask\?run=run-/u, { timeout: 15_000 });
  await expect(page.locator(".pt-question")).toContainText("Семаглутид: противопоказания и особые указания");
  await done(page);

  // «Семаглутид — что с ним?» is answered without interruption.
  await ask(page, "endocrinology", "Семаглутид — что с ним?");
  await expect(page).toHaveURL(/\/endocrinology\/ask\?run=run-/u, { timeout: 15_000 });
});

test("C: refinements patch the open result in place", async ({ page }) => {
  test.setTimeout(180_000);
  await ask(page, "cardiology", "Эмпаглифлозин при ХСН-сФВ — что сейчас известно?");
  await expect(page).toHaveURL(/\/cardiology\/ask\?run=run-/u, { timeout: 15_000 });
  const runUrl = page.url();
  await done(page);
  const followup = page.getByRole("textbox", { name: "Уточнение или новый вопрос" });
  const before = Number(await page.locator(".pt-experience").getAttribute("data-manifest-version"));
  const takeawayId = await page.locator('[data-module="key_takeaway"] h2').getAttribute("id");

  await followup.fill("Оставь только российские источники");
  await followup.press("Enter");
  await expect(page.locator('[data-view="applied"]')).toContainText("только российские источники", { timeout: 30_000 });
  expect(page.url()).toBe(runUrl);
  expect(Number(await page.locator(".pt-experience").getAttribute("data-manifest-version"))).toBe(before + 1);
  // The same modules, patched — never a blank rebuild under new identities.
  await expect(page.locator(`[id="${takeawayId}"]`)).toBeVisible();
  await expect(followup).toBeVisible();

  await followup.fill("Покажи, что изменилось относительно предыдущей версии.");
  await followup.press("Enter");
  await expect(page.locator('[data-view="applied"]')).toContainText("сравнение с предыдущей версией", { timeout: 30_000 });
  expect(page.url()).toBe(runUrl);
  await expect(page.locator("[data-comparison]")).toBeVisible();

  await page.locator('[data-view="applied"]').getByRole("button", { name: "Показать всё" }).click();
  await expect(page.locator('[data-view="applied"]')).toHaveCount(0, { timeout: 30_000 });
  expect(page.url()).toBe(runUrl);
});

test("D: the pediatric Skill runs in pediatrics with no cardiology evidence", async ({ page }) => {
  test.setTimeout(120_000);
  await ask(page, "pediatrics", "Амоксициллин у детей");
  await expect(page).toHaveURL(/\/pediatrics\/ask\?run=run-/u, { timeout: 15_000 });
  await done(page);
  await expect(page.locator('[data-explanation="skill"]')).toContainText("что сказано о детях");
  await expect(page.locator("body")).not.toContainText(/ESC 2026|сердечн\S* недостаточност|ХСН/u);
});

test("a large comparison shows the plan first; «Продолжить» runs it", async ({ page }) => {
  test.setTimeout(120_000);
  await ask(page, "cardiology", "Сравни апиксабан, ривароксабан и дабигатран при ФП");
  const plan = page.locator("[data-plan]");
  await expect(plan).toBeVisible({ timeout: 15_000 });
  await expect(plan.getByText("Я проверю:")).toBeVisible();
  await expect(plan.locator("li")).toHaveCount(4);
  await plan.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/cardiology\/ask\?run=run-/u, { timeout: 15_000 });
});
