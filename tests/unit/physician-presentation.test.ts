import { describe, expect, it } from "vitest";
import { certaintyOf, composeTitle, containsInternalJargon, documentKind, drugSectionGroup, editorialVerification, glossaryParts, hasEnglishProse, isRussian, issuersOf, localizeItem, physicianSafe, publicationFacts, trustLabel } from "@/lib/presentation/physician";

/**
 * The physician presentation layer: Russian first, deterministic, no
 * medical meaning added, no internal vocabulary on the surface.
 */

const REAL_TITLES: Array<[string, string, RegExp]> = [
  ["2026 Guideline for Adult Stroke Rehabilitation and Recovery: A Guideline From the American Heart Association and American Stroke Association.", "Клинические рекомендации", /^Клинические рекомендации 2026: инсульт — реабилитация и восстановление у взрослых$/u],
  ["Executive summary of the Japanese clinical practice guidelines for tuberous sclerosis complex-associated epilepsy 2025.", "Клинические рекомендации", /^Краткая версия рекомендаций 2025: эпилепсия при туберозном склерозе$/u],
  ["Pharmacologic Treatment for Migraine Prevention in Adults Practice Guideline Recommendations: Report of the AAN Guidelines Subcommittee and the American Headache Society.", "Клинические рекомендации", /^Клинические рекомендации: мигрень — медикаментозная профилактика у взрослых$/u],
  ["Efficacy and safety of tirzepatide in adolescents with type 2 diabetes", "Рандомизированное исследование", /^Рандомизированное исследование: тирзепатид, сахарный диабет 2 типа — эффективность и безопасность у подростков$/u],
];

describe("Russian titles from English sources", () => {
  it.each(REAL_TITLES)("%s", (title, type, expected) => {
    const localized = localizeItem({ title, typeLabel: type });
    expect(localized.title).toMatch(expected);
    expect(localized.basis).toBe("glossary");
    expect(isRussian(localized.title)).toBe(true);
    expect(hasEnglishProse(localized.title)).toBe(false);
    // The source wording is kept, only behind «Оригинал».
    expect(localized.original?.title).toBe(title);
  });

  it("a Russian prefix on an English title names the kind", () => {
    const localized = localizeItem({ title: "Прочитать систематический обзор: Cardiorespiratory training for people with stroke.", typeLabel: "Следующий шаг в обучении" });
    expect(localized.title).toBe("Прочитать систематический обзор: аэробные тренировки, инсульт");
  });

  it("an unknown English title never claims a topic it was not found for", () => {
    const localized = localizeItem({ title: "Something entirely unknown about widgets", typeLabel: "Публикация" });
    expect(localized.title).toBe("Публикация: название на языке оригинала");
    expect(localized.basis).toBe("template");
  });

  it("Russian source copy passes through unchanged", () => {
    const localized = localizeItem({ title: "Аортальная недостаточность", summary: "Официальный материал РКО, 2025.", typeLabel: "Рекомендации" });
    expect(localized).toMatchObject({ title: "Аортальная недостаточность", summary: "Официальный материал РКО, 2025.", original: null, basis: "source" });
  });

  it("titles are composed from parts that are all in the source", () => {
    expect(glossaryParts("Pharmacologic Treatment for Migraine Prevention in Adults")).toEqual({ subjects: ["мигрень"], aspects: ["медикаментозная профилактика"], population: "у взрослых" });
    expect(documentKind("Executive summary of the guidelines", "Клинические рекомендации")).toBe("Краткая версия рекомендаций");
    expect(documentKind("A randomized trial of X", "Публикация")).toBe("Рандомизированное исследование");
    expect(composeTitle("Widgets and gadgets", "Публикация")).toBeNull();
  });
});

describe("publication facts", () => {
  it("names issuers in Russian and never uses another specialty's society acronyms", () => {
    const facts = publicationFacts({ title: REAL_TITLES[0][0], journal: "Stroke" });
    expect(facts).toBe("Документ: Американская ассоциация сердца, Американская ассоциация инсульта. Опубликовано в журнале Stroke.");
    expect(facts).not.toMatch(/\bAHA\b|\bESC\b/u);
    expect(issuersOf(REAL_TITLES[1][0])).toEqual({ issuers: [], jurisdiction: "Япония" });
  });

  it("reports certainty only in the authors' own words", () => {
    expect(certaintyOf("We found low-certainty evidence that …")).toBe("low");
    expect(certaintyOf("High-certainty evidence shows")).toBe("high");
    expect(certaintyOf("We found no studies")).toBeNull();
    expect(publicationFacts({ title: "Something", abstract: "moderate-certainty evidence" })).toBe("Уверенность доказательств по оценке авторов: умеренная.");
  });
});

describe("editorial labels instead of internal states", () => {
  it("maps capability states to trust words", () => {
    expect(trustLabel("LIVE")).toEqual({ label: "Надёжный источник", tone: "trusted" });
    expect(trustLabel("SNAPSHOT")).toEqual({ label: "Проверено редакцией", tone: "curated" });
    expect(trustLabel("SNAPSHOT", { showcase: true })).toEqual({ label: "Подборка редакции", tone: "curated" });
    expect(trustLabel("MOCK")).toEqual({ label: "Пример формата", tone: "example" });
    expect(trustLabel("UNVERIFIED").label).toBe("Требует сверки");
    expect(editorialVerification("SUPPORTED").label).toBe("Подтверждено источником");
    expect(editorialVerification("PARTIALLY_SUPPORTED").label).toBe("Требует сверки");
  });

  it("filters internal jargon before it reaches the physician", () => {
    for (const text of ["Не в белом списке врачей", "verificationNote: x", "LIVE", "MOCK source", "UNVERIFIED", "run-1a2b3c4d", "skill fired", "flow step", "policy_gate", "каталог статей, не знак качества"]) {
      expect(containsInternalJargon(text)).toBe(true);
      expect(physicianSafe(text)).toBeNull();
    }
    expect(physicianSafe("Клинические рекомендации, опубликованные за последние два года")).toBe("Клинические рекомендации, опубликованные за последние два года");
  });
});

describe("drug label sections", () => {
  it("groups label sections the way a physician looks for them", () => {
    expect(drugSectionGroup("Противопоказания")).toBe("contraindications");
    expect(drugSectionGroup("Показания")).toBe("indications");
    expect(drugSectionGroup("Дозирование и способ применения")).toBe("dosing");
    expect(drugSectionGroup("Беременность")).toBe("populations");
    expect(drugSectionGroup("Предупреждения и меры предосторожности")).toBe("safety");
    expect(drugSectionGroup("Лекарственные взаимодействия")).toBe("interactions");
    expect(drugSectionGroup(null)).toBe("other");
  });
});
