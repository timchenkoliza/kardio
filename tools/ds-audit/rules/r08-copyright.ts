import type { RawFinding, Rule } from "../types";

export const r08: Rule = {
  id: "R-08",
  title: "Уведомление об авторских правах",
  identityVersion: 1,
  priority: "P1",
  blocking: true,
  rule: "Copyright: в футере каждой страницы `© <год> ООО «Яндекс»`",
  fix: "Добавить в оболочку футер `© <год> ООО «Яндекс»` с неразрывным пробелом после ©; правообладателя подтвердить у юристов",
  check: "На каждой странице и в обоих вьюпортах есть «© <год> ООО «Яндекс»»",
  run: ({ snapshots, year }) => {
    const out: RawFinding[] = [];
    for (const s of snapshots) {
      if (s.error) continue;
      const match = s.bodyText.match(/©\s?(\d{4})(?:\s?[–-]\s?(\d{4}))?\s?ООО\s?«Яндекс»/u);
      const current = match && Number(match[2] ?? match[1]) === year;
      if (current) continue;
      out.push({ id: "R-08", route: s.route, viewport: s.viewport, locator: "document", evidenceKey: "copyright", fact: match ? `Год в копирайте ${match[0]} не текущий (${year})` : "На странице нет «© <год> ООО «Яндекс»»", where: "footer" });
    }
    return out;
  },
};
