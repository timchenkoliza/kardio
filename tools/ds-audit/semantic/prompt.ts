import type { Finding, PageSnapshot } from "../types";

/**
 * Prompt for the advisory semantic layer (not sent anywhere in v1).
 * Input: DS README, visible text with locators, deterministic findings (to avoid duplicates).
 * Screenshots are attached as images by the caller.
 */
export function buildSemanticPrompt(input: { readme: string; snapshots: PageSnapshot[]; deterministic: Finding[] }): string {
  const pages = input.snapshots.map(s => [
    `### ${s.route} · ${s.viewport}`,
    ...s.texts.filter(t => !t.excluded).slice(0, 400).map(t => `- \`${t.component}\` ${t.kind === "text" ? "" : `(${t.kind}) `}${t.text}`),
  ].join("\n")).join("\n\n");
  const known = input.deterministic.map(f => `- ${f.id} ${f.pages.join(",")} ${f.where}: ${f.fact}`).join("\n");
  return [
    "Ты — аудитор дизайн-системы Яндекс Мед. Проверь страницы на то, что не умеет механическая проверка:",
    "тон и правила текстов (третье лицо в интерфейсе, кнопки — реплики пользователя, ошибки с подсказкой, пустые состояния с действием),",
    "внутренний жаргон и служебные метки, больше одной основной кнопки на экране, акцентные тона вне своего значения,",
    "визуальную лексику вне DS, непоследовательные названия одного понятия, изображения не из системы иллюстраций.",
    "Каждая находка обязана ссылаться на факт: `selector` — локатор из списка ниже, `quote` — дословный видимый текст.",
    "Не повторяй находки детерминированного слоя. Ответь строго JSON по схеме.",
    "",
    "## Дизайн-система",
    input.readme,
    "",
    "## Уже найдено механической проверкой",
    known || "—",
    "",
    "## Страницы",
    pages,
  ].join("\n");
}
