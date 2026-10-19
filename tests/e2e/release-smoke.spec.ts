import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("kardio_onboarding_v1", "1");
    window.localStorage.setItem("kardio_agent_workspace_onboarding_v1", "1");
    window.localStorage.removeItem("kardio.drugRatings.v1");
    window.localStorage.removeItem("kardio.consilium.v1");
  });
});

test("cardiology home configures a persistent professional agent", async ({ page }) => {
  await page.goto("/cardiology");

  await expect(page.getByRole("heading", { level: 1, name: "Главное" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Что нужно сделать?" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Следить/ })).toHaveClass(/active/);

  const instruction = "Следи за обновлениями РКО и ESC по ХСН и показывай только изменения, которые могут менять тактику.";
  await page.getByLabel("Инструкция агенту").fill(instruction);
  await page.getByRole("button", { name: /Настроить агента/ }).click();

  await expect(page.getByRole("status")).toContainText("Агент настроен");
  await expect(page.getByRole("heading", { level: 3, name: "Что изменилось в рекомендациях" })).toBeVisible();
  await expect(page.getByText("Фоновый runtime ещё не подключён").first()).toBeVisible();

  await page.getByRole("button", { name: /Пауза/ }).first().click();
  await expect(page.getByText("На паузе").first()).toBeVisible();
});

test("drug intelligence saves a local rating and hands context to consilium", async ({ page }) => {
  await page.goto("/cardiology?view=drugs");

  await expect(page.getByRole("heading", { level: 1, name: "Препараты" })).toBeVisible();
  await expect(page.getByText("Демо-данные · синтетические оценки")).toBeVisible();
  await expect(page.getByText("Профилактика инсульта при ФП").first()).toBeVisible();

  const efficacy = page.locator("fieldset").filter({ hasText: "Эффективность" });
  await efficacy.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: /Сохранить мою оценку/ }).click();
  await expect(page.getByRole("status")).toHaveText("Оценка сохранена в этом браузере.");

  await page.getByRole("link", { name: /Обсудить с консилиумом/ }).click();
  await expect(page).toHaveURL(/view=consilium/);
  await expect(page.getByText(/Обсуждаем/)).toBeVisible();
  await expect(page.getByText(/Эликвис · Профилактика инсульта при ФП/)).toBeVisible();
});

test("consilium produces distinct replies and preserves synthesis", async ({ page }) => {
  await page.goto("/cardiology?view=consilium");

  await expect(page.getByRole("heading", { level: 1, name: "Консилиум" })).toBeVisible();
  await expect(page.getByText("Синтетический консилиум · ответы AI-персон")).toBeVisible();

  const composer = page.locator(".composer-row textarea");
  await composer.fill("Сравните варианты по безопасности и лекарственным взаимодействиям");
  await page.getByRole("button", { name: /Отправить/ }).click();

  await expect(page.getByText("А. Морозова").last()).toBeVisible();
  await expect(page.getByText("Н. Белова").last()).toBeVisible();
  await expect(page.getByText("Е. Орлова").last()).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Сходятся", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Расходятся", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Спросить отдельно" }).first().click();
  await composer.fill("Что здесь сильнее всего изменит вашу оценку?");
  await page.getByRole("button", { name: /Отправить/ }).click();
  await expect(page.locator(".chat-message.user").last()).toContainText("Что здесь сильнее всего изменит вашу оценку?");
});

test("oncology never receives cardiology rating or persona fixtures", async ({ page }) => {
  await page.goto("/oncology?view=drugs");
  await expect(page.getByRole("heading", { level: 1, name: "Оценка препаратов" })).toBeVisible();
  await expect(page.getByText(/не подменяет этот пробел кардиологическими данными/)).toBeVisible();
  await expect(page.getByText("Эликвис")).toHaveCount(0);

  await page.goto("/oncology?view=consilium");
  await expect(page.getByText(/не переиспользует кардиологические архетипы/)).toBeVisible();
  await expect(page.getByText("А. Морозова")).toHaveCount(0);
});
