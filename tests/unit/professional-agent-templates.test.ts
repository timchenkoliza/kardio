import { describe, expect, it } from "vitest";
import { CARDIOLOGY_AGENT_TEMPLATES } from "@/lib/agents/templates";

describe("cardiology professional agent templates", () => {
  it("covers the seven v1 physician jobs without duplicate ids", () => {
    expect(CARDIOLOGY_AGENT_TEMPLATES).toHaveLength(7);
    expect(new Set(CARDIOLOGY_AGENT_TEMPLATES.map(template => template.id)).size).toBe(7);
    expect(new Set(CARDIOLOGY_AGENT_TEMPLATES.map(template => template.kind))).toEqual(new Set([
      "guideline_delta",
      "research_watch",
      "practice_brief",
      "learning",
      "events",
      "source_watch",
      "partner_channel",
    ]));
  });

  it("keeps sponsored channels explicitly separated from independent intelligence", () => {
    const commercial = CARDIOLOGY_AGENT_TEMPLATES.filter(template => template.commercial);
    const independent = CARDIOLOGY_AGENT_TEMPLATES.filter(template => !template.commercial);

    expect(commercial).toHaveLength(1);
    expect(commercial[0]?.kind).toBe("partner_channel");
    expect(commercial[0]?.sponsorName).toBeTruthy();
    expect(independent.every(template => template.sponsorName === null)).toBe(true);
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
});
