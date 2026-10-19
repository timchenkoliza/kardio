import { expect, test, type Page, type TestInfo } from "@playwright/test";

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 1000 },
] as const;

async function prepare(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("kardio_onboarding_v1", "1");
    window.localStorage.removeItem("kardio.drugRatings.v1");
    window.localStorage.removeItem("kardio.consilium.v1");
  });
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

async function box(page: Page, selector: string) {
  const result = await page.locator(selector).boundingBox();
  expect(result, `${selector} must render`).not.toBeNull();
  return result!;
}

for (const viewport of viewports) {
  test(`decision workspaces render without geometry regressions at ${viewport.name}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await prepare(page);

    await page.goto("/cardiology?view=drugs");
    await expect(page.getByRole("heading", { level: 1, name: "Препараты" })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    const drugList = await box(page, ".drug-list");
    const drugDetail = await box(page, ".drug-detail");
    const workspace = await box(page, ".decision-workspace");
    expect(workspace.x).toBeGreaterThanOrEqual(0);
    expect(workspace.x + workspace.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(workspace.y).toBeLessThan(360);

    if (viewport.width === 1440) {
      expect(drugList.x + drugList.width).toBeLessThanOrEqual(drugDetail.x + 1);
      expect(drugList.width).toBeGreaterThanOrEqual(300);
      expect(drugDetail.width).toBeGreaterThan(drugList.width);
    } else {
      expect(drugDetail.y).toBeGreaterThanOrEqual(drugList.y + drugList.height - 1);
    }

    const handoff = await box(page, ".decision-consilium-link");
    const saveRating = await box(page, ".my-rating .primary-button");
    expect(handoff.height).toBeGreaterThanOrEqual(44);
    expect(saveRating.height).toBeGreaterThanOrEqual(44);

    await attachScreenshot(page, testInfo, `drug-${viewport.name}.png`);

    await page.goto("/cardiology?view=consilium");
    await expect(page.getByRole("heading", { level: 1, name: "Консилиум" })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    const consiliumWorkspace = await box(page, ".decision-workspace");
    const personas = await box(page, ".consilium-personas");
    const chat = await box(page, ".consilium-chat");
    const synthesis = await box(page, ".consilium-synthesis");
    expect(consiliumWorkspace.y).toBeLessThan(360);

    if (viewport.width === 1440) {
      expect(personas.x + personas.width).toBeLessThanOrEqual(chat.x + 1);
      expect(chat.x + chat.width).toBeLessThanOrEqual(synthesis.x + 1);
      expect(chat.width).toBeGreaterThan(personas.width);
      expect(chat.width).toBeGreaterThan(synthesis.width);
    } else {
      expect(chat.y).toBeGreaterThanOrEqual(personas.y + personas.height - 1);
      expect(synthesis.y).toBeGreaterThanOrEqual(chat.y + chat.height - 1);
    }

    const composer = await box(page, ".composer-row");
    const send = await box(page, ".composer-row .primary-button");
    expect(composer.x).toBeGreaterThanOrEqual(0);
    expect(composer.x + composer.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(send.height).toBeGreaterThanOrEqual(44);

    await attachScreenshot(page, testInfo, `consilium-${viewport.name}.png`);
  });
}
