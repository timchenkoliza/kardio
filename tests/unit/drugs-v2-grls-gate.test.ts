import { describe, expect, it } from "vitest";
import { assessDrugChange, drugAssessmentFromAttributes, drugAssessmentToAttributes } from "@/lib/agents/drug-change-assessment";
import { connectorById } from "@/server/agents/connectors";
import { findDrugChanges } from "@/server/agents/services/drug-change";
import { testContext } from "./agent-test-utils";

describe("Drugs v2 official verification gate", () => {
  it("never upgrades a Russian registration report to confirmed while GRLS is unavailable", async () => {
    const ctx = await testContext({ agentId: "drugs", topics: ["ah"] });
    const drafts = findDrugChanges(ctx);
    const ru = drafts.find(item => item.attributes.inn === "баксдростат" && item.attributes.region === "Россия");

    expect(ru).toBeTruthy();
    expect(ru?.attributes["drugAssessment.officialVerification"]).toBe("needs_grls");
    expect(ru?.attributes["drugAssessment.grlsRequired"]).toBe(true);
    expect(ru?.title.startsWith("По данным источника:")).toBe(true);
    expect(ru?.summary).toContain("ГРЛС");
    expect(ru?.reasonShown).toContain("Официальный статус РФ не подтверждён: ГРЛС недоступен");

    const grlsEvidence = ru?.evidence.find(item => item.sourceId === "grls");
    expect(grlsEvidence?.verificationStatus).toBe("UNKNOWN");
    expect(grlsEvidence?.confidence).toBe(0);
    expect(ru?.evidence.some(item => item.verificationStatus === "PARTIALLY_SUPPORTED")).toBe(true);
  });

  it("keeps a Russian announcement as an announcement until GRLS confirms registration", async () => {
    const ctx = await testContext({ agentId: "drugs", topics: ["ph"] });
    const draft = findDrugChanges(ctx).find(item => item.attributes.inn === "селексипаг");

    expect(draft).toBeTruthy();
    expect(draft?.attributes.status).toBe("announced");
    expect(draft?.attributes["drugAssessment.officialVerification"]).toBe("needs_grls");
    expect(draft?.title.startsWith("Анонс:")).toBe(true);
    expect(String(draft?.attributes["drugAssessment.practiceImpact"])).toContain("Не считать селексипаг зарегистрированным");
  });

  it("uses primary-source verification for non-Russian regulatory reports instead of GRLS", async () => {
    const ctx = await testContext({ agentId: "drugs", topics: ["cardiomyopathy"] });
    const draft = findDrugChanges(ctx).find(item => item.attributes.inn === "aficamten");

    expect(draft).toBeTruthy();
    expect(draft?.attributes["drugAssessment.officialVerification"]).toBe("needs_primary_source");
    expect(draft?.attributes["drugAssessment.grlsRequired"]).toBe(false);
    expect(draft?.evidence.some(item => item.sourceId === "grls")).toBe(false);
    expect(String(draft?.attributes["drugAssessment.verificationTarget"])).toContain("Drugs@FDA");
  });

  it("does not treat guideline context or a new study as a registration change", () => {
    const guideline = assessDrugChange({
      type: "GUIDELINE_CHANGE",
      region: "INTL",
      status: "effective",
      sourceKind: "secondary",
      verificationTarget: "European Heart Journal",
    });
    const study = assessDrugChange({
      type: "IMPORTANT_NEW_STUDY",
      region: "INTL",
      status: "effective",
      sourceKind: "secondary",
      verificationTarget: "NEJM / PubMed",
    });

    expect(guideline.officialVerification).toBe("not_applicable");
    expect(guideline.basis).toBe("guideline_context");
    expect(study.officialVerification).toBe("not_applicable");
    expect(study.basis).toBe("secondary_study_report");
  });

  it("round-trips assessment attributes and keeps GRLS connector explicitly unavailable", () => {
    const assessment = assessDrugChange({
      type: "LABEL_CHANGE",
      region: "RU",
      status: "effective",
      sourceKind: "secondary",
      verificationTarget: "ГРЛС",
    });
    const restored = drugAssessmentFromAttributes(drugAssessmentToAttributes(assessment));

    expect(restored?.officialVerification).toBe("needs_grls");
    expect(restored?.grlsRequired).toBe(true);
    expect(connectorById("grls")?.mode).toBe("UNAVAILABLE");
    expect(connectorById("grls")?.dataOrigin).toBe("none");
  });
});
