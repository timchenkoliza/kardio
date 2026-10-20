import { expect, test } from "@playwright/test";

/**
 * Medical-image interpretation is not part of the product. The legacy
 * visualization surface is retired and the agent workspace blocks requests to
 * interpret scans or ECGs before any tool runs.
 */
test("legacy imaging surface is retired", async ({ page }) => {
  await page.goto("/cardiology?view=imaging");
  await expect(page).toHaveURL(/\/cardiology\/legacy\?view=imaging/);
  await expect(page.getByRole("heading", { level: 1, name: /Визуализация: раздел выведен из продукта/ })).toBeVisible();
  await expect(page.locator(".imaging-hub")).toHaveCount(0);
});

test("the workspace refuses to interpret medical images", async ({ page }) => {
  await page.goto("/cardiology");
  await page.getByRole("textbox", { name: "Что хотите делегировать?" }).fill("Расшифруй ЭКГ пациента и опиши снимок");
  await expect(page.getByText("Интерпретация медицинских изображений не поддерживается.").first()).toBeVisible();
  await expect(page.locator(".ws-composer-run")).toBeDisabled();
});

test("navigation offers no image analysis entry", async ({ page }) => {
  await page.goto("/cardiology");
  const nav = page.getByRole("navigation", { name: "Основная навигация" });
  await expect(nav).not.toContainText("Визуализация");
  await expect(nav).not.toContainText("Консилиум");
});
