import { describe, expect, it } from "vitest";
import { drugDemoData, hasDisplayableAggregate, sortDrugs } from "@/lib/ui/drug-intelligence";

describe("drug intelligence demo model", () => {
  it("hides precise aggregates below the display threshold", () => {
    const dabigatran = drugDemoData.find(drug => drug.id === "dabigatran");
    expect(dabigatran).toBeTruthy();
    expect(hasDisplayableAggregate(dabigatran!.ratingsByIndication["Профилактика инсульта при ФП"])).toBe(false);
  });

  it("sorts displayable aggregates before insufficient-data rows", () => {
    const sorted = sortDrugs(drugDemoData, "Профилактика инсульта при ФП", "overall");
    expect(sorted.map(drug => drug.id)).toEqual(["apixaban", "rivaroxaban", "dabigatran"]);
  });
});
