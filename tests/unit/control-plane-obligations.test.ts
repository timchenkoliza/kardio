import { describe, expect, it } from "vitest";
import type { ChangeContract, ExperienceSample } from "@/control-plane/lib/model";
import { evaluateNegativeObligations } from "@/control-plane/lib/obligations";
import { classifyRisk, derivedExperienceTriggers, derivedSemanticTriggers } from "@/control-plane/lib/risk";

const sample = (patch: Partial<ExperienceSample> = {}): ExperienceSample => ({ scenario: "s1", manifest_id: "m1", primary_job: "guideline_check", module_families: ["key_takeaway", "evidence", "sources"], representation: "guideline_delta", stable_shell_version: "portal-shell/1", source_policy_version: "p1", onboarding_shown: false, ranking: ["d1", "d2"], ...patch });

const base: ChangeContract = { change_id: "CHG-ranking", title: "ranking", problem: "p", hypothesis: "h", guardrails: [] };

describe("negative obligations", () => {
  it("a ranking change that declares it keeps module families, navigation and job passes when they hold", () => {
    const contract: ChangeContract = { ...base, cause: "ranking_delta", changes: { ranking: true }, does_not_change: { module_family: true, navigation: true, user_job: true, source_policy: true, onboarding: true } };
    const result = evaluateNegativeObligations(contract, [sample()], [sample({ manifest_id: "m2", ranking: ["d2", "d1"] })]);
    expect(result.passed).toBe(true);
    expect(result.checked).toEqual(["module_family", "navigation", "user_job", "source_policy", "onboarding"]);
  });

  it("reports each violated obligation with before/after", () => {
    const contract: ChangeContract = { ...base, does_not_change: { module_family: true, user_job: true } };
    const result = evaluateNegativeObligations(contract, [sample()], [sample({ module_families: ["key_takeaway", "conflict", "sources"], primary_job: "reference_answer" })]);
    expect(result.passed).toBe(false);
    expect(result.violations.map(item => item.obligation).sort()).toEqual(["module_family", "user_job"]);
  });

  it("declaring the same dimension as changed and unchanged is a contradiction", () => {
    const contract: ChangeContract = { ...base, changes: { ranking: true }, does_not_change: { ranking: true } };
    expect(evaluateNegativeObligations(contract, [sample()], [sample()]).contradictions).toEqual(["ranking"]);
  });

  it("declared obligations add a release-blocking regression gate", () => {
    const assessment = classifyRisk({ contract: { ...base, does_not_change: { navigation: true } }, changedFiles: ["docs/x.md"], candidateSha: "c", baselineSha: "b" });
    expect(assessment.required_gates).toContain("negative_obligations");
  });
});

describe("non-code causes on both risk axes", () => {
  it("a source delta that moves guideline claims is R4 even with no changed files", () => {
    const contract: ChangeContract = { ...base, cause: "source_delta", knowledge_delta: { sources: ["medi"], documents: [], claims_added: ["c2"], claims_removed: ["c1"], claim_kinds: ["guideline_statement"], entities: [], scenarios_stale: ["s1"], scenarios_untouched: 3 } };
    expect(derivedSemanticTriggers(contract)).toEqual(expect.arrayContaining(["medical_evidence", "clinical_recommendation"]));
    expect(classifyRisk({ contract, changedFiles: [], candidateSha: "knowledge:v2", baselineSha: "knowledge:v1" }).risk_class).toBe("R4");
  });

  it("a content refresh with the same modules is E1; a module-set change is E2", () => {
    const refresh = { manifests_invalidated: ["m1"], manifests_regenerated: ["m2"], module_families_before: [["key_takeaway", "evidence"]], module_families_after: [["key_takeaway", "evidence"]], order_changed: false, representation_changed: false };
    expect(derivedExperienceTriggers({ ...base, experience_delta: refresh })).toEqual(["source_content_refresh"]);
    expect(derivedExperienceTriggers({ ...base, experience_delta: { ...refresh, module_families_after: [["key_takeaway"]] } })).toEqual(["module_selection_change"]);
  });
});
