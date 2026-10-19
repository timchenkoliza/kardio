import { expect, test, type Page } from "@playwright/test";

/**
 * Agent-first workspace: critical paths and acceptance criteria.
 * PubMed is a LIVE connector; CI may have no network, so assertions never
 * depend on PubMed results — only on honest reporting of its state.
 */

async function setupInterests(page: Page, topics: string[]) {
  await page.goto("/cardiology");
  for (const topic of topics) await page.getByRole("group", { name: "Что вас интересует?" }).getByRole("button", { name: topic, exact: true }).click();
  await page.getByRole("button", { name: "Запустить агентов" }).click();
  await expect(page.locator(".ws-setup.is-onboarding")).toHaveCount(0, { timeout: 30_000 });
  await page.reload();
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({ inner: window.innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(metrics.doc).toBeLessThanOrEqual(metrics.inner + 1);
  expect(metrics.body).toBeLessThanOrEqual(metrics.inner + 1);
}

test("home is a delegation workspace, not a feed", async ({ page }) => {
  await page.goto("/cardiology");
  await expect(page.getByRole("heading", { level: 1, name: "Что хотите делегировать?" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Основная навигация" });
  await expect(nav.getByRole("link", { name: "Главное" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: /Мои агенты/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Мои материалы" })).toBeVisible();
  await expect(nav).not.toContainText("Лента");
  await expect(nav).not.toContainText("Источники");
  await expect(page.locator(".ws-agent-card")).toHaveCount(7);
  for (const name of ["Что нового для меня", "Изменения рекомендаций", "Препараты", "Исследовать тему", "События", "Моё обучение", "Мои материалы"]) {
    await expect(page.getByRole("heading", { level: 3, name })).toBeVisible();
  }
});

test("visual configuration without prompts runs the agents", async ({ page }) => {
  await setupInterests(page, ["ХСН", "Артериальная гипертензия"]);
  const drugs = page.locator('.ws-agent-card[data-agent="drugs"]');
  await expect(drugs).toContainText(/регистрац/);
  await expect(page.locator('.ws-agent-card[data-agent="whats_new"]')).toContainText(/по вашим темам|с вашего прошлого визита/);
  await expect(page.getByRole("heading", { level: 2, name: "Последние результаты" })).toBeVisible();
});

test("drug agent shows since-last-visit change detection with evidence", async ({ page }) => {
  await setupInterests(page, ["Артериальная гипертензия", "Кардиомиопатии"]);
  await page.goto("/cardiology/agents/drugs");
  await expect(page.getByRole("heading", { level: 2, name: /Первый просмотр|С прошлого просмотра/ })).toBeVisible();
  const registration = page.locator(".ws-result").filter({ hasText: "Баксдростат зарегистрирован в России" });
  await expect(registration).toBeVisible();
  await registration.getByText(/Утверждения и источники/).click();
  await expect(registration.getByText(/получено/).first()).toBeVisible();
  await expect(registration.getByRole("link", { name: /Коммерсантъ/ }).first()).toHaveAttribute("href", "https://www.kommersant.ru/doc/8956362");
  await page.waitForTimeout(2000);
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: /С прошлого просмотра/ })).toBeVisible();
  await expect(page.locator(".ws-since li.has-items")).toHaveCount(0);
});

test("events agent: discovery → relevance → confirmed calendar file", async ({ page }) => {
  await setupInterests(page, ["ХСН"]);
  await page.goto("/cardiology/agents/events");
  const event = page.locator(".ws-result-event").first();
  await expect(event).toBeVisible();
  await expect(event.locator(".ws-reasons")).toContainText(/Тема|Онлайн|Москва|НМО|Через/);
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

test("composer routes intent → plan → tools → evidence-backed result", async ({ page }) => {
  await page.goto("/cardiology");
  await page.getByLabel("Что хотите делегировать?").fill("Какие данные о ПОАК при фибрилляции предсердий и промежуточном риске инсульта");
  await expect(page.locator(".ws-route")).toContainText("Исследовать тему");
  await page.locator(".ws-composer-run").click();
  await expect(page).toHaveURL(/\/cardiology\/agents\/research\?run=/, { timeout: 30_000 });
  const trace = page.locator(".ws-trace");
  await expect(trace.getByRole("heading", { name: "Как получен результат" })).toBeVisible();
  await expect(trace).toContainText("Искали в каталоге РКО и РКЖ");
  await expect(trace).toContainText("Искали публикации в PubMed");
  await expect(trace).toContainText("Проверили утверждения по источникам");
  await expect(trace).toContainText("Чего не хватает");
  await expect(page.locator(".ws-result").first()).toContainText(/фибрилляц|fibrillation/i);
  await expect(page.locator(".ws-verify").first()).toBeVisible();
});

test("my materials: add a note and retrieve it only from my base", async ({ page }) => {
  await page.goto("/cardiology/materials");
  await page.getByRole("button", { name: "Заметка" }).click();
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
  await expect(connectors.locator("li").filter({ hasText: "ГРЛС" })).toContainText("Не подключено");
  await expect(connectors.locator("li").filter({ hasText: "Telegram-каналы" })).toContainText("Не подключено");
  await expect(connectors.locator("li").filter({ hasText: "Партнёрские материалы" })).toContainText("Демо-данные");
  await expect(connectors.locator("li").filter({ hasText: "PubMed" }).first()).toContainText(/Онлайн|Не подключено/);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
  test(`workspace pages have no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setupInterests(page, ["ХСН", "Фибрилляция предсердий"]);
    for (const path of ["/cardiology", "/cardiology/agents", "/cardiology/agents/drugs", "/cardiology/agents/events", "/cardiology/agents/guidelines", "/cardiology/agents/learning", "/cardiology/materials", "/cardiology/settings"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    if (viewport.width < 900) await expect(page.getByRole("navigation", { name: "Разделы" })).toBeVisible();
    else await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
  });
}
