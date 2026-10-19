import { describe, expect, it } from "vitest";
import { parseEventPageSignals } from "@/server/ingestion/event-page-inspection";

const SOURCE = "https://scardio.ru/events/example/";

describe("event page inspection", () => {
  it("extracts only source-grounded page metadata and structured Event data", () => {
    const html = `
      <html><head>
        <title>Конференция &amp; школа</title>
        <link rel="canonical" href="https://scardio.ru/events/example/">
        <meta property="og:title" content="Кардиологическая конференция">
        <meta property="og:description" content="Описание мероприятия">
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"Event","name":"Кардиологическая конференция","startDate":"2026-10-20T10:00:00+03:00","endDate":"2026-10-20T18:00:00+03:00","url":"https://scardio.ru/events/example/","location":{"@type":"Place","name":"Москва"}}
        </script>
      </head><body></body></html>`;

    const result = parseEventPageSignals(html, SOURCE);
    expect(result.htmlTitle).toBe("Конференция & школа");
    expect(result.canonicalHref).toBe(SOURCE);
    expect(result.ogTitle).toBe("Кардиологическая конференция");
    expect(result.ogDescription).toBe("Описание мероприятия");
    expect(result.jsonLdTypes).toContain("Event");
    expect(result.structuredEvents).toEqual([{
      types: ["Event"],
      name: "Кардиологическая конференция",
      startDate: "2026-10-20T10:00:00+03:00",
      endDate: "2026-10-20T18:00:00+03:00",
      url: SOURCE,
      locationName: "Москва",
    }]);
  });

  it("does not infer an event from prose alone", () => {
    const html = `<html><head><title>Вебинар для врачей</title></head><body>Состоится конференция.</body></html>`;
    const result = parseEventPageSignals(html, SOURCE);
    expect(result.htmlTitle).toBe("Вебинар для врачей");
    expect(result.structuredEvents).toEqual([]);
    expect(result.jsonLdTypes).toEqual([]);
  });

  it("ignores malformed JSON-LD rather than repairing it", () => {
    const html = `<script type="application/ld+json">{"@type":"Event",</script>`;
    const result = parseEventPageSignals(html, SOURCE);
    expect(result.structuredEvents).toEqual([]);
    expect(result.jsonLdTypes).toEqual([]);
  });
});
