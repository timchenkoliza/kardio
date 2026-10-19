import { describe, expect, it } from "vitest";
import type { UiBlockPreference } from "@/lib/domain/types";
import { productBlockTaxonomy } from "@/lib/ui/block-taxonomy";
import { composeGenUiBlocks } from "@/lib/ui/gen-ui";

const blocks = [
  { id: "a", label: "A", kind: "hero_knowledge" as const, value: "A" },
  { id: "b", label: "B", kind: "knowledge_shelf" as const, value: "B" },
  { id: "c", label: "C", kind: "context_prompt" as const, value: "C" },
];

function preference(blockId: string, mode: UiBlockPreference["mode"]): UiBlockPreference {
  return { specialty: "cardiology", shell: "practice", blockId, label: blockId.toUpperCase(), mode };
}

describe("GEN UI composition", () => {
  it("keeps the default block order without preferences", () => {
    expect(composeGenUiBlocks(blocks, [], "cardiology", "practice").map(block => block.id)).toEqual(["a", "b", "c"]);
  });

  it("pins first, hides completely and moves less-important blocks later", () => {
    const preferences = [preference("a", "less"), preference("b", "hidden"), preference("c", "pinned")];
    expect(composeGenUiBlocks(blocks, preferences, "cardiology", "practice").map(block => block.id)).toEqual(["c", "a"]);
  });

  it("does not leak preferences between shells or specialties", () => {
    const preferences = [preference("a", "hidden")];
    expect(composeGenUiBlocks(blocks, preferences, "cardiology", "explore").map(block => block.id)).toEqual(["a", "b", "c"]);
    expect(composeGenUiBlocks(blocks, preferences, "oncology", "practice").map(block => block.id)).toEqual(["a", "b", "c"]);
  });

  it("defines stable regions for every product block kind", () => {
    expect(productBlockTaxonomy.hero_knowledge.region).toBe("primary");
    expect(productBlockTaxonomy.context_prompt.region).toBe("rail");
    expect(productBlockTaxonomy.assistant_entry.region).toBe("full");
  });
});
