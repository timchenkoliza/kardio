import { describe, expect, it } from "vitest";
import { isSingleIngredient, lookupDrugLabelLive } from "@/server/agents/adapters/openfda";
import { labelDocument } from "@/server/mesh/sources/openfda";

/**
 * R1 review C-2 (P0): the newest openFDA label of «bisoprolol» is a combination with hydrochlorothiazide, and its
 * dose range for hypertension (2.5 to 40 mg) was shown as the bisoprolol answer. The adapter now takes the newest
 * single-ingredient label among several; with combinations only, the label is titled as a combination and its
 * dosing section is never taken.
 */
function record(setId: string, generic: string, dosage: string) {
  return { set_id: setId, version: "11", effective_time: "20260828", openfda: { generic_name: [generic], product_type: ["HUMAN PRESCRIPTION DRUG"], brand_name: ["X"] }, dosage_and_administration: [dosage], contraindications: ["Contraindicated in patients with cardiogenic shock and overt cardiac failure."] };
}

function fetchWith(results: unknown[]) {
  const urls: string[] = [];
  const fetchImpl = async (url: string) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ meta: { results: { total: results.length } }, results }) }; };
  return { fetchImpl, urls };
}

describe("openFDA label choice (R1 C-2)", () => {
  it("a combination listed first is skipped for the single-ingredient label", async () => {
    const { fetchImpl, urls } = fetchWith([
      record("combo-1", "BISOPROLOL FUMARATE AND HYDROCHLOROTHIAZIDE", "Bisoprolol is an effective treatment of hypertension in once-daily doses of 2.5 to 40 mg."),
      record("mono-1", "BISOPROLOL FUMARATE", "The dose of bisoprolol fumarate must be individualized to the needs of the patient. The usual starting dose is 5 mg once daily."),
    ]);
    const result = await lookupDrugLabelLive("bisoprolol", { fetchImpl });
    expect(result.status).toBe("ok");
    expect(result.label?.setId).toBe("mono-1");
    expect(result.label?.genericName).toBe("bisoprolol fumarate");
    expect(JSON.stringify(result.label)).not.toMatch(/hydrochlorothiazide|2\.5 to 40/u);
    expect(urls[0]).toMatch(/limit=20/u);
  });

  it("combinations only: the label is marked as a combination, titled so, and its doses are never taken", async () => {
    const { fetchImpl } = fetchWith([record("combo-2", "SACUBITRIL AND VALSARTAN", "The recommended starting dose is 49/51 mg twice daily.")]);
    const result = await lookupDrugLabelLive("sacubitril", { fetchImpl });
    expect(result.status).toBe("ok");
    expect(result.label?.combination).toBe(true);
    const document = labelDocument(result.label!, { inn: "sacubitril", ru: "сакубитрил", retrievedAt: "2026-10-24T00:00:00.000Z", nosologyId: null, sections: new Set(["dosage_and_administration", "contraindications"]) });
    expect(document.title).toBe("Сакубитрил в составе комбинированного препарата (sacubitril and valsartan): инструкция FDA");
    expect(document.attributes.combination).toBe(true);
    expect(document.claims.map(claim => claim.kind)).toEqual(["contraindication"]);
    expect(JSON.stringify(document)).not.toMatch(/49\/51/u);
  });

  it("names of the drug itself and of combinations", () => {
    expect(isSingleIngredient("bisoprolol fumarate", "bisoprolol")).toBe(true);
    expect(isSingleIngredient("apixaban", "apixaban")).toBe(true);
    expect(isSingleIngredient("bisoprolol fumarate and hydrochlorothiazide", "bisoprolol")).toBe(false);
    expect(isSingleIngredient("amlodipine besylate, valsartan", "valsartan")).toBe(false);
    expect(isSingleIngredient("sacubitril and valsartan", "sacubitril")).toBe(false);
    expect(isSingleIngredient("", "bisoprolol")).toBe(false);
  });
});
