import { expect, test, type Page } from "@playwright/test";

/**
 * Product shell (pixel-first): composer states and answer modes, suggestions
 * and quick agents, the profile that persists, the de-identification tool
 * apart from materials, deterministic media geometry and the three viewports.
 */

const VIEWPORTS = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }] as const;

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test("composer: states, no depth choice before the question, the profile default stored with the run", async ({ page }) => {
  test.setTimeout(150_000);
  // UX-01: depth is a profile default, never a choice before the question.
  await page.goto("/cardiology/settings");
  await page.getByRole("radiogroup", { name: "Что получить в разборе по умолчанию" }).getByRole("radio", { name: /Найти статьи/ }).click();
  await expect(page.locator(".pt-profile-saved").first()).toBeVisible();
  await page.goto("/cardiology");
  const composer = page.locator("form.pt-composer");
  await expect(composer).toHaveAttribute("data-state", "idle");
  const input = page.getByRole("textbox", { name: "Что хотите узнать или сделать?" });
  await expect(page.locator(".pt-composer .ws-composer-run")).toBeDisabled();
  await input.focus();
  await expect(composer).toHaveAttribute("data-state", "focused");
  await input.fill("Апиксабан: противопоказания и взаимодействия");
  await expect(composer).toHaveAttribute("data-state", "typing");
  await expect(page.locator(".pt-composer .ws-composer-run")).toBeEnabled();

  await expect(page.getByRole("radiogroup", { name: "Режим ответа" })).toHaveCount(0);
  // Suggestions and quick tasks are queries and jobs, never a depth.
  await expect(page.locator('.pt-suggestions[data-kind="query"] .pt-suggestion').first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Частые задачи" }).getByRole("link")).toHaveCount(3);

  await page.locator(".pt-composer .ws-composer-run").click();
  await expect(page).toHaveURL(/\/cardiology\/ask\?run=run-/u, { timeout: 45_000 });
  await expect(page.locator('[data-run-state="done"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".pt-ask")).toHaveAttribute("data-answer-mode", "short");
  // The depth was not chosen for this question, so it is not shown as a choice on the answer.
  await expect(page.locator(".pt-mode-chip")).toHaveCount(0);
});

test("profile: identity, default mode and sources persist after refresh; the home asks no depth", async ({ page }) => {
  await page.goto("/cardiology/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Профиль и настройки" })).toBeVisible();
  await page.getByRole("button", { name: "Изменить" }).click();
  await page.getByLabel("Имя").fill("Василий Иванов");
  await page.getByLabel("Место работы").fill("ГКБ №52");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator(".pt-identity-copy strong")).toHaveText("Василий Иванов");
  await page.getByRole("radiogroup", { name: "Что получить в разборе по умолчанию" }).getByRole("radio", { name: /Академическая основа/ }).click();
  await expect(page.locator(".pt-profile-saved").first()).toBeVisible();
  await page.locator('.pt-source[data-source="nejm"] select').selectOption("excluded");
  await expect(page.locator('.pt-source[data-source="nejm"]')).toHaveAttribute("data-state", "excluded");

  await page.reload();
  await expect(page.locator(".pt-identity-copy strong")).toHaveText("Василий Иванов");
  await expect(page.getByRole("radiogroup", { name: "Что получить в разборе по умолчанию" }).getByRole("radio", { name: /Академическая основа/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('.pt-source[data-source="nejm"]')).toHaveAttribute("data-state", "excluded");

  await page.goto("/cardiology");
  await expect(page.getByRole("radiogroup", { name: "Режим ответа" })).toHaveCount(0);
  await expect(page.locator(".ws-profile-entry, .ws-tabbar").first()).toBeVisible();
});

test("de-identification: its own tool with four tabs; materials stay a library", async ({ page }) => {
  await page.goto("/cardiology/materials");
  await expect(page.getByRole("heading", { level: 1, name: "Мои материалы" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Обезличивание");

  await page.goto("/cardiology/anonymizer");
  await expect(page.getByRole("heading", { level: 1, name: "Обезличивание" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveText(["Обработка", "История", "Статистика", "Настройки"]);
  await expect(page.locator(".ws-material")).toHaveCount(0);
  await page.getByLabel("Файлы для обезличивания").setInputFiles({ name: "выписка.txt", mimeType: "text/plain", buffer: Buffer.from("Пациент: Иванов Иван Иванович. Телефон +7 999 123-45-67, почта ivanov@example.com. Диагноз: ХСН.") });
  const job = page.locator(".pt-anon-job").first();
  await expect(job).toHaveAttribute("data-status", "completed", { timeout: 10_000 });
  await expect(job).toContainText("Найдено и заменено: 3");
  await expect(job.getByRole("button", { name: "Скачать результат" })).toBeVisible();
  await job.getByRole("button", { name: "Перейти к статистике" }).click();
  await expect(page.getByRole("tab", { name: "Статистика" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".pt-anon-stat").first()).toContainText("3");
  await page.getByRole("tab", { name: "История" }).click();
  await expect(page.locator(".pt-anon-table tbody tr")).toHaveCount(1);
  await page.getByRole("tab", { name: "Настройки" }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(8);
});

test("media geometry: feed 2:1, open material 3:1, no layout shift", async ({ page }) => {
  await page.goto("/neurology");
  await page.waitForTimeout(1500);
  await page.reload();
  const feed = page.locator('.pt-card-media[data-media="derivative"] img').first();
  await expect(feed).toBeVisible();
  const ratio = await feed.evaluate(node => { const box = node.getBoundingClientRect(); return box.width / box.height; });
  expect(Math.abs(ratio - 2)).toBeLessThan(0.05);
  const shift = await page.evaluate(() => new Promise<number>(resolve => {
    let total = 0;
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!entry.hadRecentInput) total += entry.value; });
    observer.observe({ type: "layout-shift", buffered: true });
    setTimeout(() => { observer.disconnect(); resolve(total); }, 800);
  }));
  expect(shift).toBeLessThan(0.1);

  await page.locator(".pt-cards > article.pt-card").filter({ has: page.locator('.pt-card-media[data-media="derivative"]') }).first().locator(".pt-card-link").click();
  await expect(page).toHaveURL(/\/neurology\/item\//u);
  const hero = page.locator('.pt-item-hero[data-media="derivative"] img');
  await expect(hero).toBeVisible();
  const heroRatio = await hero.evaluate(node => { const box = node.getBoundingClientRect(); return box.width / box.height; });
  expect(Math.abs(heroRatio - 3)).toBeLessThan(0.05);
});

test("visual audit page renders every component state outside production", async ({ page }) => {
  await page.goto("/__visual-audit");
  await expect(page.getByRole("heading", { level: 1, name: "Визуальный аудит product shell" })).toBeVisible();
  for (const sample of ["composer-idle", "composer-focused", "composer-typing", "composer-submitting", "composer-disabled", "composer-error", "mode-short", "mode-full", "mode-research", "mode-hover", "mode-reduced-motion", "mascot-canonical", "mascot-drug", "mascot-guidelines", "mascot-research", "mascot-events", "mascot-materials", "card-media", "card-no-media", "card-long-title", "card-long-summary", "media-3-1", "upload-empty", "upload-processing", "upload-completed", "upload-failed"]) {
    await expect(page.locator(`[data-sample="${sample}"]`), sample).toBeVisible();
  }
});

for (const viewport of VIEWPORTS) {
  test(`shell at ${viewport.width}: no overflow, controls intact, 44 px targets`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1024, isMobile: viewport.width < 768 });
    const page = await context.newPage();
    for (const path of ["/cardiology", "/cardiology/settings", "/cardiology/materials", "/cardiology/anonymizer"]) {
      await page.goto(path);
      await expectNoOverflow(page);
    }
    await page.goto("/cardiology");
    const composer = page.locator("form.pt-composer .pt-composer-surface");
    const box = await composer.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(88);
    if (viewport.width < 1024) {
      for (const selector of [".pt-mode", ".pt-suggestion", ".pt-composer .ws-composer-run", ".ws-tab"]) {
        const heights = await page.locator(selector).evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
        for (const height of heights) expect(height, selector).toBeGreaterThanOrEqual(44);
      }
    } else {
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(880);
      await expect(page.locator(".ws-sidebar .ws-nav-item")).toHaveText(["Главное", "История", "Мои материалы", "Обезличивание"]);
    }
    await context.close();
  });
}
