import { describe, expect, it } from "vitest";
import { routeIntent } from "@/lib/agents/intent";
import { containsDirectiveLanguage, detectRiskSignals } from "@/lib/agents/risk-rules";
import { topicsMentioned } from "@/lib/agents/vocabulary";
import { checkInputRisk, checkUploadRisk } from "@/server/agents/services/risk";

describe("supervisor intent routing", () => {
  it("routes delegated jobs to the agent that owns the goal", () => {
    expect(routeIntent("Зарегистрируй меня на все события РКО и поставь в календарь", "cardiology").agentId).toBe("events");
    expect(routeIntent("Что изменилось по препаратам при АГ?", "cardiology").agentId).toBe("drugs");
    expect(routeIntent("Что нового в рекомендациях ESC по ХСН", "cardiology").agentId).toBe("guidelines");
    expect(routeIntent("Собери план обучения и баллы НМО по ФП", "cardiology").agentId).toBe("learning");
    expect(routeIntent("Найди в моих материалах про SCORE2", "cardiology").agentId).toBe("materials");
    expect(routeIntent("Какие данные о ПОАК при промежуточном риске инсульта", "cardiology").agentId).toBe("research");
  });

  it("falls back to research and respects an explicit agent choice", () => {
    expect(routeIntent("тромбоэмболия лёгочной артерии у пожилых", "cardiology").agentId).toBe("research");
    const preferred = routeIntent("что угодно", "cardiology", { preferred: "events" });
    expect(preferred.agentId).toBe("events");
    expect(preferred.confidence).toBe(1);
  });

  it("detects calendar and registration wishes without executing them", () => {
    const routed = routeIntent("Найди конференции по ХСН и добавь в календарь, зарегистрируй меня", "cardiology");
    expect(routed.wantsCalendar).toBe(true);
    expect(routed.wantsRegistration).toBe(true);
    expect(routed.topics).toContain("hf");
  });

  it("uses Unicode-aware boundaries for short Cyrillic topic abbreviations", () => {
    expect(topicsMentioned("cardiology", "ведение ФП и АГ")).toEqual(["ah", "af"]);
    expect(topicsMentioned("cardiology", "фагоцитоз")).toEqual([]);
    expect(topicsMentioned("oncology", "ведение ФП")).toEqual([]);
  });
});

describe("risk gate", () => {
  it("blocks medical image interpretation and emergencies", () => {
    expect(detectRiskSignals("Расшифруй ЭКГ пациента").imageInterpretation).toBe(true);
    expect(checkInputRisk("Опиши снимок КТ сердца").allowed).toBe(false);
    expect(checkInputRisk("Срочно: боль в груди, что делать сейчас?").allowed).toBe(false);
  });

  it("reframes prescribing requests and redacts identifiers before tools see them", () => {
    const decision = checkInputRisk("Какую дозу апиксабана назначить пациенту? Телефон +7 999 123-45-67");
    expect(decision.allowed).toBe(true);
    expect(decision.signals.prescribing).toBe(true);
    expect(decision.sanitizedText).toContain("[PHONE]");
    expect(decision.sanitizedText).not.toContain("123-45-67");
    expect(decision.notices.length).toBeGreaterThan(0);
  });

  it("flags directive output wording", () => {
    expect(containsDirectiveLanguage("Назначьте препарат в дозе 5 мг")).toBe(true);
    expect(containsDirectiveLanguage("Рекомендации ESC 2026 вводят класс IIa")).toBe(false);
  });

  it("rejects DICOM uploads and stores images without analysis", () => {
    expect(checkUploadRisk("study.dcm", "application/dicom").allowed).toBe(false);
    expect(checkUploadRisk("slide.png", "image/png").imageNotice).toMatch(/без анализа/);
  });
});
