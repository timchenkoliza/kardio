import { describe, expect, it } from "vitest";
import { CAPABILITIES, capabilityForJob, hostForFamily } from "@/lib/mesh/capabilities";
import { detectDomain, scenarioFor } from "@/lib/mesh/domain-graph";
import { compileIntent } from "@/lib/mesh/intent";
import { JOB_DEFINITIONS, JOB_TYPES } from "@/lib/mesh/jobs";
import { JOBS } from "@/lib/portal/jobs";

const ACCEPTANCE = "Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?";

describe("four separate concepts", () => {
  it("a job never names an agent; every job type is served by exactly one capability", () => {
    for (const job of Object.values(JOBS)) expect(job).not.toHaveProperty("agentId");
    for (const job of JOB_TYPES) {
      const serving = Object.values(CAPABILITIES).filter(capability => capability.jobs.includes(job));
      expect(serving, job).toHaveLength(1);
    }
  });

  it("capabilities are few and justified — not one per specialty or nosology", () => {
    expect(Object.keys(CAPABILITIES).length).toBeLessThanOrEqual(6);
    for (const capability of Object.values(CAPABILITIES)) expect(capability.distinctBecause.length).toBeGreaterThan(10);
  });

  it("the answer, drug and guideline families are executed by the source mesh", () => {
    for (const job of ["reference_answer", "drug_reference", "guideline_check", "guideline_discovery", "inn_lookup"] as const) {
      expect(capabilityForJob(job).implementation.kind).toBe("mesh");
    }
    expect(hostForFamily("guidelines")).toBe("reference");
    expect(hostForFamily("events")).toBe("events");
  });
});

describe("domain skill graph", () => {
  it("recognises nosology and subtype from Russian clinical shorthand", () => {
    const match = detectDomain(ACCEPTANCE, "cardiology");
    expect(match.nosology?.id).toBe("cardiology/heart_failure");
    expect(match.subtype?.id).toBe("cardiology/heart_failure/hfpef");
  });

  it("a subtype abbreviation implies its nosology; a bare «сохранённая ФВ» does not", () => {
    expect(detectDomain("HFpEF: новые данные", "therapy").nosology?.id).toBe("cardiology/heart_failure");
    expect(detectDomain("ХСН со сниженной фракцией выброса", "cardiology").subtype?.id).toBe("cardiology/heart_failure/hfref");
    expect(detectDomain("пациенты с сохранённой фракцией", "cardiology").nosology).toBeNull();
  });

  it("cross-specialty questions are recognised without changing the physician's specialty", () => {
    const intent = compileIntent("Метформин при гестационном диабете", "obgyn");
    expect(intent.context.specialty).toBe("obgyn");
    expect(intent.context.nosology?.id).toBe("obgyn/gestational_diabetes");
    expect(intent.safety).toContain("pregnancy_sections");
  });

  it("the most specific scenario wins", () => {
    expect(scenarioFor("guideline_check", "cardiology", "cardiology/heart_failure", "cardiology/heart_failure/hfpef")?.id).toBe("cardiology/heart_failure/*/guideline_check");
    expect(scenarioFor("guideline_check", "therapy", "cardiology/heart_failure", null)?.id).toBe("*/*/*/guideline_check");
  });
});

describe("intent compiler", () => {
  it("compiles the acceptance example into a guideline check with drug, nosology and subtype", () => {
    const intent = compileIntent(ACCEPTANCE, "cardiology");
    expect(intent.job.family).toBe("guidelines");
    expect(intent.job.primary).toBe("guideline_check");
    expect(intent.context.nosology?.id).toBe("cardiology/heart_failure");
    expect(intent.context.subtype?.id).toBe("cardiology/heart_failure/hfpef");
    expect(intent.entities.drugs.map(drug => drug.inn)).toEqual(["empagliflozin"]);
    expect(intent.requirements).toEqual(expect.arrayContaining(["russian_guideline", "current_research", "russian_drug_reference", "specialty_society_guideline"]));
    expect(intent.modules[0]).toBe("key_takeaway");
    expect(intent.safety).toEqual(expect.arrayContaining(["no_prescribing", "jurisdiction_boundary", "currentness_must_be_shown"]));
  });

  it("is deterministic and its id does not depend on wording", () => {
    const a = compileIntent(ACCEPTANCE, "cardiology");
    const b = compileIntent("эмпаглифлозин ХСН сохраненная ФВ: что с рекомендациями сейчас", "cardiology");
    expect(a.id).toBe(b.id);
    expect(compileIntent(ACCEPTANCE, "cardiology")).toEqual(a);
  });

  it("distinguishes drug reference from INN lookup and discovery from check", () => {
    expect(compileIntent("Дапаглифлозин: противопоказания", "endocrinology").job.primary).toBe("drug_reference");
    expect(compileIntent("Аналоги эмпаглифлозина", "endocrinology").job.primary).toBe("inn_lookup");
    expect(compileIntent("Клинические рекомендации по ХОБЛ", "therapy").job.primary).toBe("guideline_discovery");
    expect(compileIntent("Что изменилось в рекомендациях по ХОБЛ", "therapy").job.primary).toBe("guideline_check");
    expect(compileIntent("Что такое бронхиолит", "pediatrics").job.primary).toBe("disease_reference");
  });

  it("an explicit job wins over wording but the domain is still recognised", () => {
    const intent = compileIntent("ХСН", "cardiology", { job: "drug" });
    expect(intent.job.family).toBe("drug");
    expect(intent.job.explicit).toBe(true);
    expect(intent.context.nosology?.id).toBe("cardiology/heart_failure");
  });

  it("every job type has at least one requirement", () => {
    for (const definition of Object.values(JOB_DEFINITIONS)) expect(definition.requirements.length).toBeGreaterThan(0);
  });
});
