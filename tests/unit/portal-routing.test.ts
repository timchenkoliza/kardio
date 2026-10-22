import { describe, expect, it } from "vitest";
import { conceptsIn, drugsIn, pubmedTermFor } from "@/lib/portal/lexicon";
import { routePortalIntent } from "@/lib/portal/router";
import { HOME_SHORTCUTS, jobForRun } from "@/lib/portal/jobs";

describe("portal router: jobs, not agents", () => {
  it("routes a drug question to the drug job, not to generic research", () => {
    for (const [text, specialty] of [["дапаглифлозин противопоказания", "endocrinology"], ["дозировка амоксициллина у детей", "pediatrics"], ["апиксабан", "cardiology"], ["левотироксин при беременности", "endocrinology"]] as const) {
      const route = routePortalIntent(text, specialty);
      expect(route.job, text).toBe("drug");
      expect(route.agentId).toBe("reference");
    }
  });

  it("routes events, guidelines, learning, updates and materials to their jobs", () => {
    expect(routePortalIntent("конференции по неврологии онлайн в ноябре", "neurology").job).toBe("events");
    expect(routePortalIntent("клинические рекомендации по бронхиальной астме у детей", "pediatrics").job).toBe("guidelines");
    expect(routePortalIntent("что изменилось в рекомендациях ESC по ХСН", "cardiology").job).toBe("guidelines");
    expect(routePortalIntent("курс по гестационному диабету с баллами НМО", "obgyn").job).toBe("learning");
    expect(routePortalIntent("что нового по мигрени", "neurology").job).toBe("updates");
    expect(routePortalIntent("в моих материалах про астму", "therapy").job).toBe("materials");
  });

  it("sends a comparison of drugs to the research job", () => {
    expect(routePortalIntent("сравни апиксабан и ривароксабан по кровотечениям", "cardiology").job).toBe("research");
  });

  it("answers a plain clinical question with the reference job", () => {
    const route = routePortalIntent("длительность антибиотикотерапии при остром среднем отите у детей", "pediatrics");
    expect(route.job).toBe("answer");
    expect(route.concepts.map(concept => concept.label)).toEqual(expect.arrayContaining(["Острый средний отит", "дети", "антибиотики"]));
  });

  it("falls back safely when nothing is recognised", () => {
    const route = routePortalIntent("привет", "therapy");
    expect(route.job).toBe("answer");
    expect(route.vague).toBe(true);
    expect(route.reasons[0]).toMatch(/не распознана/);
  });

  it("honours an explicit job without second-guessing it", () => {
    expect(routePortalIntent("астма", "therapy", { job: "guidelines" }).job).toBe("guidelines");
  });

  it("homepage shortcuts follow the opportunity map: drug, guidelines, research", () => {
    expect(HOME_SHORTCUTS).toEqual(["drug", "guidelines", "research"]);
  });

  it("maps pre-portal runs to a job", () => {
    expect(jobForRun({ agentId: "events", intent: "find_events" })).toBe("events");
    expect(jobForRun({ agentId: "reference", intent: "drug" })).toBe("drug");
  });
});

describe("lexicon: search aids for six specialties", () => {
  it("recognises Russian INNs in any inflection and Latin names", () => {
    expect(drugsIn("при приёме апиксабана").map(drug => drug.inn)).toEqual(["apixaban"]);
    expect(drugsIn("Metformin and CKD").map(drug => drug.inn)).toEqual(["metformin"]);
  });

  it("never lets a specialty-framed topic leak into another specialty's search", () => {
    const concepts = conceptsIn("профилактика мигрени у взрослых", "neurology");
    expect(concepts.some(concept => /cardiovascular/.test(concept.term))).toBe(false);
    expect(concepts.map(concept => concept.label)).toEqual(expect.arrayContaining(["Мигрень и головная боль", "профилактика"]));
  });

  it("builds an AND-ed PubMed term and refuses an empty one", () => {
    expect(pubmedTermFor(conceptsIn("остеопороз у пожилых", "endocrinology"))).toMatch(/osteoporosis\[tiab\]\) AND \(elderly/);
    expect(pubmedTermFor([])).toBeNull();
  });
});
