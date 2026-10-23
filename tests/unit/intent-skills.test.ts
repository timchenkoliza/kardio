import { describe, expect, it } from "vitest";
import { compileIntent } from "@/lib/mesh/intent";
import { FLOWS, topologicalSteps } from "@/lib/mesh/flows/registry";
import { matchSkill } from "@/lib/mesh/skills/match";
import { SKILL_LIBRARY, skillById } from "@/lib/mesh/skills/registry";
import { SKILLS as CARDIOLOGY } from "@/lib/mesh/skills/cardiology";
import { SKILLS as ENDOCRINOLOGY } from "@/lib/mesh/skills/endocrinology";
import { SKILLS as NEUROLOGY } from "@/lib/mesh/skills/neurology";
import { SKILLS as OBGYN } from "@/lib/mesh/skills/obgyn";
import { SKILLS as PEDIATRICS } from "@/lib/mesh/skills/pediatrics";
import { SKILLS as THERAPY } from "@/lib/mesh/skills/therapy";
import { applySkill, decideStrategy } from "@/lib/mesh/strategy";
import type { IntentSkill } from "@/lib/mesh/skills/types";

const shadow = (skills: readonly IntentSkill[]) => skills.map(skill => ({ ...skill, rollout: { mode: "shadow" as const, change: null } }));
const primary = (skills: readonly IntentSkill[]) => skills.map(skill => ({ ...skill, rollout: { mode: "primary" as const, change: "CHG-test" } }));

describe("Skills library: exactly three, internal, versioned", () => {
  it("has exactly three Skills, each with a flow, an evaluation contract and a physician-language explanation", () => {
    expect(SKILL_LIBRARY.map(skill => skill.id)).toEqual(["cardiology.guideline_change", "cardiology.drug_evidence", "pediatrics.drug_reference_children"]);
    expect([CARDIOLOGY.length, PEDIATRICS.length, THERAPY.length, OBGYN.length, NEUROLOGY.length, ENDOCRINOLOGY.length]).toEqual([2, 1, 0, 0, 0, 0]);
    for (const skill of SKILL_LIBRARY) {
      expect(skill.version).toMatch(/^\d+\.\d+\.\d+$/u);
      expect(FLOWS.some(flow => flow.id === skill.flowId)).toBe(true);
      expect(skill.evaluationContract.maxUnsupportedClaims).toBe(0);
      expect(skill.evaluationContract.cases.some(item => item.expectMatch)).toBe(true);
      expect(skill.evaluationContract.cases.some(item => !item.expectMatch)).toBe(true);
      // Physician language, never machinery.
      expect(skill.experiencePolicy.explanation).not.toMatch(/skill|flow|агент|запущен/iu);
      expect(skill.experiencePolicy.explanation.length).toBeLessThanOrEqual(140);
    }
  });

  it("every Flow is an acyclic DAG whose dependencies and branches reference real steps", () => {
    for (const flow of FLOWS) {
      const ids = new Set(flow.steps.map(step => step.id));
      expect(topologicalSteps(flow)).toHaveLength(flow.steps.length);
      for (const edge of flow.dependencies) { expect(ids.has(edge.from)).toBe(true); expect(ids.has(edge.to)).toBe(true); }
      for (const step of flow.steps.filter(item => item.branch)) for (const target of [...step.branch!.then, ...step.branch!.otherwise]) expect(ids.has(target)).toBe(true);
      expect(flow.fallbackPolicy.onFailure).toBe("generic_path");
    }
    expect(() => topologicalSteps({ ...FLOWS[0], dependencies: [...FLOWS[0].dependencies, { from: "compile", to: "resolve_topic" }] })).toThrow(/cycle/u);
  });
});

describe("layered matching: domain graph + family + entities + signals + confidence", () => {
  for (const skill of SKILL_LIBRARY) {
    for (const item of skill.evaluationContract.cases) {
      it(`${skill.id}: ${item.expectMatch ? "matches" : "does not match"} «${item.text}» (${item.specialty})`, () => {
        const intent = compileIntent(item.text, item.specialty);
        const result = matchSkill(intent, item.text, item.specialty);
        if (item.expectMatch) {
          expect(result.matched?.skillId).toBe(skill.id);
          expect(result.matched!.confidence).toBeGreaterThanOrEqual(skill.matches.threshold);
          expect(result.matched!.reasons.length).toBeGreaterThan(0);
        } else expect(result.matched?.skillId).not.toBe(skill.id);
      });
    }
  }

  it("never matches across specialties: cardiology Skills stay in cardiology, the pediatric Skill in pediatrics", () => {
    expect(matchSkill(compileIntent("Что изменилось в рекомендациях по ХСН?", "therapy"), "Что изменилось в рекомендациях по ХСН?", "therapy").matched).toBeNull();
    expect(matchSkill(compileIntent("Амоксициллин у детей", "cardiology"), "Амоксициллин у детей", "cardiology").matched).toBeNull();
    expect(matchSkill(compileIntent("Амоксициллин у детей", "therapy"), "Амоксициллин у детей", "therapy").matched).toBeNull();
  });

  it("an explicitly chosen job is never overridden by a Skill that executes as another job", () => {
    const text = "Эмпаглифлозин при ХСН-сФВ — что сейчас известно?";
    expect(matchSkill(compileIntent(text, "cardiology"), text, "cardiology").matched?.skillId).toBe("cardiology.drug_evidence");
    const explicit = compileIntent(text, "cardiology", { job: "drug" });
    expect(matchSkill(explicit, text, "cardiology").matched).toBeNull();
  });

  it("reports a Skill whose job is clearly asked for but whose topic is missing (for one question)", () => {
    const text = "Что изменилось в рекомендациях?";
    const result = matchSkill(compileIntent(text, "cardiology"), text, "cardiology");
    expect(result.matched).toBeNull();
    expect(result.incomplete).toMatchObject({ skill: { id: "cardiology.guideline_change" }, missing: ["nosology"] });
  });
});

