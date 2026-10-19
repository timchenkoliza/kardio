import { expect, test, type Page, type TestInfo } from "@playwright/test";

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 1000 },
] as const;

async function expectNoHorizontalPageOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({ innerWidth: window.innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

for (const viewport of viewports) {
  test(`agent-first workspace is usable without page overflow at ${viewport.name}px`, async ({ page }, testInfo: TestInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto("/cardiology");
    await expect(page.getByRole("heading", { level: 1, name: "Что хотите делегировать?" })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    const composer = await page.locator(".agent-composer").boundingBox();
    expect(composer).not.toBeNull();
    expect(composer?.x ?? 0).toBeGreaterThanOrEqual(0);
    expect((composer?.x ?? 0) + (composer?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    const runButton = await page.getByRole("button", { name: "Запустить" }).boundingBox();
    expect(runButton?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.getByRole("button", { name: "Мои агенты", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Настройте работу, а не промпт" })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    await testInfo.attach(`agent-first-${viewport.name}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
}
