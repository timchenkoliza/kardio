import { describe, expect, it } from "vitest";
import { createContentStudioPackage } from "@/lib/pharma/content-studio";
import { evaluateSourcePolicy } from "@/server/agents/services/source-policy";
import { ingestContentStudioSource } from "@/server/pharma/source-ingestion";

const NOW = "2026-10-20T12:00:00.000Z";

function packageFixture() {
  return createContentStudioPackage({
    specialty: "cardiology",
    ownerSubjectId: "pharma_demo",
    briefText: "Подготовь материал для кардиологов",
    now: NOW,
  });
}

describe("pharma source ingestion", () => {
  it("keeps partner material as input, never independent evidence", () => {
    const pkg = ingestContentStudioSource(packageFixture(), {
      kind: "partner_material",
      title: "Материал партнёра",
      url: "https://partner.example/material",
      text: "В исследовании терапия снизила риск госпитализации у пациентов с хронической сердечной недостаточностью на 18%.",
    }, NOW);

    expect(pkg.sources).toHaveLength(1);
    expect(pkg.claims).toHaveLength(1);
    expect(pkg.claims[0].verificationStatus).toBe("UNKNOWN");
    expect(pkg.claims[0].complianceStatus).toBe("needs_review");
    expect(pkg.claims[0].allowedFormats).toEqual([]);
  });

  it("blocks claims coming from a physician-rejected source", () => {
    const pkg = ingestContentStudioSource(packageFixture(), {
      kind: "external_reference",
      title: "Материал из отклонённого источника",
      url: "https://cyberleninka.ru/article/n/example",
      text: "Исследование показало снижение риска госпитализации у пациентов с сердечной недостаточностью на 12%.",
    }, NOW);

    expect(pkg.sources[0].standing).toBe("rejected");
    expect(pkg.claims[0].complianceStatus).toBe("blocked");
    expect(pkg.complianceSummary.blocked).toBe(1);
  });

  it("marks physician-approved domains but still requires runtime verification of pasted text", () => {
    const policy = evaluateSourcePolicy("https://www.fda.gov/safety/medwatch/safety-information");
    expect(policy.standing).toBe("approved");

    const pkg = ingestContentStudioSource(packageFixture(), {
      kind: "external_reference",
      title: "MedWatch safety notice",
      url: "https://www.fda.gov/safety/medwatch/safety-information",
      text: "У пациентов сообщалось о серьёзной нежелательной реакции после применения препарата в клинической практике.",
    }, NOW);

    expect(pkg.sources[0].standing).toBe("approved");
    expect(pkg.claims[0].verificationStatus).toBe("PARTIALLY_SUPPORTED");
    expect(pkg.claims[0].complianceStatus).toBe("needs_review");
    expect(pkg.claims[0].verificationNote).toMatch(/не была независимо получена/i);
    expect(pkg.claims[0].complianceReasons.join(" ")).toMatch(/сверялся с оригиналом/i);
  });

  it("does not invent claims from non-claim prose", () => {
    const pkg = ingestContentStudioSource(packageFixture(), {
      kind: "partner_material",
      title: "Организационный текст",
      url: null,
      text: "Добро пожаловать на образовательную встречу. Программа и время будут опубликованы дополнительно после согласования.",
    }, NOW);

    expect(pkg.claims).toEqual([]);
  });
});
