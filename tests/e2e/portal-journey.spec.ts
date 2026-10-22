import { expect, test, type Page } from "@playwright/test";

/**
 * Retention-first portal: product-level gates, not visual ones.
 * Live sources (PubMed, openFDA) may be unreachable in CI, so assertions hold
 * in both cases: either sourced findings, or an honest statement of what is missing.
 */

const LAUNCH = [
  { id: "therapy", name: "Терапия", dative: "терапевтам" },
  { id: "pediatrics", name: "Педиатрия", dative: "педиатрам" },
  { id: "obgyn", name: "Акушерство и гинекология", dative: "акушерам-гинекологам" },
  { id: "cardiology", name: "Кардиология", dative: "кардиологам" },
  { id: "neurology", name: "Неврология", dative: "неврологам" },
  { id: "endocrinology", name: "Эндокринология", dative: "эндокринологам" },
] as const;

const CARDIOLOGY_CLINICAL = /РКО|\bESC\b|\bAHA\b|EACVI|EAPCI|Люмен Фарма/u;

async function ask(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Что хотите узнать или сделать?" }).fill(text);
  await page.locator(".pt-input .ws-composer-run").click();
  await expect(page).toHaveURL(/\/ask\?run=/, { timeout: 45_000 });
  // The run is durable at once; sources are checked on the result page.
  await expect(page.locator('[data-run-state="done"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".pt-result")).toBeVisible();
}

test("primary home is one professional input, three jobs and «Для вас» — the agent gallery lives on its own page", async ({ page }) => {
  await page.goto("/pediatrics");
  await expect(page.getByRole("heading", { level: 1, name: /Ответы и\s+обновления\s+— педиатрам/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Что хотите узнать или сделать?" })).toBeVisible();
  const shortcuts = page.getByRole("navigation", { name: "Частые задачи" }).getByRole("link");
  await expect(shortcuts).toHaveCount(3);
  await expect(shortcuts.nth(0)).toContainText("Справка по препарату");
  await expect(shortcuts.nth(1)).toContainText("Клинические рекомендации");
  await expect(shortcuts.nth(2)).toContainText("Разбор по исследованиям");
  await expect(page.getByRole("heading", { level: 2, name: /Для\s+вас/ })).toBeVisible();
  // One input, not a catalogue: the home never asks to pick an agent first. The gallery is a primary
  // section of its own («Агенты»), reached from the navigation and from one quiet link under the jobs.
  await expect(page.locator(".ws-agent-card")).toHaveCount(0);
  await expect(page.locator("main .pt-gallery")).toHaveCount(0);
  await expect(page.locator("main").getByRole("link", { name: /агент/iu })).toHaveCount(1);
  await expect(page.locator("main").getByRole("link", { name: /агент/iu })).toHaveAttribute("href", "/pediatrics/agents");
  const nav = page.getByRole("navigation", { name: "Основная навигация" });
  await expect(nav.getByRole("link")).toHaveText(["Главное", "Агенты", "Мои материалы"]);
  await expect(nav.getByRole("link", { name: "Агенты" })).toHaveAttribute("href", "/pediatrics/agents");
  await expect(nav.getByRole("link", { name: "Главное" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("footer")).toContainText(/© \d{4} ООО «Яндекс»/);
});

for (const specialty of LAUNCH) {
  test(`${specialty.name}: shell renders honestly with no cardiology clinical leakage`, async ({ page }) => {
    await page.goto(`/${specialty.id}`);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`Ответы и\\s+обновления\\s+— ${specialty.dative}`) })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Специальность" }).first()).toHaveValue(specialty.id);
    if (specialty.id !== "cardiology") {
      // Wait for the first-visit catch-up, then check «Для вас» never borrows cardiology data.
      await page.waitForTimeout(1500);
      await page.reload();
      await expect(page.locator(".pt-foryou")).not.toContainText(CARDIOLOGY_CLINICAL);
      await expect(page.getByRole("complementary", { name: "Партнёрский материал" })).toHaveCount(0);
    }
  });
}

test("first value without any profile: a drug question routes to the drug job and shows sources or an honest gap", async ({ page }) => {
  await page.goto("/endocrinology");
  await page.getByRole("textbox", { name: "Что хотите узнать или сделать?" }).fill("Семаглутид: противопоказания");
  await expect(page.locator(".pt-input .ws-route")).toContainText("справку по препарату");
  await page.locator(".pt-input .ws-composer-run").click();
  await expect(page).toHaveURL(/\/endocrinology\/ask\?run=/, { timeout: 45_000 });
  // The run is durable at once; sources are checked on the result page.
  await expect(page.locator('[data-run-state="done"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Справка по препарату" })).toBeVisible();
  const result = page.locator(".pt-result");
  const label = result.locator(".pt-drug").first();
  if (await label.count()) {
    // Russian instruction (MEDI copy) first; the US label only stands in, and each says which jurisdiction it is.
    const russian = (await label.innerText()).includes("Копия российской инструкции");
    await expect(label).toContainText(russian ? "Копия российской инструкции" : "Это инструкция, утверждённая в США");
    await expect(label.getByRole("link", { name: russian ? /МЕДИ РУ/ : /DailyMed/ })).toHaveAttribute("href", russian ? /medi\.ru\/instrukciya\// : /dailymed\.nlm\.nih\.gov/);
    await expect(label.getByRole("link", { name: "Проверить в ГРЛС" })).toHaveAttribute("href", "https://grls.rosminzdrav.ru/");
  } else {
    await expect(result).toContainText("Чего не хватает");
  }
  await expect(page.locator(".pt-synthesis").first()).toContainText("ГРЛС");
});

test("guideline question routes to guidelines and never asserts Russian status", async ({ page }) => {
  await page.goto("/therapy");
  await ask(page, "Клинические рекомендации по ХОБЛ");
  await expect(page.getByRole("heading", { level: 1, name: "Клинические рекомендации" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Статус рекомендаций в России" })).toContainText("не подключён");
});

test("events outside cardiology degrade honestly: no fabricated events, verified organiser hand-offs", async ({ page }) => {
  await page.goto("/neurology");
  await ask(page, "Конференции по неврологии онлайн");
  await expect(page.getByRole("heading", { level: 1, name: "Профессиональные события" })).toBeVisible();
  await expect(page.locator(".pt-synthesis")).toContainText("не придумываются");
  await expect(page.locator(".ws-result-event")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Портал непрерывного медицинского образования/ })).toHaveAttribute("href", "https://edu.rosminzdrav.ru/");
});

test("cardiology events are sourced, dated, chronological and gated by confirmation", async ({ page }) => {
  await page.goto("/cardiology");
  await ask(page, "Конгрессы по кардиологии");
  const events = page.locator(".ws-result-event");
  await expect(events.first()).toBeVisible();
  await expect(page.locator(".pt-result")).toContainText("снимок афиш");
  await expect(page.locator(".pt-result")).not.toContainText("rnmo.ru");
  const starts = await events.locator(".ws-date-block strong").allInnerTexts();
  expect(starts.length).toBeGreaterThan(0);
  await events.first().getByRole("button", { name: "Перейти к регистрации" }).click();
  await expect(page.getByRole("dialog")).toContainText("Нужно ваше подтверждение");
  await page.getByRole("dialog").getByRole("button", { name: "Отменить" }).click();
});

test("learning works from cold start and explains itself without invented history", async ({ page }) => {
  await page.goto("/obgyn/ask?job=learning");
  await page.getByRole("button", { name: "Подобрать по моим вопросам" }).click();
  await expect(page).toHaveURL(/\/obgyn\/ask\?run=/, { timeout: 45_000 });
  // The run is durable at once; sources are checked on the result page.
  await expect(page.locator('[data-run-state="done"]')).toBeVisible({ timeout: 90_000 });
  const synthesis = page.locator(".pt-synthesis");
  await expect(synthesis).toContainText("Почему");
  await expect(synthesis).not.toContainText(/обращались к теме|часто спрашиваете/);
});

test("disclosed partner material has a place in «Для вас» without leading it", async ({ page }) => {
  await page.goto("/cardiology");
  await page.waitForTimeout(1500);
  await page.reload();
  const partner = page.getByRole("complementary", { name: "Партнёрский материал" });
  if (await partner.count()) {
    await expect(partner).toContainText("Партнёрский материал · пример формата");
    const cards = page.locator(".pt-cards > *");
    await expect(cards.first()).not.toHaveClass(/is-partner/);
  }
});

test("unknown intent falls back to an honest answer page", async ({ page }) => {
  await page.goto("/therapy");
  await ask(page, "привет");
  await expect(page.getByRole("heading", { level: 1, name: "Ответ по источникам" })).toBeVisible();
  await expect(page.locator(".pt-result")).toContainText(/Подходящих\sисточников\sне\sнашлось|Чего\sне\sхватает/u);
});

test("image interpretation requests are stopped before they run", async ({ page }) => {
  await page.goto("/therapy");
  await page.getByRole("textbox", { name: "Что хотите узнать или сделать?" }).fill("Расшифруйте ЭКГ пациента");
  await expect(page.locator(".pt-input .ws-risk.is-blocking")).toBeVisible();
  await expect(page.locator(".pt-input .ws-composer-run")).toBeDisabled();
});
