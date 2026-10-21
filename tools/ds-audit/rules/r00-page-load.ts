import type { Rule } from "../types";

/** A page that does not load cannot be audited; a new load failure blocks like any other regression. */
export const r00: Rule = {
  id: "R-00",
  title: "Страница загружается",
  identityVersion: 1,
  priority: "P0",
  blocking: true,
  rule: "Аудит: страница должна открываться",
  fix: "Проверить сборку и логи деплоя; страница должна отвечать 200 и отрисовываться",
  check: "Повторный прогон аудита открывает страницу без ошибки",
  run: ({ snapshots }) => snapshots.filter(s => s.error).map(s => ({
    id: "R-00", route: s.route, viewport: s.viewport, locator: "document", evidenceKey: "load-error",
    fact: `Страница не загрузилась: ${s.error}`, where: s.url,
  })),
};
