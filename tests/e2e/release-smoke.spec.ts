import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("kardio_onboarding_v1", "1");
    window.localStorage.removeItem("kardio.drugRatings.v1");
    window.localStorage.removeItem("kardio.consilium.v1");
  });
});

test("legacy drug ratings still save locally inside the archive", async ({ page }) => {
  await page.goto("/cardiology/legacy?view=drugs");

  await expect(page.getByRole("heading", { level: 1, name: "Препараты" })).toBeVisible();
  await expect(page.getByText("Демо-данные · синтетические оценки")).toBeVisible();
  await expect(page.getByText("Это архив предыдущего интерфейса", { exact: false })).toBeVisible();

  const efficacy = page.locator("fieldset").filter({ hasText: "Эффективность" });
  await efficacy.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: /Сохранить мою оценку/ }).click();
  await expect(page.getByRole("status")).toHaveText("Оценка сохранена в этом браузере.");
});

test("consilium is retired from the product", async ({ page }) => {
  await page.goto("/cardiology?view=consilium");
  await expect(page).toHaveURL(/\/cardiology\/legacy\?view=consilium/);
  await expect(page.getByRole("heading", { level: 1, name: /Консилиум: раздел выведен из продукта/ })).toBeVisible();
  await expect(page.getByText("А. Морозова")).toHaveCount(0);
});

test("oncology never receives cardiology rating or persona fixtures", async ({ page }) => {
  await page.goto("/oncology/legacy?view=drugs");
  await expect(page.getByRole("heading", { level: 1, name: "Оценка препаратов" })).toBeVisible();
  await expect(page.getByText(/не подменяет этот пробел кардиологическими данными/)).toBeVisible();
  await expect(page.getByText("Эликвис")).toHaveCount(0);

  await page.goto("/oncology/agents/drugs");
  await expect(page.getByRole("heading", { level: 1, name: "Препараты" })).toBeVisible();
  await expect(page.getByText("Баксдростат")).toHaveCount(0);
});
