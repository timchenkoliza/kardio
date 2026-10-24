import { describe, expect, it } from "vitest";
import { routeIntent } from "@/lib/agents/intent";
import { topicsMentioned } from "@/lib/agents/vocabulary";
import { conceptsIn, latinTermsIn, pubmedTermFor } from "@/lib/portal/lexicon";
import { routePortalIntent } from "@/lib/portal/router";

/**
 * Regression set for the routing and term-recognition fixes described as N21-05.
 *
 * History: the set was first rebuilt from the work-log description while the
 * original fixes were not available (each case failed on main @ acf3caf). The
 * original fixes — fix/ux-recovery, rounds 21–25, reviewed by the product
 * reviewers — are now merged, and they are the source of truth for the
 * semantics. Where the rebuilt expectation differed from the reviewed one, the
 * reviewed behaviour is asserted (docs/CAPABILITY_COVERAGE_MATRIX.md, CF-02):
 *   - a clinical «события» question is a clinical answer (or the drug when one is
 *     named), not necessarily the research job — what matters is «not events»;
 *   - «ИМ» and «АКШ» are search concepts (concept:mi, concept:cabg); the ИБС topic
 *     comes only from words about the heart (round 25);
 *   - no separate gastric-bypass / VP-shunt concepts: what matters is that a
 *     non-coronary shunt is neither CABG nor ИБС.
 * Kept from the rebuild because the merged code lacked them: the agent router
 * shares the events-listing rule, «инфаркт мозга» is a stroke, «ver. 3.1» is a
 * version label.
 */

const ids = (text: string, specialty: Parameters<typeof conceptsIn>[1] = "cardiology") => conceptsIn(text, specialty).map(concept => concept.id);

describe("«события»: clinical end points are not congresses", () => {
  it.each([
    ["Частота сердечно-сосудистых событий при приёме эмпаглифлозина", "cardiology"],
    ["Снижение риска серьёзных сердечно-сосудистых событий на фоне иНГЛТ-2", "cardiology"],
    ["MACE после ЧКВ: какие события учитываются", "cardiology"],
    ["Риск повторных коронарных событий у пожилых после инфаркта", "cardiology"],
    ["События в группе плацебо в исследовании EMPEROR-Preserved", "cardiology"],
    ["Частота тромбоэмболических событий при фибрилляции предсердий", "therapy"],
  ] as const)("«%s» is a clinical question in both routers, not events", (text, specialty) => {
    expect(routePortalIntent(text, specialty).job).not.toBe("events");
    expect(routeIntent(text, specialty).agentId).not.toBe("events");
  });

  it("adverse events of a named drug stay with the drug", () => {
    expect(routePortalIntent("Нежелательные события на фоне семаглутида", "endocrinology").job).toBe("drug");
  });

  it.each([
    ["Какие события по кардиологии в ноябре?", "cardiology"],
    ["Ближайшие события для эндокринологов онлайн", "endocrinology"],
    ["События с баллами НМО в Москве", "therapy"],
    ["конференции по неврологии онлайн в ноябре", "neurology"],
    ["Зарегистрируй меня на все события РКО и поставь в календарь", "cardiology"],
  ] as const)("«%s» is still a request for professional events", (text, specialty) => {
    expect(routePortalIntent(text, specialty).job).toBe("events");
    expect(routeIntent(text, specialty).agentId).toBe("events");
  });

  it("the route reason never names the bare stem «событи» for a clinical question", () => {
    const route = routePortalIntent("Частота сердечно-сосудистых событий при приёме эмпаглифлозина", "cardiology");
    expect(route.reasons.join(" ")).not.toMatch(/событи(?![\p{L}])/u);
  });
});

