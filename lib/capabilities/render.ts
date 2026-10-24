import { CAPABILITIES, CAPABILITY_STATUSES, DOCUMENT_CONFLICTS, SOURCE_ROWS, type Capability, type CapabilityStatus } from "./coverage";

/**
 * Renders docs/CAPABILITY_COVERAGE_MATRIX.md from the registry. The document
 * is generated (never edited by hand): `npm run capabilities:matrix` writes it,
 * and tests/unit/capability-coverage.test.ts fails when it is out of date.
 */

const cell = (value: string) => value.replace(/\|/gu, "\\|").replace(/\n/gu, " ");
const list = (values: readonly string[]) => (values.length ? values.map(cell).join("; ") : "—");

const AGENT_LABEL: Record<Capability["agent"], string> = {
  reference: "Справка (хост ответа)",
  whats_new: "Что нового для меня",
  guidelines: "Изменения рекомендаций",
  drugs: "Препараты",
  research: "Исследовать тему",
  events: "События",
  learning: "Моё обучение",
  materials: "Мои материалы",
  platform: "Платформа",
};

function counts(pick: (capability: Capability) => CapabilityStatus): string {
  return CAPABILITY_STATUSES.map(status => `${status} ${CAPABILITIES.filter(capability => pick(capability) === status).length}`).join(" · ");
}

export function renderCoverageMatrix(): string {
  const byId = new Map(CAPABILITIES.map(capability => [capability.id, capability]));
  const lines: string[] = [];
  lines.push("# Матрица покрытия сценариев — Kardio");
  lines.push("");
  lines.push("> Сгенерировано из `lib/capabilities/coverage.ts` командой `npm run capabilities:matrix`. Не редактировать вручную: тест `tests/unit/capability-coverage.test.ts` сверяет документ с реестром.");
  lines.push("");
  lines.push("Источник строк: «Сценарии пользователей», лист `23_10_2026`, строки 2–57 (строка 1 — заголовок). Статус «до» — `main` @ `acf3caf`; статус «после» — эта ветка. Статус установлен по коду и тестам, а не по названию компонента.");
  lines.push("");
  lines.push("Статусы: **LIVE** — сценарий проходит целиком на реальном источнике; **PARTIAL** — путь работает, но часть сценария или источника отсутствует (названа в «Чего нет»); **MOCK** — только маркированные синтетические данные; **UNAVAILABLE** — не работает или не должен работать (причина в «Блокеры»).");
  lines.push("");
  lines.push(`Возможностей: ${CAPABILITIES.length}. До: ${counts(capability => capability.statusBefore)}. После: ${counts(capability => capability.status)}.`);
  lines.push("");
  lines.push("## 1. Трассировка исходных строк");
  lines.push("");
  lines.push("| Строка | Тема | Задача врача | Решение | capability_id | Статус после | Комментарий |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  const DISPOSITION: Record<string, string> = { implemented: "сценарий", merged: "объединено", boundary: "граница продукта", out_of_scope: "вне продукта" };
  for (const row of SOURCE_ROWS) {
    const statuses = row.capabilities.map(id => byId.get(id)?.status ?? "?").join(" / ");
    lines.push(`| ${row.row} | ${cell(row.theme)} | ${cell(row.task)} | ${DISPOSITION[row.disposition]} | ${row.capabilities.map(id => `\`${id}\``).join(", ")} | ${statuses} | ${cell(row.note)} |`);
  }
  lines.push("");
  lines.push("## 2. Возможности: исполнитель → инструменты → источники → код → тесты");
  lines.push("");
  lines.push("| capability_id | Сценарий | Задача и результат | Вход | Агент | Инструменты и коннекторы | Источники и приоритет | До → после | Глубина данных | Хранение | Чего нет | Блокеры | Тесты |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const capability of CAPABILITIES) {
    lines.push(`| \`${capability.id}\` | ${capability.scenario ?? "—"} | **${cell(capability.title)}**. ${cell(capability.outcome)} | ${list(capability.entry)} | ${AGENT_LABEL[capability.agent]} | ${list([...capability.tools, ...capability.connectors])} | ${list(capability.sources)}. ${cell(capability.sourcePriority)} | ${capability.statusBefore} → **${capability.status}** | ${capability.depth} | ${cell(capability.persistence)} | ${list(capability.gaps)} | ${list(capability.blockers)} | ${list(capability.tests.map(test => `\`${test}\``))} |`);
  }
  lines.push("");
  lines.push("## 3. Что изменено в этой ветке");
  lines.push("");
  for (const capability of CAPABILITIES.filter(item => item.changed)) lines.push(`- \`${capability.id}\` (${capability.statusBefore} → ${capability.status}): ${capability.changed}`);
  lines.push("");
  lines.push("## 4. Риски и критерии приёмки");
  lines.push("");
  lines.push("| capability_id | Риски | Критерий приёмки | Код |");
  lines.push("| --- | --- | --- | --- |");
  for (const capability of CAPABILITIES) lines.push(`| \`${capability.id}\` | ${list(capability.risks)} | ${cell(capability.acceptance)} | ${list(capability.code.map(file => `\`${file}\``))} |`);
  lines.push("");
  lines.push("## 5. Конфликты документов и принятые решения");
  lines.push("");
  lines.push("| ID | Между чем | Что показал код | Решение |");
  lines.push("| --- | --- | --- | --- |");
  for (const conflict of DOCUMENT_CONFLICTS) lines.push(`| ${conflict.id} | ${cell(conflict.between)} | ${cell(conflict.observed)} | ${cell(conflict.decision)} |`);
  lines.push("");
  return lines.join("\n");
}
