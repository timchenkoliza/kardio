import { describe, expect, it } from "vitest";
import {
  normalizeResearchStudy,
  researchStudyNormalizationFromAttributes,
  researchStudyNormalizationToAttributes,
} from "@/lib/agents/research-study-normalization";
import type { ResearchStructuredEvidence } from "@/lib/agents/research-structured-evidence";

const structured: ResearchStructuredEvidence = {
  access: "full_text",
  sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC123/",
  fields: {
    population: {
      value: "We enrolled 1,248 participants with chronic heart failure. The mean age was 67 years.",
      supportText: "We enrolled 1,248 participants with chronic heart failure. The mean age was 67 years.",
      section: "Methods",
      confidence: 0.9,
    },
    intervention: {
      value: "Participants were randomized to apixaban 5 mg twice daily or placebo for 24 weeks.",
      supportText: "Participants were randomized to apixaban 5 mg twice daily or placebo for 24 weeks.",
      section: "Methods",
      confidence: 0.9,
    },
    comparator: {
      value: "Participants were randomized to apixaban 5 mg twice daily or placebo for 24 weeks.",
      supportText: "Participants were randomized to apixaban 5 mg twice daily or placebo for 24 weeks.",
      section: "Methods",
      confidence: 0.9,
    },
    endpoint: {
      value: "The primary endpoint was cardiovascular death or heart failure hospitalization. Median follow-up was 18 months.",
      supportText: "The primary endpoint was cardiovascular death or heart failure hospitalization. Median follow-up was 18 months.",
      section: "Methods · Results",
      confidence: 0.9,
    },
    effect: {
      value: "The hazard ratio was 0.72; 95% CI 0.58 to 0.89; p=0.003. Median follow-up was 18 months.",
      supportText: "The hazard ratio was 0.72; 95% CI 0.58 to 0.89; p=0.003. Median follow-up was 18 months.",
      section: "Results",
      confidence: 0.9,
    },
  },
};

describe("research study normalization", () => {
  it("normalizes explicit study parameters without calculating new clinical claims", () => {
    const normalized = normalizeResearchStudy(structured);
    expect(normalized?.fields.sampleSize?.value).toBe("N=1248");
    expect(normalized?.fields.age?.value).toBe("67 years (mean)");
    expect(normalized?.fields.inclusionCriteria?.value).toContain("chronic heart failure");
    expect(normalized?.fields.intervention?.value).toBe("apixaban 5 mg twice daily");
    expect(normalized?.fields.dose?.value).toBe("5 mg twice daily");
    expect(normalized?.fields.duration?.value).toBe("24 weeks");
    expect(normalized?.fields.comparator?.value.toLocaleLowerCase("en-US")).toBe("placebo");
    expect(normalized?.fields.endpoint?.value).toContain("cardiovascular death");
    expect(normalized?.fields.followUp?.value).toBe("18 months (median)");
    expect(normalized?.fields.effectMeasure?.value).toBe("HR");
    expect(normalized?.fields.effectEstimate?.value).toBe("0.72");
    expect(normalized?.fields.confidenceInterval?.value).toBe("0.58–0.89");
    expect(normalized?.fields.pValue?.value).toBe("p = 0.003");
  });

  it("round-trips normalized fields with supporting source text", () => {
    const normalized = normalizeResearchStudy(structured);
    const restored = researchStudyNormalizationFromAttributes(researchStudyNormalizationToAttributes(normalized));
    expect(restored?.fields.effectEstimate?.value).toBe("0.72");
    expect(restored?.fields.effectEstimate?.supportText).toContain("95% CI");
    expect(restored?.fields.effectEstimate?.sourceField).toBe("effect");
  });

  it("leaves dose and statistical effect empty when the source fragment does not state them", () => {
    const sparse: ResearchStructuredEvidence = {
      access: "abstract",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/1/",
      fields: {
        population: { value: "Adults with heart failure were included.", supportText: "Adults with heart failure were included.", section: "Methods", confidence: 0.78 },
        intervention: { value: "Participants received active therapy.", supportText: "Participants received active therapy.", section: "Methods", confidence: 0.78 },
      },
    };
    const normalized = normalizeResearchStudy(sparse);
    expect(normalized?.fields.population?.value).toContain("heart failure");
    expect(normalized?.fields.dose).toBeUndefined();
    expect(normalized?.fields.effectEstimate).toBeUndefined();
    expect(normalized?.fields.confidenceInterval).toBeUndefined();
    expect(normalized?.fields.pValue).toBeUndefined();
  });
});
