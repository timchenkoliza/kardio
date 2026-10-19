import { afterEach, describe, expect, it, vi } from "vitest";
import { expertTwinsPanels, inferExpertTwinsDomainTags } from "@/lib/integrations/expert-twins";
import { runExpertConsilium } from "@/server/services/expert-twins";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Expert Twins integration", () => {
  it("keeps cardiology and oncology panels isolated", () => {
    expect(expertTwinsPanels.cardiology).toHaveLength(3);
    expect(expertTwinsPanels.oncology).toHaveLength(3);
    const cardioIds = new Set(expertTwinsPanels.cardiology.map(expert => expert.id));
    expect(expertTwinsPanels.oncology.some(expert => cardioIds.has(expert.id))).toBe(false);
  });

  it("routes narrow corpus domains without inventing unsupported tags", () => {
    expect(inferExpertTwinsDomainTags("cardiology", "HFrEF с декомпенсацией и ХБП")).toEqual(["heart_failure", "chronic_kidney_disease"]);
    expect(inferExpertTwinsDomainTags("oncology", "Метастатический ПКР, вопрос по системной терапии")).toEqual(["metastatic_rcc"]);
    expect(inferExpertTwinsDomainTags("oncology", "саркома мягких тканей")).toEqual([]);
  });

  it("posts the stable council contract to the sidecar", async () => {
    const result = {
      case_id: "case-1",
      council: "cardiology" as const,
      experts: [],
      synthesis: {
        consensus_summary: "",
        agreements: [],
        disagreements: [],
        unresolved_questions: [],
        safety_notice: "",
      },
      policy_version: "v0.1",
      model_version: "deterministic",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runExpertConsilium({ council: "cardiology", question: "Что важно при HFrEF?", domain_tags: ["heart_failure"] }, { baseUrl: "http://127.0.0.1:8088" })).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8088/v1/consilium/run", expect.objectContaining({
      method: "POST",
      cache: "no-store",
    }));
  });
});
