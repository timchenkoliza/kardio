import { describe, expect, it } from "vitest";
import { buildConsiliumSynthesis, consiliumPersonas, deterministicConsiliumReply } from "@/lib/ui/consilium";

describe("deterministic consilium", () => {
  it("keeps professional lenses distinct", () => {
    const prompt = "Сравнить варианты по безопасности";
    const pharm = deterministicConsiliumReply(consiliumPersonas.find(persona => persona.id === "pharm")!, prompt);
    const interventional = deterministicConsiliumReply(consiliumPersonas.find(persona => persona.id === "interventional")!, prompt);
    expect(pharm).not.toBe(interventional);
    expect(pharm).toMatch(/взаимодейств/);
    expect(interventional).toMatch(/ишемичес|процедур/);
  });

  it("preserves disagreement in synthesis", () => {
    const synthesis = buildConsiliumSynthesis([
      { personaId: "pharm", body: "a" },
      { personaId: "interventional", body: "b" },
    ]);
    expect(synthesis.disagree.join(" ")).toMatch(/безопасност|вмешательств/);
  });
});
