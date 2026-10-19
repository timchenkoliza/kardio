import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.clear(); });
});

test("agent-first home replaces the legacy feed taxonomy", async ({ page }) => {
  await page.goto("/cardiology");
  await expect(page.getByRole("heading", { level: 1, name: "Что хотите делегировать?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Главное", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Мои агенты", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Мои материалы", exact: true })).toBeVisible();
  await expect(page.getByText("Лента", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Консилиум", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Визуализация", { exact: true })).toHaveCount(0);
});

test("research agent performs a catalog-backed run with provenance", async ({ page }) => {
  await page.goto("/cardiology");
  const composer = page.getByRole("textbox", { name: "Задача для агента" });
  await composer.fill("Исследуй сердечную недостаточность");
  await page.getByRole("button", { name: "Запустить" }).click();
  await expect(page.getByTestId("agent-result")).toBeVisible();
  await expect(page.getByText(/catalog: подключено/)).toBeVisible();
  await expect(page.getByText(/pubmed: не подключено/)).toBeVisible();
});

test("my materials accepts a local note without pretending server indexing", async ({ page }) => {
  await page.goto("/cardiology");
  await page.getByRole("button", { name: "Мои материалы", exact: true }).click();
  await page.getByPlaceholder("Например: ESC — заметки по ХСН").fill("Моя заметка");
  await page.getByPlaceholder("Добавьте заметку или фрагмент…").fill("Личный фрагмент для локальной базы");
  await page.getByRole("button", { name: "Добавить материал", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Моя заметка" })).toBeVisible();
  await expect(page.getByText("INDEXED_LOCAL")).toBeVisible();
  await expect(page.getByText(/Серверная персональная индексация пока не подключена/)).toBeVisible();
});
