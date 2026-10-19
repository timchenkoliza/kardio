import { expect, test, type Page } from "@playwright/test";

async function openVisualization(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    window.localStorage.setItem("kardio_onboarding_v1", "1");
  });
  await page.goto("/cardiology?view=imaging&shell=practice");
  await expect(page.getByRole("heading", { level: 1, name: "Визуализация" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Сердце" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test("visualization uses a dense first-fold two-column layout on desktop", async ({ page }) => {
  await openVisualization(page, 1440, 900);
  await expectNoHorizontalOverflow(page);

  const anatomy = await page.locator(".anatomy-explorer").boundingBox();
  const viewer = await page.locator(".production-media-viewer").boundingBox();
  const heart = await page.locator(".anatomy-stage img").boundingBox();
  const mediaStage = await page.locator(".production-media-stage").boundingBox();

  expect(anatomy).not.toBeNull();
  expect(viewer).not.toBeNull();
  expect(heart).not.toBeNull();
  expect(mediaStage).not.toBeNull();

  expect(Math.abs((anatomy?.y ?? 0) - (viewer?.y ?? 0))).toBeLessThanOrEqual(4);
  expect(heart?.width ?? 0).toBeGreaterThanOrEqual(280);
  expect(mediaStage?.width ?? 0).toBeGreaterThanOrEqual(520);
  expect(anatomy?.height ?? 0).toBeGreaterThanOrEqual(560);
  expect(viewer?.height ?? 0).toBeGreaterThanOrEqual(560);
});

test("visualization stacks without overflow on tablet", async ({ page }) => {
  await openVisualization(page, 768, 1024);
  await expectNoHorizontalOverflow(page);

  const anatomy = await page.locator(".anatomy-explorer").boundingBox();
  const viewer = await page.locator(".production-media-viewer").boundingBox();
  expect(anatomy).not.toBeNull();
  expect(viewer).not.toBeNull();
  expect(viewer?.y ?? 0).toBeGreaterThan((anatomy?.y ?? 0) + (anatomy?.height ?? 0) - 2);
});

test("visualization preserves touch geometry on mobile", async ({ page }) => {
  await openVisualization(page, 390, 844);
  await expectNoHorizontalOverflow(page);

  const layerButtons = page.locator(".anatomy-layer-list button");
  await expect(layerButtons).toHaveCount(4);
  const firstLayer = await layerButtons.first().boundingBox();
  const firstControl = await page.locator(".anatomy-controls button").first().boundingBox();

  expect(firstLayer?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(firstControl?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(firstControl?.width ?? 0).toBeGreaterThanOrEqual(44);
});
