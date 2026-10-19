import { expect, test } from "@playwright/test";

test("legacy visualization query no longer exposes medical imaging as a product surface", async ({ page }) => {
  await page.goto("/cardiology?view=imaging&shell=practice");
  await expect(page.getByRole("heading", { level: 1, name: "Что хотите делегировать?" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Визуализация" })).toHaveCount(0);
  await expect(page.getByText(/upload scan|интерпретир.*снимок/iu)).toHaveCount(0);
});

test("legacy consilium query resolves to agent-first home instead of synthetic clinicians", async ({ page }) => {
  await page.goto("/cardiology?view=consilium");
  await expect(page.getByRole("heading", { level: 1, name: "Что хотите делегировать?" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Консилиум" })).toHaveCount(0);
});
