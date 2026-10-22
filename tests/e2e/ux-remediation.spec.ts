import { expect, test, type Page } from "@playwright/test";

/**
 * UX remediation matrix in the browser (docs/ux-remediation/ISSUE_LEDGER.md).
 * Deterministic checks need no network. The search checks (UX-03, UX-04, UX-05,
 * UX-08) call live sources: an unreachable source is a valid outcome only when
 * the page says so, never a false «найдено».
 */

async function ask(page: Page, text: string) {
  await page.getByRole("textbox").first().fill(text);
  await page.locator("form button[type=submit]").first().click();
  await expect(page).toHaveURL(/run=/u, { timeout: 60_000 });
  await expect(page.locator('[data-run-state="done"]')).toBeVisible({ timeout: 90_000 });
}

test("UX-01: no depth choice before the question; the input and the tasks are on the first phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cardiology");
  await expect(page.getByText("Режим ответа")).toHaveCount(0);
  await expect(page.locator(".pt-modes")).toHaveCount(0);
  await expect(page.getByRole("textbox").first()).toBeInViewport();
  const firstTask = (await page.locator(".pt-shortcut").first().boundingBox())!;
  expect(firstTask.y).toBeLessThan(844);
});

test("navigation: «История» instead of «Агенты», one settings entry, the task catalogue from home", async ({ page }) => {
  await page.goto("/cardiology");
  const nav = page.getByRole("navigation", { name: "Основная навигация" });
  await expect(nav.getByRole("link", { name: "История" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Агенты" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Настройки", exact: true })).toHaveCount(0);
  await expect(page.locator(".ws-sidebar-gear")).toHaveCount(0);
  await page.getByRole("link", { name: /Все задачи/u }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Все задачи/u })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Главное" })).toHaveAttribute("aria-current", "page");
  await page.goto("/cardiology/history");
  await expect(page.getByRole("heading", { level: 1, name: "История" })).toBeVisible();
});

test("UX-02: one «Что нового», no second name for the main answer", async ({ page }) => {
  await page.goto("/cardiology/agents");
  await expect(page.locator(".pt-gallery").getByText("Консилиум")).toHaveCount(0);
  await expect(page.getByText("Что нового для меня")).toHaveCount(0);
  await page.locator('.pt-agent[data-agent="updates"] .pt-agent-link').click();
  await expect(page).toHaveURL(/\/cardiology\/agents\/whats-new$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Что нового" })).toBeVisible();
});

test("UX-10: an unrecognised request says the search did not run, never «Готово», with this specialty's examples", async ({ page }) => {
  await page.goto("/cardiology");
  await ask(page, "???");
  await expect(page.locator(".pt-outcome")).toContainText("Проверка не выполнялась");
  await expect(page.locator(".ws-run-status", { hasText: /^Готово$/u })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("метформин при ХБП");
});

test("UX-09: feed cards act only on their material; the material page names topic searches as new searches", async ({ page }) => {
  await page.goto("/cardiology");
  const cards = page.locator(".pt-cards > article.pt-card");
  await expect(cards.first()).toBeVisible();
  await expect(page.locator(".pt-cards").getByRole("button", { name: /Кратко/u })).toHaveCount(0);
  await expect(page.locator(".pt-cards").getByRole("button", { name: /Разбор исследований|Практические рекомендации/u })).toHaveCount(0);
  await cards.first().locator(".pt-card-link").click();
  await expect(page).toHaveURL(/\/cardiology\/(?:item|content)\//u);
  await expect(page.getByRole("button", { name: /^Кратко/u })).toHaveCount(0);
});

test("B-01: «Сохранить» on a catalog document puts it into «Мои материалы»", async ({ page }) => {
  await page.goto("/cardiology/content/gl-vt-2025");
  const title = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
  // Related documents on this page have no second, legacy «Сохранить».
  await expect(page.getByRole("button", { name: "Сохранить материал" })).toHaveCount(0);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("link", { name: "В материалах" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "В материалах" }).click();
  await expect(page).toHaveURL(/\/cardiology\/materials$/u);
  await expect(page.locator("main")).toContainText(title.slice(0, 40));
});

test("B-02: adding a topic from the home nudge keeps an excluded source", async ({ page }) => {
  await page.goto("/cardiology/settings");
  const lancet = page.locator('.pt-source[data-source="lancet"] select');
  await lancet.selectOption("excluded");
  await expect(page.locator('.pt-source[data-source="lancet"]')).toHaveAttribute("data-state", "excluded");
  await expect(page.getByText("Сохранено").first()).toBeVisible({ timeout: 15_000 });
  await page.goto("/cardiology");
  const nudge = page.locator(".pt-nudge");
  test.skip(!(await nudge.count()), "the nudge is shown only before topics are chosen");
  await nudge.getByRole("button").first().click();
  await page.waitForLoadState("networkidle");
  await page.goto("/cardiology/settings");
  await expect(page.locator('.pt-source[data-source="lancet"]')).toHaveAttribute("data-state", "excluded");
});

test("UX-05: a drug question naming a section opens with that section", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/cardiology");
  await ask(page, "Аторвастатин: противопоказания");
  const drug = page.locator(".pt-drug").first();
  if (!(await drug.count())) {
    // The instruction source did not answer: that must be said, not replaced by another section.
    await expect(page.locator(".pt-outcome")).toBeVisible();
    return;
  }
  await expect(drug.locator(".pt-drug-sections").first().locator("h3").first()).toHaveText("Противопоказания");
  await expect(drug.locator("details[data-rest-sections]")).not.toHaveAttribute("open", "");
  await expect(page.locator('[data-module="key_takeaway"]')).not.toContainText("Показания к применению");
});

test("UX-08: «что изменилось в рекомендациях» opens as a version comparison", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/cardiology");
  await ask(page, "Что изменилось в рекомендациях по ХСН?");
  await expect(page.locator(".pt-view")).toContainText("сравнение с предыдущей версией");
  await expect(page.getByRole("heading", { name: /Что изменилось · версии рекомендаций/u })).toBeVisible();
});

test("UX-03 + UX-04: adults and duration are kept; a follow-up continues the question", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/therapy");
  await ask(page, "Какая длительность антибиотикотерапии при внебольничной пневмонии у взрослых?");
  const takeaway = page.locator('[data-module="key_takeaway"]');
  if (await takeaway.count()) {
    await expect(takeaway).not.toContainText(/у детей|лимфом|опухол/u);
    // Every item of the main answer is labelled for the question, separately from the text match.
    const items = takeaway.locator(".pt-takeaway-list > li");
    for (let index = 0; index < await items.count(); index += 1) await expect(items.nth(index).locator(".pt-relevance")).toHaveCount(1);
  } else {
    await expect(page.locator(".pt-outcome")).toBeVisible();
  }
  await page.getByRole("textbox").last().fill("А если течение нетяжёлое?");
  await page.locator("form button[type=submit]").last().click();
  await expect(page.getByText("Уточнение: «А если течение нетяжёлое?»")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".pt-continues")).toContainText("внебольничной пневмонии у взрослых");
  await expect(page.locator("main")).not.toContainText("Назовите заболевание");
});
