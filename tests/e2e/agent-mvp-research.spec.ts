import { expect, test, type Page } from "@playwright/test";

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

/** The scenario's question field, by its label. */
const scenarioField = (page: Page) => page.getByRole("textbox", { name: "Что хотите исследовать?" });

/** Sends a question from the scenario page with Enter and waits for the review on its one address, /ask?run=. */
async function review(page: Page, question: string): Promise<string> {
  await page.goto("/cardiology/agents/research");
  await scenarioField(page).fill(question);
  await scenarioField(page).press("Enter");
  await expect(page).toHaveURL(/\/cardiology\/ask\?run=run-[a-f0-9-]{36}$/u, { timeout: 60_000 });
  await expect(page.locator("[data-research-answer]")).toBeVisible({ timeout: 90_000 });
  return new URL(page.url()).searchParams.get("run")!;
}

const TOPIC = "ПОАК у пожилых с фибрилляцией предсердий";

test("a named publication gets one compact answer, details collapsed, answer before the next question on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cardiology/agents/research");
  // R1 A-7: on an empty scenario page of a phone the question field is on the first screen.
  await expect(scenarioField(page)).toBeInViewport();
  await scenarioField(page).fill("PMID 99999999");
  // R1 A-7: Enter sends, as on the home page.
  await scenarioField(page).press("Enter");
  // R1 B-6: the review opens on its one address.
  await expect(page).toHaveURL(/\/cardiology\/ask\?run=run-[a-f0-9-]{36}$/u, { timeout: 60_000 });

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
});

test("R1 A-7: Shift+Enter starts a new line in the scenario field, Enter does not", async ({ page }) => {
  await page.goto("/cardiology/agents/research");
  await scenarioField(page).fill("ПОАК у пожилых");
  await scenarioField(page).press("Shift+Enter");
  await scenarioField(page).pressSequentially("с фибрилляцией предсердий");
  await expect(scenarioField(page)).toHaveValue("ПОАК у пожилых\nс фибрилляцией предсердий");
  await expect(page).toHaveURL(/\/cardiology\/agents\/research$/u);
});

test("R1 A-7: «Повторить с другими источниками» shows the question and «Источники» on the first phone screen and leads back to the result", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const runId = await review(page, TOPIC);
  await page.getByRole("link", { name: "Повторить с другими источниками или типом материалов" }).click();
  await expect(page).toHaveURL(new RegExp(`/cardiology/agents/research\\?from=${runId}`, "u"));
  // The question comes from the stored review, never typed again.
  await expect(scenarioField(page)).toHaveValue(TOPIC);
  // The physician came to change the sources: the field and «Источники» are both on screen without scrolling.
  await expect(scenarioField(page)).toBeInViewport();
  await expect(page.getByLabel("Источники")).toBeInViewport();
  // «Назад» returns to the result it came from, not to the home page.
  const back = page.locator('.ws-back[data-back="result"]');
  await expect(back).toHaveText("К результату");
  await expect(back).toHaveAttribute("href", `/cardiology/ask?run=${runId}`);
  await back.click();
  await expect(page).toHaveURL(new RegExp(`/cardiology/ask\\?run=${runId}$`, "u"));
  await expect(page.locator("[data-research-answer]")).toBeVisible();
});

test("R1 B-6: one address per review, no second list of past reviews, and a follow-up continues the review", async ({ page }) => {
  test.setTimeout(240_000);
  const first = await review(page, "PMID 99999999");
  const runId = await review(page, TOPIC);
  expect(runId).not.toBe(first);
  // The scenario address of a review opens the same result page.
  await page.goto(`/cardiology/agents/research?run=${runId}`);
  await expect(page).toHaveURL(new RegExp(`/cardiology/ask\\?run=${runId}$`, "u"));
  await expect(page.locator("[data-research-answer]")).toBeVisible();
  // The scenario page is the question and its settings: past reviews are in «История» only.
  await page.goto("/cardiology/agents/research");
  await expect(page.getByRole("heading", { name: "Предыдущие вопросы" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Предыдущие вопросы — в «Истории»" })).toHaveAttribute("href", "/cardiology/history");
  // A follow-up typed under the review continues it: a new review that names the question it continues.
  await page.goto(`/cardiology/ask?run=${runId}`);
  const followup = page.getByRole("textbox", { name: "Уточнение или новый вопрос" });
  await followup.fill("а у женщин?");
  await followup.press("Enter");
  await expect(page).not.toHaveURL(new RegExp(`run=${runId}$`, "u"), { timeout: 60_000 });
  await expect(page.locator(".pt-question")).toHaveText("Уточнение: «а у женщин?»", { timeout: 60_000 });
  const continues = page.locator(".pt-continues");
  await expect(continues).toHaveAttribute("data-continues", runId);
  await expect(continues).toContainText(`Продолжение вопроса «${TOPIC}»`);
  await expect(page.locator("[data-research-answer]")).toBeVisible({ timeout: 90_000 });
});

test("R1 B-9: a review opened from «История» goes back to «История»", async ({ page }) => {
  test.setTimeout(120_000);
  const runId = await review(page, "PMID 99999999");
  await page.goto("/cardiology/history");
  await page.locator(`a[href="/cardiology/ask?run=${runId}&from=history"]`).click();
  await expect(page).toHaveURL(new RegExp(`/cardiology/ask\\?run=${runId}&from=history$`, "u"));
  const back = page.locator('.ws-back[data-back="history"]');
  await expect(back).toHaveText("История");
  await back.click();
  await expect(page).toHaveURL(/\/cardiology\/history$/u);
  // Opened from elsewhere (the home page's recent questions), the way back stays «Главное».
  await page.goto(`/cardiology/ask?run=${runId}`);
  await expect(page.locator(".ws-back")).toHaveText("Главное");
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
