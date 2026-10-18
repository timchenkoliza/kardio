import { describe, expect, it } from "vitest";
import { deriveDistributionSignals } from "@/server/ingestion/distribution-signals";

describe("distribution signal derivation", () => {
  it("maps only explicit channel taxonomy hashtags to formats", () => {
    const signals = deriveDistributionSignals({
      hashtags: ["#РКО_ЛЕКЦИЯ", "#рко_новости", "#другой_тег"],
      bodyText: "Вебинар упомянут в тексте, но без explicit format hashtag.",
      externalLinks: [],
    });

    expect(signals.explicitFormats).toEqual(["lecture", "news"]);
    expect(signals.matchedFormatHashtags).toEqual(["#рко_лекция", "#рко_новости"]);
  });

  it("does not infer a format from body text alone", () => {
    const signals = deriveDistributionSignals({
      hashtags: [],
      bodyText: "Сегодня состоится вебинар и лекция.",
      externalLinks: [],
    });

    expect(signals.explicitFormats).toEqual([]);
    expect(signals.matchedFormatHashtags).toEqual([]);
  });

  it("extracts normalized external domains and explicit scardio event-page references", () => {
    const eventUrl = "https://www.scardio.ru/events/forum_2026/";
    const signals = deriveDistributionSignals({
      hashtags: ["#рко_мероприятия"],
      bodyText: "",
      externalLinks: [eventUrl, "https://youtu.be/example", eventUrl, "not-a-url"],
    });

    expect(signals.externalDomains).toEqual(["scardio.ru", "youtu.be"]);
    expect(signals.scardioEventPageLinks).toEqual([eventUrl]);
  });
});
