import { describe, expect, it } from "vitest";
import {
  CARDIOLOGY_AGENT_FAMILIES,
  CARDIOLOGY_AGENT_TEMPLATES,
  PHARMA_KP_FORMATS,
  PHARMA_KP_PACKAGE,
} from "@/lib/agents/templates";

describe("cardiology professional agent templates", () => {
  it("covers the 2027 harness catalog without duplicate ids or kinds", () => {
    expect(CARDIOLOGY_AGENT_TEMPLATES).toHaveLength(42);
    expect(new Set(CARDIOLOGY_AGENT_TEMPLATES.map(template => template.id)).size).toBe(42);
    expect(new Set(CARDIOLOGY_AGENT_TEMPLATES.map(template => template.kind)).size).toBe(42);
    expect(new Set(CARDIOLOGY_AGENT_TEMPLATES.map(template => template.family))).toEqual(new Set(CARDIOLOGY_AGENT_FAMILIES));
  });

  it("keeps pharma strictly limited to the five commercial-proposal formats", () => {
    const commercial = CARDIOLOGY_AGENT_TEMPLATES.filter(template => template.commercial);
    const independent = CARDIOLOGY_AGENT_TEMPLATES.filter(template => !template.commercial);
    const commercialFormats = commercial.map(template => template.commercialFormat);

    expect(commercial).toHaveLength(5);
    expect(new Set(commercialFormats)).toEqual(new Set(["article", "useful", "media", "event", "performance"]));
    expect(commercial.every(template => template.family === "partner")).toBe(true);
    expect(commercial.every(template => template.sponsorName)).toBe(true);
    expect(independent.every(template => template.sponsorName === null && template.commercialFormat === null)).toBe(true);
    expect(CARDIOLOGY_AGENT_TEMPLATES.some(template => template.kind === "partner_channel")).toBe(false);
  });

  it("matches the package volumes from the commercial proposal exactly", () => {
    expect(PHARMA_KP_FORMATS).toEqual([
      { id: "article", label: "Статья", packageVolume: "1 месяц", role: "content" },
      { id: "useful", label: "Полезное", packageVolume: "1 месяц", role: "content" },
      { id: "media", label: "Медиа", packageVolume: "1 месяц", role: "content" },
      { id: "event", label: "Событие", packageVolume: "1 месяц", role: "content" },
      { id: "performance", label: "Performance-продвижение", packageVolume: "50 000 кликов", role: "distribution" },
    ]);
    expect(PHARMA_KP_PACKAGE.priceRub).toBe(5_000_000);
    expect(PHARMA_KP_PACKAGE.formats).toEqual(["article", "useful", "media", "event", "performance"]);
  });

  it("never promises that background monitoring already runs", () => {
    const forbidden = ["уже отслеживаем", "мониторинг запущен", "работает в фоне", "гарантированно уведомим"];
    for (const template of CARDIOLOGY_AGENT_TEMPLATES) {
      const visibleCopy = `${template.title} ${template.description} ${template.instruction}`.toLocaleLowerCase("ru-RU");
      for (const phrase of forbidden) expect(visibleCopy).not.toContain(phrase);
    }
  });

  it("requires source-grounded wording for guideline and research jobs", () => {
    const guideline = CARDIOLOGY_AGENT_TEMPLATES.find(template => template.kind === "guideline_delta");
    const research = CARDIOLOGY_AGENT_TEMPLATES.find(template => template.kind === "research_watch");

    expect(guideline?.instruction).toMatch(/первоисточник/iu);
    expect(research?.instruction).toMatch(/RCT|метаанализ/iu);
  });

  it("gates diagnostic-signal agents behind validated connectors", () => {
    const regulatedKinds = new Set(["ecg_review", "echo_review", "cardiac_imaging_review"]);
    const regulated = CARDIOLOGY_AGENT_TEMPLATES.filter(template => regulatedKinds.has(template.kind));

    expect(regulated).toHaveLength(3);
    expect(regulated.every(template => template.availability === "regulated_connector")).toBe(true);
    expect(regulated.every(template => /валидирован|разреш[её]нн|не анализируй|не выполняй/iu.test(template.instruction))).toBe(true);
  });
});
