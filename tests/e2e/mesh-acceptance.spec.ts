import { expect, test } from "@playwright/test";

/**
 * Intent → plan → sources → evidence graph → manifest → renderer, from the
 * physician's side: one input, one coherent result, provenance visible, no
 * machinery. Live sources may be unreachable in CI, so every assertion holds
 * whether the sources answered or not.
 */

const QUESTION = "Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?";

test("one input, no source picker: the system chooses sources", async ({ page }) => {
  await page.goto("/cardiology");
  const main = page.locator("main");
  await expect(page.getByRole("textbox", { name: "Что хотите узнать или сделать?" })).toBeVisible();
  await expect(main.getByRole("combobox")).toHaveCount(0);
  await expect(main.getByRole("checkbox")).toHaveCount(0);
});

test("acceptance: empagliflozin in HFpEF renders a compiled, sourced, honest guideline answer", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/cardiology");
  await page.getByRole("textbox", { name: "Что хотите узнать или сделать?" }).fill(QUESTION);
  await expect(page.locator(".pt-input .ws-route")).toContainText("клинические рекомендации");
  await page.locator(".pt-input .ws-composer-run").click();
  await expect(page).toHaveURL(/\/cardiology\/ask\?run=/, { timeout: 100_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Клинические рекомендации" })).toBeVisible();

  // The interior is compiled from a manifest; the shell is unchanged.
  const experience = page.locator(".pt-experience");
  await expect(experience).toHaveAttribute("data-mode", "guideline_delta");
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
  const modules = await page.locator("[data-module]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-module")));
  expect(["key_takeaway", "notices"]).toContain(modules[0]);
  if (await page.locator(".pt-version, .pt-answer, .pt-drug").count()) expect(modules.at(-1)).toBe("next_actions");

  // Official status is never asserted: the rubricator is a hand-off.
  await expect(page.getByRole("complementary", { name: "Статус рекомендаций в России" })).toContainText("не подключён");

  // Provenance is visible: every source used is listed with its state; every version links to its page.
  const sources = page.locator("details[data-module='sources']");
  if (await sources.count()) {
    await sources.locator("summary").click();
    await expect(sources).toContainText(/Онлайн|Снимок|Недоступно|Проверка по ссылке/u);
  }
  for (const version of await page.locator("[data-module='recommendation_delta'] .pt-version").all()) {
    await expect(version.getByRole("link", { name: /Открыть/u }).first()).toHaveAttribute("href", /^(https?:\/\/|\/)/u);
  }
  // If the Russian guideline copy was read and its revision is overdue, that is said in words next to it.
  const delta = page.locator("[data-module='recommendation_delta']");
  if (await delta.count() && (await delta.innerText()).includes("МЕДИ РУ")) {
    await expect(page.locator("[data-module='key_takeaway']")).toContainText(/пересмотр|версии/u);
  }
  // Conflicts between sources are shown with both sides, never resolved by the product.
  const conflict = page.locator("[data-module='conflict']");
  if (await conflict.count()) await expect(conflict).toContainText("Продукт не решает, какой источник прав");

  // No implementation vocabulary on the result surface.
  await expect(page.locator(".pt-result")).not.toContainText(/агент|планировщик|манифест|граф доказательств/iu);
});