describe("ИБС is not inferred from «ишемия» or «инфаркт» without coronary context", () => {
  it.each([
    "Ишемический инсульт: тромболизис",
    "Инфаркт мозга: вторичная профилактика",
    "Транзиторная ишемическая атака у пожилых",
    "Хроническая ишемия нижних конечностей",
    "Ишемический колит после операции",
    "Инфаркт почки: диагностика",
  ])("«%s» does not match ИБС", text => {
    for (const specialty of ["cardiology", "neurology", "therapy"] as const) {
      expect(topicsMentioned("cardiology", text)).not.toContain("ihd");
      expect(ids(text, specialty)).not.toContain("cardiology:ihd");
    }
  });

  it("cerebral infarction is recognised as stroke instead", () => {
    expect(ids("Инфаркт мозга: вторичная профилактика", "neurology")).toContain("neurology:stroke");
    expect(ids("Ишемический инсульт: тромболизис", "neurology")).toContain("neurology:stroke");
  });

  it.each([
    "Ишемия миокарда при анемии",
    "Инфаркт миокарда 2 типа",
    "Стабильная ИБС и ишемический инсульт в анамнезе",
    "ОКС без подъёма ST",
  ])("«%s» still matches ИБС", text => {
    expect(topicsMentioned("cardiology", text)).toContain("ihd");
  });
});

describe("ИМ, АКШ and shunting", () => {
  it("«ИМ» in upper case is myocardial infarction; the pronoun «им» and «ИМТ» are not", () => {
    expect(ids("Двойная антитромбоцитарная терапия после ИМ")).toContain("concept:mi");
    expect(ids("Как им объяснить диету")).not.toContain("concept:mi");
    expect(ids("ИМТ больше 30 и давление")).not.toContain("concept:mi");
    expect(topicsMentioned("cardiology", "Как им объяснить диету")).not.toContain("ihd");
    expect(topicsMentioned("cardiology", "ИМТ больше 30 и давление")).not.toContain("ihd");
  });

  it("АКШ and coronary bypass are searched as CABG", () => {
    for (const text of ["Ведение пациентов после АКШ", "Аортокоронарное шунтирование или ЧКВ при многососудистом поражении", "МКШ: отдалённые результаты"]) {
      expect(ids(text)).toContain("concept:cabg");
    }
    expect(pubmedTermFor(conceptsIn("Ведение пациентов после АКШ", "cardiology"))).toContain("coronary artery bypass");
  });

  it("non-coronary shunting is neither CABG nor ИБС", () => {
    for (const [text, specialty] of [["Шунтирование желудка и сахарный диабет", "endocrinology"], ["Вентрикулоперитонеальное шунтирование у детей", "pediatrics"], ["Портокавальное шунтирование при циррозе", "therapy"]] as const) {
      expect(topicsMentioned("cardiology", text)).not.toContain("ihd");
      expect(ids(text, specialty)).not.toContain("concept:cabg");
    }
  });
});

describe("hypoglycaemia, insulin and version labels", () => {
  it("recognises гипогликемия and insulin therapy as search concepts", () => {
    const found = ids("Гипогликемия на инсулинотерапии у пожилых", "endocrinology");
    expect(found).toEqual(expect.arrayContaining(["concept:hypoglycemia", "concept:insulin"]));
    expect(routePortalIntent("Гипогликемия на инсулинотерапии у пожилых", "endocrinology").vague).toBe(false);
  });

  it("insulin resistance is not insulin therapy", () => {
    expect(ids("Инсулинорезистентность при СПКЯ", "endocrinology")).not.toContain("concept:insulin");
  });

  it("«v2.0», «ver. 3.1» are document versions, never search terms", () => {
    expect(latinTermsIn("Что изменилось в рекомендациях ESC v2.0")).toEqual(["esc"]);
    expect(latinTermsIn("Обновление ver. 3.1 шкалы")).toEqual([]);
    expect(latinTermsIn("Living Guideline version 2")).toEqual(["living", "guideline"]);
    const route = routePortalIntent("Что изменилось в рекомендациях по ХСН v2.0", "cardiology");
    expect(route.job).toBe("guidelines");
    expect(route.drugs).toEqual([]);
  });
});
