import { expect, test, type Page } from "@playwright/test";

/**
 * Capabilities behind the portal (background checks, events, drugs,
 * materials, settings). The portal home itself is covered by
 * portal-journey.spec.ts. PubMed is a LIVE connector; CI may have no network,
 * so assertions never depend on PubMed results — only on honest reporting.
 */

const TOPIC_IDS: Record<string, string> = { "ХСН": "hf", "Артериальная гипертензия": "ah", "Фибрилляция предсердий": "af", "Кардиомиопатии": "cardiomyopathy" };

/** Topics are optional in the portal; tests set them through the same command the settings page uses. */
async function setupInterests(page: Page, topics: string[]) {
  await page.goto("/cardiology/settings");
  const ok = await page.evaluate(async ids => {
    const response = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setInterests", specialty: "cardiology", topics: ids, trustedSources: ["rko", "esc", "pubmed"], excludedSources: [], runAgents: true }) });
    return response.ok;
  }, topics.map(topic => TOPIC_IDS[topic]));
  expect(ok).toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({ inner: window.innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(metrics.doc).toBeLessThanOrEqual(metrics.inner + 1);
  expect(metrics.body).toBeLessThanOrEqual(metrics.inner + 1);
}

test("configuring topics runs the background checks behind «Для вас»", async ({ page }) => {
  await setupInterests(page, ["ХСН", "Артериальная гипертензия"]);
  await page.goto("/cardiology/agents");
  // The task catalogue («Все задачи»); the background checks behind «Для вас» sit in a disclosure under it.
  await expect(page.getByRole("heading", { level: 1, name: /Все задачи/ })).toBeVisible();
  await page.locator(".pt-background > summary").filter({ hasText: "Фоновые проверки" }).click();
  await expect(page.locator('.ws-agent-card[data-agent="drugs"]')).toBeVisible();
  await expect(page.locator('.ws-agent-card[data-agent="drugs"]')).toContainText(/регистрац/);
  // «Что нового» appears once, as a task card; the block lists only the other checks that fill «Для вас».
  await expect(page.locator('.pt-background .ws-agent-card[data-agent="whats_new"]')).toHaveCount(0);
  await expect(page.locator('.pt-agent[data-agent="updates"]')).toBeVisible();
  await expect(page.locator(".pt-background .ws-agent-card")).toHaveCount(4);
  await page.goto("/cardiology");
  await expect(page.locator(".pt-card").first()).toBeVisible();
  // Every card explains itself: the reason it is shown is on the card's own page, one click away in the same tab.
  await page.locator(".pt-cards > article.pt-card .pt-card-link").first().click();
  await expect(page).toHaveURL(/\/cardiology\/(?:item|content)\//u);
  if (page.url().includes("/item/")) await expect(page.locator(".pt-item-facts")).toContainText("Почему вы это видите");
  else await expect(page.locator("main")).toContainText("Сверка с источниками");
});

test("drug agent shows since-last-visit change detection with evidence", async ({ page }) => {
  await setupInterests(page, ["Артериальная гипертензия", "Кардиомиопатии"]);
  await page.goto("/cardiology/agents/drugs");
  await expect(page.getByRole("heading", { level: 2, name: /Первая проверка|С прошлого просмотра/ })).toBeVisible();
  const registration = page.locator(".ws-result").filter({ hasText: "Баксдростат зарегистрирован в России" });
  await expect(registration).toBeVisible();
  await registration.getByText(/Утверждения и источники/).click();
  await expect(registration.getByText(/получено/).first()).toBeVisible();
  await expect(registration.getByRole("link", { name: /Коммерсантъ/ }).first()).toHaveAttribute("href", "https://www.kommersant.ru/doc/8956362");
  await page.waitForTimeout(2000);
  await page.reload();
  // Until a second check runs, the counts describe the first check: never «0» next to the registration listed below (D-5).
  await expect(page.getByRole("heading", { level: 2, name: /Первая проверка/ })).toBeVisible();
  await expect(page.locator(".ws-since li.has-items").first()).toBeVisible();
});

test("events agent: discovery → relevance → confirmed calendar file", async ({ page }) => {
  await setupInterests(page, ["ХСН"]);
  await page.goto("/cardiology/agents/events");
  // Russian accredited events came from rnmo.ru, which the physicians rejected;
  // organiser-sourced congresses remain, so the test looks abroad.
  await page.getByRole("button", { name: "Настроить проверку" }).click();
  await page.getByRole("group", { name: "Город и формат" }).getByRole("button", { name: "Зарубежные", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить и запустить" }).click();
  const event = page.locator(".ws-result-event").first();
  await expect(event).toBeVisible({ timeout: 30_000 });
  await expect(event).toBeVisible();
  await expect(event.locator(".ws-reasons")).toContainText(/Тема|Онлайн|Москва|НМО|Через|Зарубеж/);
  await event.getByRole("button", { name: "В календарь" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Нужно ваше подтверждение")).toBeVisible();
  await expect(dialog).toContainText("напоминаниями за сутки и за час");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Подтвердить" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await dialog.getByRole("button", { name: "Закрыть" }).last().click();

  await event.getByRole("button", { name: "Перейти к регистрации" }).click();
  await expect(page.getByRole("dialog")).toContainText("Зарегистрироваться от вашего имени агент не может");
  await page.getByRole("dialog").getByRole("button", { name: "Отменить" }).click();
});

test("an evidence question routes to the research job with a checked trace", async ({ page }) => {
  await page.goto("/cardiology");
  await page.getByRole("textbox", { name: "Что хотите узнать или сделать?" }).fill("Какие данные о ПОАК при фибрилляции предсердий и промежуточном риске инсульта");
  await expect(page.locator(".pt-input .ws-route")).toContainText("разбор по исследованиям");
  await page.locator(".pt-input .ws-composer-run").click();
  await expect(page).toHaveURL(/\/cardiology\/ask\?run=/, { timeout: 45_000 });
  // The run is durable at once; sources are checked on the result page.
  await expect(page.locator('[data-run-state="done"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Разбор по исследованиям" })).toBeVisible();
  // One compact answer (docs/agent-mvp/DECISION.md): what was found, why to trust it, limitations; records collapsed.
  const answer = page.locator("[data-research-answer]");
  await expect(answer).toBeVisible();
  await expect(answer).toContainText("Ограничения");
  await page.locator(".ws-trace-disclosure > summary").click();
  const trace = page.locator(".ws-trace");
  await expect(trace.getByRole("heading", { name: "Как получен результат" })).toBeVisible();
  await expect(trace).toContainText("Применили фильтры до поиска");
  await expect(trace).toContainText("Искали в каталоге РКО и РКЖ");
  await expect(trace).toContainText("Искали публикации в PubMed");
  await expect(trace).toContainText("Проверили утверждения по источникам");
  await page.locator('[data-more="all"] > summary').click();
  await expect(page.locator(".ws-result").first()).toContainText(/фибрилляц|fibrillation/i);
  await expect(page.locator(".ws-verify").first()).toBeVisible();
});

test("my materials: add a note and retrieve it only from my base", async ({ page }) => {
  await page.goto("/cardiology/materials");
  await page.getByRole("button", { name: "Заметка", exact: true }).click();
  await page.getByLabel("Название").fill("Разбор SCORE2");
  await page.getByLabel("Текст").fill("Шкала SCORE2 для 40–69 лет. Пациент Иванов, телефон +7 999 123-45-67.");
  await page.getByRole("button", { name: "Сохранить заметку" }).click();
  const item = page.locator(".ws-material").filter({ hasText: "Разбор SCORE2" });
  await expect(item).toBeVisible();
  await expect(item).toContainText("Замаскированы персональные данные");
  await page.getByLabel("Вопрос").fill("шкала SCORE2");
  await page.getByRole("button", { name: "Найти" }).click();
  await expect(page).toHaveURL(/\/cardiology\/materials\?run=/);
  await expect(page.locator(".ws-result").first()).toContainText("Разбор SCORE2");
  await expect(page.locator(".ws-result").first()).not.toContainText("Иванов");
});

test("settings expose honest connector states", async ({ page }) => {
  await page.goto("/cardiology/settings");
  const connectors = page.locator(".ws-connectors");
  await expect(connectors.locator("li").filter({ hasText: "ГРЛС Минздрава" })).toContainText("Не подключено");
  await expect(connectors.locator("li").filter({ hasText: "Рубрикатор клинических рекомендаций" })).toContainText("Не подключено");
  await expect(connectors.locator("li").filter({ hasText: "Инструкции FDA" })).toContainText(/Онлайн|Не подключено/);
  await expect(connectors.locator("li").filter({ hasText: "Телеграм-каналы" })).toContainText("Не подключено");
  await expect(connectors.locator("li").filter({ hasText: "Партнёрские материалы" })).toContainText("Демо-данные");
  await expect(connectors.locator("li").filter({ hasText: "PubMed" }).first()).toContainText(/Онлайн|Не подключено/);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
  test(`workspace pages have no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setupInterests(page, ["ХСН", "Фибрилляция предсердий"]);
    for (const path of ["/cardiology", "/cardiology/ask?job=drug", "/pediatrics", "/cardiology/agents", "/cardiology/agents/drugs", "/cardiology/agents/events", "/cardiology/agents/guidelines", "/cardiology/agents/learning", "/cardiology/materials", "/cardiology/settings"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    if (viewport.width < 900) await expect(page.getByRole("navigation", { name: "Разделы" })).toBeVisible();
    else await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
  });
}
