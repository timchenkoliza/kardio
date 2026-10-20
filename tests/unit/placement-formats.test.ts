import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PHARMA_AGENT_DEFINITIONS } from "@/lib/pharma/agents";
import { PLACEMENT_FORMATS } from "@/lib/pharma/placement-formats";

describe("placement formats from the commercial offer", () => {
  it("covers all five formats in offer order", () => {
    expect(PLACEMENT_FORMATS.map(format => format.name)).toEqual(["Статья", "Полезное", "Медиа", "Событие", "Бренд-страница компании"]);
    expect(PHARMA_AGENT_DEFINITIONS.content_studio.outputs).toEqual(["article", "useful", "media", "event", "brand_page"]);
  });

  it("keeps every sub-format named in the offer", () => {
    const kinds = PLACEMENT_FORMATS.flatMap(format => format.kinds).join(" | ");
    for (const kind of ["Экспертный материал", "Интервью", "Разбор кейса", "Разбор исследования", "Чек-лист", "Инфографика", "Подборка", "Карточки", "Шпаргалка", "Видео", "Подкаст", "UGC", "Курс", "Конференция", "Вебинар"]) {
      expect(kinds).toContain(kind);
    }
  });

  it("shows key points first in the article, reminders and in-service registration for events", () => {
    const article = PLACEMENT_FORMATS.find(format => format.id === "article")?.example;
    const event = PLACEMENT_FORMATS.find(format => format.id === "event")?.example;
    expect(article?.type === "article" && article.keyPoints.length).toBeGreaterThan(0);
    expect(event?.type === "event" && event.reminders.length).toBeGreaterThan(0);
    expect(event?.type === "event" && event.registration).toBe("Зарегистрироваться");
  });

  it("uses only local licensed illustrations", () => {
    for (const format of PLACEMENT_FORMATS) {
      const example = format.example;
      const images = example.type === "article" ? [example.image] : example.type === "media" ? example.items.map(item => item.image).filter((value): value is string => Boolean(value)) : [];
      for (const image of images) expect(existsSync(path.join("public", image))).toBe(true);
    }
  });
});
