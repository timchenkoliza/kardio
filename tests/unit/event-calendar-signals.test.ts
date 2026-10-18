import { describe, expect, it } from "vitest";
import { extractEventCalendarSignals, isExplicitDateSignal } from "@/server/ingestion/event-calendar-signals";

describe("event calendar signals", () => {
  it("extracts literal Russian calendar expressions without assigning semantics", () => {
    const signals = extractEventCalendarSignals(
      "Форум состоится 19 - 20 апреля 2024 года. Начало в 18:00 (мск).",
    );

    expect(signals.map((signal) => [signal.kind, signal.normalizedKey])).toContainEqual([
      "date_range",
      "range:2024-04-19-20",
    ]);
    expect(signals.map((signal) => [signal.kind, signal.normalizedKey])).toContainEqual([
      "time",
      "time:18:00",
    ]);
    expect(signals.filter(isExplicitDateSignal)).toHaveLength(1);
  });

  it("keeps relative-day words unresolved", () => {
    const signals = extractEventCalendarSignals("Ждём вас завтра в 09:45.");
    expect(signals.map((signal) => signal.normalizedKey)).toEqual([
      "relative:завтра",
      "time:09:45",
    ]);
  });

  it("supports numeric dates and standalone years", () => {
    const signals = extractEventCalendarSignals("Регистрация до 13.09.2023. Следующий цикл — 2024 год.");
    expect(signals.map((signal) => signal.normalizedKey)).toContain("date:2023-09-13");
    expect(signals.map((signal) => signal.normalizedKey)).toContain("year:2024");
  });
});
