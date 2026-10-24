import { describe, expect, it } from "vitest";
import { clinicalEventKind, eventsWordMeansProfessionalEvents, mentionsCoronaryBypass, mentionsMiAbbreviation, stripVersionLabels } from "@/lib/agents/clinical-terms";
import { routeIntent } from "@/lib/agents/intent";
import { normalizeText } from "@/lib/agents/text";
import { topicsMentioned } from "@/lib/agents/vocabulary";
import { conceptsIn, latinTermsIn, pubmedTermFor } from "@/lib/portal/lexicon";
import { routePortalIntent } from "@/lib/portal/router";

/**
 * Regression set for the routing and term-recognition fixes described as N21-05
 * in the handed-over work log. The original local changes are not in any pushed
 * branch, so these cases were rebuilt from the description and checked against
 * main @ acf3caf, where each of them failed (docs/CAPABILITY_COVERAGE_MATRIX.md, «Конфликты»).
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
  ] as const)("«%s» is an evidence question, not events", (text, specialty) => {
    const route = routePortalIntent(text, specialty);
    expect(route.job).not.toBe("events");
    expect(route.job).toBe("research");
    expect(routeIntent(text, specialty).agentId).not.toBe("events");
  });

  it("adverse events of a drug stay with the drug label, not with events", () => {
    const route = routePortalIntent("Нежелательные события на фоне семаглутида", "endocrinology");
    expect(route.job).toBe("drug");
    expect(clinicalEventKind(normalizeText("Нежелательные события на фоне семаглутида"))).toBe("adverse");
  });

  it.each([
    ["Какие события по кардиологии в ноябре?", "cardiology"],
    ["Ближайшие события для эндокринологов онлайн", "endocrinology"],
    ["События с баллами НМО в Москве", "therapy"],
    ["Конференции про сердечно-сосудистые события у пожилых", "cardiology"],
    ["конференции по неврологии онлайн в ноябре", "neurology"],
    ["Зарегистрируй меня на все события РКО и поставь в календарь", "cardiology"],
  ] as const)("«%s» is still a request for professional events", (text, specialty) => {
    expect(routePortalIntent(text, specialty).job).toBe("events");
    expect(eventsWordMeansProfessionalEvents(normalizeText(text), text)).toBe(true);
  });

  it("names the clinical sense of the word in the route reason, not «событи»", () => {
    const route = routePortalIntent("Частота сердечно-сосудистых событий при приёме эмпаглифлозина", "cardiology");
    expect(route.reasons.join(" ")).toContain("клинические исходы");
    expect(route.reasons.join(" ")).not.toContain("событи");
  });

  it("searches cardiovascular events as an end point", () => {
    expect(ids("Частота сердечно-сосудистых событий при приёме эмпаглифлозина")).toContain("concept:cv_events");
    expect(ids("MACE после ЧКВ")).toContain("concept:cv_events");
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
    expect(ids("Инфаркт мозга: вторичная профилактика", "neurology")).toEqual(expect.arrayContaining(["neurology:stroke"]));
    expect(ids("Ишемический инсульт: тромболизис", "neurology")).toEqual(expect.arrayContaining(["neurology:stroke"]));
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
    expect(mentionsMiAbbreviation("Двойная антитромбоцитарная терапия после ИМ")).toBe(true);
    expect(mentionsMiAbbreviation("ИМпST: реперфузия")).toBe(true);
    expect(mentionsMiAbbreviation("ИМбпST — стратификация риска")).toBe(true);
    expect(mentionsMiAbbreviation("Как им объяснить диету")).toBe(false);
    expect(mentionsMiAbbreviation("Им нужно снизить вес")).toBe(false);
    expect(mentionsMiAbbreviation("ИМТ больше 30")).toBe(false);
    expect(topicsMentioned("cardiology", "Двойная антитромбоцитарная терапия после ИМ")).toContain("ihd");
    expect(topicsMentioned("cardiology", "Как им объяснить диету")).not.toContain("ihd");
    expect(topicsMentioned("cardiology", "ИМТ больше 30 и давление")).not.toContain("ihd");
  });

  it("АКШ and coronary bypass are coronary disease and are searched as CABG", () => {
    for (const text of ["Ведение пациентов после АКШ", "Аортокоронарное шунтирование или ЧКВ при многососудистом поражении", "МКШ: отдалённые результаты"]) {
      expect(mentionsCoronaryBypass(normalizeText(text))).toBe(true);
      expect(topicsMentioned("cardiology", text)).toContain("ihd");
      expect(ids(text)).toContain("concept:cabg");
    }
    expect(pubmedTermFor(conceptsIn("Ведение пациентов после АКШ", "cardiology"))).toContain("coronary artery bypass");
  });

  it("non-coronary shunting is neither CABG nor ИБС", () => {
    for (const [text, concept] of [["Шунтирование желудка и сахарный диабет", "concept:gastric_bypass"], ["Вентрикулоперитонеальное шунтирование у детей", "concept:vp_shunt"]] as const) {
      expect(mentionsCoronaryBypass(normalizeText(text))).toBe(false);
      expect(topicsMentioned("cardiology", text)).not.toContain("ihd");
      expect(ids(text, "pediatrics")).not.toContain("concept:cabg");
      expect(ids(text, "pediatrics")).toContain(concept);
    }
    expect(mentionsCoronaryBypass(normalizeText("Портокавальное шунтирование при циррозе"))).toBe(false);
  });
});

describe("hypoglycaemia, insulin therapy and version labels", () => {
  it("recognises гипогликемия and инсулинотерапия as search concepts", () => {
    const found = ids("Гипогликемия на инсулинотерапии у пожилых", "endocrinology");
    expect(found).toEqual(expect.arrayContaining(["concept:hypoglycemia", "concept:insulin_therapy"]));
    expect(routePortalIntent("Гипогликемия на инсулинотерапии у пожилых", "endocrinology").vague).toBe(false);
  });

  it("insulin resistance is not insulin therapy", () => {
    const found = ids("Инсулинорезистентность при СПКЯ", "endocrinology");
    expect(found).toContain("concept:insulin_resistance");
    expect(found).not.toContain("concept:insulin_therapy");
  });

  it("«v2.0» is a document version, never a search term", () => {
    expect(stripVersionLabels("Living Guideline v2.0")).not.toMatch(/v2/u);
    expect(latinTermsIn("Что изменилось в рекомендациях ESC v2.0")).toEqual(["esc"]);
    expect(latinTermsIn("Обновление ver. 3.1 шкалы")).toEqual([]);
    const route = routePortalIntent("Что изменилось в рекомендациях по ХСН v2.0", "cardiology");
    expect(route.job).toBe("guidelines");
    expect(route.drugs).toEqual([]);
  });
});
