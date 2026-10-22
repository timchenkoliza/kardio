import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Physician-facing product surface (P0 recovery): Russian-first feed with
 * media, whole-card navigation in the same tab, originals collapsed, the
 * agent gallery, «Мои материалы» and a session that survives navigation.
 * Live sources may be unreachable in CI: every assertion holds either way.
 */

const LAUNCH = ["therapy", "pediatrics", "obgyn", "cardiology", "neurology", "endocrinology"] as const;
const CARDIOLOGY_CLINICAL = /РКО|\bESC\b|\bAHA\b|EACVI|EAPCI|Люмен Фарма/u;
const JARGON = /белом списке|white-?list|verificationNote|\bLIVE\b|\bMOCK\b|\bUNVERIFIED\b|\bDERIVED\b|\bSkill\b|\bFlow\b|\brun-[0-9a-f]{8}|policy_|rule_id|коннектор/u;
/** Four or more consecutive English words: prose, not a journal name or an INN. */
const ENGLISH_PROSE = /(?:\b[A-Za-z][A-Za-z'’-]+\b[\s,;:]+){4,}[A-Za-z]{2,}/u;

/** Card pictures are approved derivatives or in-house art: never a source image (MEDIA-01, MEDIA-07). */
async function expectOnlyDerivedMedia(page: Page) {
  const derived = page.locator('.pt-card-media[data-media="derivative"]');
  for (const figure of await derived.all()) {
    await expect(figure).toHaveAttribute("data-derivative-id", /^drv-/u);
    await expect(figure).toHaveAttribute("data-pipeline", /^ds-tonal-redraw@/u);
    await expect(figure.locator("img")).toHaveAttribute("src", /^\/media\/derived\//u);
  }
  await expect(page.locator('.pt-cards img[src*="/media/cardiology/"], .pt-cards img[src*="/media/source/"], .pt-cards img[src*="attempt-"]')).toHaveCount(0);
}

async function warmFeed(page: Page, specialty: string) {
  await page.goto(`/${specialty}`);
  // First visit runs the catch-up; the reload shows what it found.
  await page.waitForTimeout(1500);
  await page.reload();
}

async function ask(page: Page, specialty: string, text: string) {
  await page.goto(`/${specialty}`);
  await page.getByRole("textbox", { name: "Что хотите узнать или сделать?" }).fill(text);
  await page.locator(".pt-input .ws-composer-run").click();
  await expect(page).toHaveURL(new RegExp(`/${specialty}/ask\\?run=run-`, "u"), { timeout: 45_000 });
  await expect(page.locator('[data-run-state="done"]')).toBeVisible({ timeout: 90_000 });
}

/** Text the physician reads first (outside «Показать оригинал»). */
async function primaryText(scope: Locator): Promise<string[]> {
  return scope.evaluate(root => {
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".pt-original, .pt-original-body").forEach(node => node.remove());
    return [...clone.querySelectorAll(".pt-derived, .pt-quote p, .pt-version-title, .pt-drug-title, .pt-drug-entry > p, h2, h3")].map(node => (node.textContent ?? "").trim()).filter(Boolean);
  });
}

async function expectRussianFirst(page: Page) {
  const experience = page.locator(".pt-experience");
  await expect(experience).toBeVisible();
  for (const text of await primaryText(experience)) expect(text, text).not.toMatch(ENGLISH_PROSE);
  // Every original-language passage starts collapsed.
  await expect(experience.locator("details.pt-original[open]")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(JARGON);
}

test("home: the whole card opens its page in the same tab; only the first source opens a new tab", async ({ page, context }) => {
  await warmFeed(page, "neurology");
  const cards = page.locator(".pt-cards > article.pt-card");
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator(".pt-cards > article.pt-card.has-media .pt-card-media").first()).toBeVisible();
  await expectOnlyDerivedMedia(page);
  for (const title of await page.locator(".pt-card-title").allInnerTexts()) {
    expect(title).toMatch(/[А-Яа-яЁё]/u);
    expect(title).not.toMatch(ENGLISH_PROSE);
  }
  await expect(page.locator("main")).not.toContainText(JARGON);

  const card = cards.first();
  const link = card.locator(".pt-card-link");
  await expect(link).not.toHaveAttribute("target", /.+/u);
  await expect(link).toHaveAttribute("href", /^\/neurology\/item\//u);
  const source = card.locator(".pt-source-link");
  await expect(source).toContainText("Открыть первоисточник");
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(source).toHaveAttribute("href", /^https:\/\//u);

  // A click anywhere on the card (not on its buttons) opens the item page here.
  const pages = context.pages().length;
  await card.click({ position: { x: 24, y: 24 } });
  await expect(page).toHaveURL(/\/neurology\/item\//u);
  expect(context.pages().length).toBe(pages);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".pt-item-facts")).toContainText("Почему вы это видите");
  const original = page.locator("details.pt-original");
  if (await original.count()) {
    await expect(original).not.toHaveAttribute("open", /.*/u);
    await original.locator("summary").click();
    await expect(original.locator(".pt-original-body")).toBeVisible();
  }
  await expect(page.locator("main")).not.toContainText(JARGON);
  await page.getByRole("link", { name: "К ленте" }).click();
  await expect(page).toHaveURL(/\/neurology$/u);
});

test("six launch specialties: a non-empty Russian feed without another specialty's content", async ({ page }) => {
  test.setTimeout(150_000);
  for (const specialty of LAUNCH) {
    await warmFeed(page, specialty);
    const cards = page.locator(".pt-cards > article.pt-card");
    expect(await cards.count(), specialty).toBeGreaterThanOrEqual(3);
    await expectOnlyDerivedMedia(page);
    for (const id of await page.locator('.pt-card-media[data-media="derivative"]').evaluateAll(nodes => nodes.map(node => node.getAttribute("data-derivative-id") ?? ""))) expect(id, specialty).toMatch(new RegExp(`^drv-${specialty}-`, "u"));
    if (specialty !== "cardiology") {
      await expect(page.locator(".pt-foryou")).not.toContainText(CARDIOLOGY_CLINICAL);
      // An editorial selection is always labelled as one, never as new.
      for (const curated of await page.locator('.pt-card[data-showcase="true"]').all()) {
        await expect(curated.locator(".pt-curated")).toHaveText("Подборка");
        await expect(curated.locator(".ws-new")).toHaveCount(0);
      }
    }
    await expect(page.locator(".pt-foryou")).not.toContainText(JARGON);
  }
});

test("drug result: key information and label sections in Russian, the label text behind «Показать оригинал»", async ({ page }) => {
  test.setTimeout(150_000);
  await ask(page, "neurology", "Леветирацетам при беременности");
  await expect(page.getByRole("heading", { level: 1, name: "Справка по препарату" })).toBeVisible();
  const label = page.locator(".pt-drug").first();
  if (await label.count()) {
    await expect(label.locator(".pt-drug-key")).toContainText("Ключевая информация");
    const headings = await label.locator(".pt-drug-section h3").allInnerTexts();
    for (const heading of headings) expect(["Показания", "Дозирование", "Противопоказания", "Безопасность", "Взаимодействия", "Особые группы", "Другие разделы"]).toContain(heading);
    await expect(label.getByRole("link", { name: "Проверить в ГРЛС" })).toHaveAttribute("href", "https://grls.rosminzdrav.ru/");
  } else {
    await expect(page.locator(".pt-result")).toContainText("Чего не хватает");
  }
  await expectRussianFirst(page);
});

test("guideline result: version titles in Russian, sources and Russian status hand-off", async ({ page }) => {
  test.setTimeout(150_000);
  await ask(page, "cardiology", "Что изменилось в рекомендациях по ХСН");
  await expect(page.getByRole("heading", { level: 1, name: "Клинические рекомендации" })).toBeVisible();
  for (const title of await page.locator(".pt-version-title").allInnerTexts()) expect(title).toMatch(/[А-Яа-яЁё]/u);
  await expect(page.getByRole("complementary", { name: "Статус рекомендаций в России" })).toContainText("не подключён");
  await expectRussianFirst(page);
});

test("research result: Russian document titles, authors' conclusions collapsed", async ({ page }) => {
  test.setTimeout(150_000);
  await ask(page, "neurology", "Рассеянный склероз");
  const answers = page.locator(".pt-answer");
  for (const answer of await answers.all()) {
    await expect(answer.locator(".pt-version-title")).toHaveText(/[А-Яа-яЁё]/u);
    await expect(answer.locator(".pt-card-actions a").first()).toHaveAttribute("href", /^(https:\/\/|\/)/u);
  }
  await expectRussianFirst(page);
});

test("agents gallery: nine agents with mascots launch their job in the same tab", async ({ page }) => {
  await page.goto("/neurology/agents");
  await expect(page.getByRole("heading", { level: 1, name: /Агенты для специальности/ })).toBeVisible();
  const agents = page.locator(".pt-gallery > li");
  await expect(agents).toHaveCount(9);
  await expect(page.locator(".pt-gallery svg.mascot[aria-hidden='true']")).toHaveCount(9);
  // Risk scores are cardiology tools: elsewhere the card says so and has no link.
  const calculators = page.locator('.pt-agent[data-agent="calculators"]');
  await expect(calculators).toHaveClass(/is-soon/u);
  await expect(calculators.getByRole("link")).toHaveCount(0);
  // Motion is decorative and off under prefers-reduced-motion.
  const drug = page.locator('.pt-agent[data-agent="drug"]');
  await drug.hover();
  expect(await drug.locator(".sm-figure").evaluate(node => getComputedStyle(node).animationName)).toBe("none");
  await drug.getByRole("link", { name: "Справка по препарату" }).click();
  await expect(page).toHaveURL(/\/neurology\/ask\?job=drug$/u);
  await expect(page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link", { name: "Агенты" })).toBeVisible();
});

test("materials: onboarding and an example when empty; a PubMed link gets a real title, never the URL", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/endocrinology/materials");
  await expect(page.getByRole("heading", { level: 2, name: "Соберите свою базу" })).toBeVisible();
  const examples = page.locator('.ws-material[data-example="true"]');
  expect(await examples.count()).toBeGreaterThan(0);
  await expect(examples.first().locator(".pt-curated")).toHaveText("Пример");
  await expect(examples.first().getByRole("link", { name: "Открыть первоисточник" })).toHaveAttribute("target", "_blank");
  await expect(page.locator(".pt-mat-toolbar")).toHaveCount(0);

  await page.locator(".pt-mat-onboarding").getByRole("button", { name: "Добавить ссылку" }).click();
  const url = "https://pubmed.ncbi.nlm.nih.gov/42862133/";
  await page.getByLabel("Ссылка").fill(url);
  await page.getByRole("button", { name: "Сохранить ссылку" }).click();
  const saved = page.locator(".ws-material:not([data-example])").first();
  await expect(saved).toBeVisible({ timeout: 20_000 });
  const title = (await saved.locator(".ws-material-title").innerText()).trim();
  expect(title).not.toBe(url);
  expect(title).not.toContain("pubmed.ncbi.nlm.nih.gov");
  expect(title.length).toBeGreaterThan(10);
  await expect(saved.getByRole("link", { name: "Открыть первоисточник" })).toHaveAttribute("href", url);

  // Populated: onboarding gives way to the library with sorting and filters.
  await expect(page.locator(".pt-mat-onboarding")).toHaveCount(0);
  await expect(page.getByLabel("Сортировка").locator("option")).toHaveText(["Сначала новые", "По дате добавления", "По дате публикации", "По формату"]);
  await expect(page.getByLabel("Подборка").locator("option").first()).toHaveText("Подборка: Все");
  await page.getByLabel("Сортировка").selectOption("published");
  await expect(page.locator(".ws-material:not([data-example])")).toHaveCount(1);
});

test("session: a result survives going to materials and back, and a saved result is in the library", async ({ page }) => {
  test.setTimeout(150_000);
  await ask(page, "neurology", "Рекомендации по рассеянному склерозу");
  const runUrl = page.url();
  const save = page.locator(".pt-experience").getByRole("button", { name: "Сохранить" }).first();
  const saving = await save.count() > 0;
  if (saving) {
    await save.click();
    await expect(page.locator(".pt-experience").getByRole("link", { name: "В материалах" }).first()).toBeVisible({ timeout: 15_000 });
  }
  await page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link", { name: "Мои материалы" }).click();
  await expect(page).toHaveURL(/\/neurology\/materials$/u);
  if (saving) await expect(page.locator(".ws-material:not([data-example])").first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(runUrl);
  await expect(page.locator(".pt-question")).toContainText("Рекомендации по рассеянному склерозу");
  await expect(page.locator('[data-run-state="done"]')).toBeVisible();
});

test("shell: the footer stays at the bottom of a short page; profile is one click away", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/neurology/tools");
  const footer = page.locator("footer.ws-footer");
  await expect(footer).toContainText(/© \d{4} ООО «Яндекс»/u);
  const box = await footer.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThanOrEqual(899);
  await page.getByRole("link", { name: /профиль и настройки/iu }).first().click();
  await expect(page).toHaveURL(/\/neurology\/settings#profile$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Профиль и настройки" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/neurology");
  await expect(page.getByRole("navigation", { name: "Разделы" }).getByRole("link")).toHaveText(["Главное", "Агенты", "Материалы", "Обезличить", /Профиль/u]);
});

test("media audit (Preview/dev): every source shows SOURCE → TRANSFORMED → CARD", async ({ page }) => {
  await page.goto("/admin/media-audit");
  await expect(page.getByRole("heading", { level: 1, name: "Источник → преобразование → карточка" })).toBeVisible();
  const rows = page.locator(".ma-row");
  expect(await rows.count()).toBeGreaterThanOrEqual(13);
  for (const specialty of ["Терапия", "Педиатрия", "Акушерство и гинекология", "Кардиология", "Неврология", "Эндокринология"]) {
    await expect(page.getByRole("heading", { level: 2, name: specialty })).toBeVisible();
  }
  const approvedRows = page.locator('.ma-row[data-status="approved"]');
  expect(await approvedRows.count()).toBeGreaterThanOrEqual(13);
  for (const row of (await approvedRows.all()).slice(0, 4)) {
    await expect(row.locator('[data-column="source"] img')).toHaveAttribute("src", /^\/media\/(source|cardiology)\//u);
    await expect(row.locator('[data-column="transformed"] img')).toHaveAttribute("src", /^\/media\/derived\//u);
    await expect(row.locator('[data-column="card"] article.pt-card')).toBeVisible();
  }
  await expect(page.locator('.ma-row[data-status="rejected"]').first()).toBeVisible();
});