describe("applySkill: the Skill only adds — never drops — evidence", () => {
  it("drug_evidence executes exactly as the proven golden path", () => {
    const golden = "Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?";
    const generic = compileIntent(golden, "cardiology");
    const applied = applySkill(generic, skillById("cardiology.drug_evidence")!, golden);
    expect(applied.id).toBe(generic.id);
    expect(applied.job.primary).toBe(generic.job.primary);
    expect(applied.requirements).toEqual(generic.requirements);
    expect(applied.optional).toEqual(generic.optional);
    expect(applied.modules).toEqual(generic.modules);
  });

  it("«что сейчас известно» about a drug in a disease runs the golden evidence set, not a bare instruction lookup", () => {
    const text = "Эмпаглифлозин при ХСН-сФВ — что сейчас известно?";
    const generic = compileIntent(text, "cardiology");
    expect(generic.job.primary).toBe("drug_reference");
    const applied = applySkill(generic, skillById("cardiology.drug_evidence")!, text);
    expect(applied.job.primary).toBe("guideline_check");
    expect(applied.job.family).toBe("guidelines");
    for (const requirement of generic.requirements) expect(applied.requirements).toContain(requirement);
    expect(applied.requirements).toEqual(expect.arrayContaining(["russian_drug_reference", "russian_guideline", "specialty_society_guideline", "current_research", "official_guideline_status"]));
    // Same evidence as the golden question → the same intent id → evidence reuse.
    expect(applied.id).toBe(compileIntent("Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?", "cardiology").id);
  });

  it("guideline_change keeps every generic requirement and module", () => {
    for (const text of ["Что изменилось в рекомендациях по ХСН?", "Какие новые рекомендации по ХСН-сФВ?", "Что изменилось в рекомендациях по фибрилляции предсердий?"]) {
      const generic = compileIntent(text, "cardiology");
      const applied = applySkill(generic, skillById("cardiology.guideline_change")!, text);
      for (const requirement of generic.requirements) expect(applied.requirements).toContain(requirement);
      for (const family of generic.modules) expect(applied.modules).toContain(family);
      expect(applied.job.primary).toBe("guideline_check");
    }
  });
});

describe("execution strategy: Skill fast path, shadow first, dynamic otherwise", () => {
  it("while a Skill is in shadow the generic intent executes; once primary, the Skill's", () => {
    const text = "Какие новые рекомендации по ХСН-сФВ?";
    const inShadow = decideStrategy({ text, specialty: "cardiology", library: shadow(SKILL_LIBRARY) });
    expect(inShadow.executionClass).toBe("skill");
    expect(inShadow.mode).toBe("shadow");
    expect(inShadow.intent).toBe(inShadow.generic);
    expect(inShadow.skillIntent?.job.primary).toBe("guideline_check");
    const asPrimary = decideStrategy({ text, specialty: "cardiology", library: primary(SKILL_LIBRARY) });
    expect(asPrimary.mode).toBe("primary");
    expect(asPrimary.intent).toBe(asPrimary.skillIntent);
    expect(asPrimary.explanation).toBe("Сравниваем текущую и предыдущую версии рекомендаций");
    expect(asPrimary.flow?.id).toBe("guideline_change.flow");
  });

  it("a novel request takes the dynamic path with a text-free signature", () => {
    const strategy = decideStrategy({ text: "Мигрень", specialty: "neurology", job: "guidelines" });
    expect(strategy.executionClass).toBe("dynamic");
    expect(strategy.signature).toBe("neurology|guideline_discovery|neurology/migraine|-|-|-");
    expect(strategy.signature).not.toMatch(/мигрен/iu);
  });

  it("simple requests stay one click: no clarification, no plan", () => {
    for (const [text, specialty, job] of [["Семаглутид — что с ним?", "endocrinology", null], ["Апиксабан", "cardiology", "drug"], ["Сердечная недостаточность", "cardiology", "guidelines"], ["Пробиотики при остром гастроэнтерите у детей", "pediatrics", null], ["Метформин при хронической болезни почек", "endocrinology", null]] as const) {
      const strategy = decideStrategy({ text, specialty, job });
      expect(strategy.clarification, text).toBeNull();
      expect(strategy.planPreview, text).toBeNull();
    }
  });

  it("a large comparison shows the plan first; confirming it runs without asking again", () => {
    const text = "Сравни апиксабан, ривароксабан и дабигатран при ФП";
    const first = decideStrategy({ text, specialty: "cardiology" });
    expect(first.executionClass).toBe("dynamic");
    // Only what the planned sources do (N20-4, N21 A): reviews and their discrepancies, no instruction the comparison does not open.
    expect(first.planPreview?.steps.length).toBeGreaterThanOrEqual(2);
    expect(first.planPreview?.steps.join(" ")).not.toMatch(/инструкц/iu);
    expect(first.planPreview?.steps.join(" ")).not.toMatch(/skill|pubmed|medi|агент/iu);
    expect(decideStrategy({ text, specialty: "cardiology", planConfirmed: first.planPreview!.id }).planPreview).toBeNull();
  });
});
