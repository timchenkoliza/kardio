import { describe, expect, it } from "vitest";
import { classifyPbzCardiologyQuery, isSafePbzPersonalizationQuery, summarizePbzCardiologyHistory } from "@/lib/ui/pbz-history";

describe("PBZ cardiology history signals", () => {
  it("classifies short professional cardiology queries", () => {
    expect(classifyPbzCardiologyQuery("Клинические рекомендации артериальной гипертензии")).toContain("hypertension");
    expect(classifyPbzCardiologyQuery("Взаимодействие апиксабана и амиодарона")).toContain("anticoagulation");
    expect(classifyPbzCardiologyQuery("Референсные значения тропонина")).toContain("ischemia");
  });

  it("rejects patient-level prompts from personalization", () => {
    const value = "Пациент 53 года, полис ОМС 0000000000000000, АД 145/89";
    expect(isSafePbzPersonalizationQuery(value)).toBe(false);
    expect(classifyPbzCardiologyQuery(value)).toEqual([]);
  });

  it("aggregates repeated professional signals deterministically", () => {
    const result = summarizePbzCardiologyHistory([
      "Гипертонический криз классификация",
      "Клинические рекомендации артериальной гипертензии",
      "Розувастатин",
    ]);
    expect(result[0]?.cluster.id).toBe("hypertension");
    expect(result[0]?.count).toBe(2);
    expect(result.some((entry) => entry.cluster.id === "lipids" && entry.count === 1)).toBe(true);
  });
});
