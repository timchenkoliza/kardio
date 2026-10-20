import { describe, expect, it } from "vitest";
import type { ArticleContext, ContentMapping, CriticReport, MappingStageOutput, RecraftInput, SourceVisualPassport } from "@/lib/recraft/contract";
import { buildRedrawPrompt, checkMapping, criticVerdict, decideMatch, outsideSemanticBoundary, strategyFor, transformationStrength } from "@/lib/recraft/gates";
import { runRecraft } from "@/server/recraft/pipeline";
import { parseModelJson, recraftAvailability, type RecraftImageModel, type RecraftVision } from "@/server/recraft/providers";

const article: ArticleContext = {
  contentId: "c1",
  title: "Коронарография при стабильной ИБС: когда нужна",
  caption: "Коронарография: стеноз передней нисходящей артерии",
  clinicalSubject: "ИБС",
  clinicalJob: "clinical",
  excerpt: "Разбор показаний к инвазивной коронарографии.",
  contentPassport: null,
};

const mapping: ContentMapping = {
  clinicalTopic: "Ишемическая болезнь сердца",
  nosologyOrObject: "стеноз передней нисходящей артерии",
  icd10: "I25.1",
  bindingType: "diagnostic_finding",
  confidence: "high",
  catalogBlock: "ИБС",
  ambiguity: null,
  sourceBasis: "Подпись и заголовок совпадают",
  approvedStatements: ["коронарное русло левой коронарной артерии", "стеноз передней нисходящей артерии", "катетер в устье артерии"],
};

const passport: SourceVisualPassport = {
  sourceType: "angiography",
  primaryAnchor: "левая коронарная артерия",
  viewProjection: "правая передняя косая",
  mustPreserveStructures: ["ствол ЛКА", "передняя нисходящая артерия", "огибающая артерия"],
  mustPreserveRelationships: ["стеноз в проксимальной трети ПНА"],
  pathologyFinding: "проксимальный стеноз ПНА",
  laterality: "left",
  flowDirection: "антеградный",
  articleRelationship: "иллюстрирует показание к коронарографии",
  read500ms: "стеноз коронарной артерии на ангиограмме",
  mustNotInvent: ["стент", "второй стеноз"],
  containsPatientIdentifiers: false,
  diagnosticMarkers: [],
};

const cleanCritic: CriticReport = {
  sourceFidelity: { sameStructure: true, sameViewOrSide: true, sameFindingLocation: true, noNewClinicalInformation: true },
  semanticFidelity: true,
  styleFidelity: true,
  hallucinations: [],
  depictedElements: ["коронарное русло", "стеноз передней нисходящей артерии", "фон"],
  selfReject: { anatomyDiffers: false, pathologyMoved: false, lateralityOrProjectionChanged: false, structureInvented: false, genericCardiologyPicture: false, decorationDominates: false, differentClinicalConcept: false, stockAdvertisingLook: false, outsideVisualSystem: false },
  notes: "",
};

function input(overrides: Partial<ArticleContext> = {}): RecraftInput {
  return {
    source: { id: "s1", mimeType: "image/png", base64: "aGVsbG8=", role: "clinical_source_of_truth", credit: "BruceBlaus · CC BY-SA 4.0" },
    article: { ...article, ...overrides },
    target: { format: "2:1", usage: "article_card", specialty: "cardiology" },
  };
}

function fakeVision(stage: MappingStageOutput, critics: CriticReport[], sourcePassport = passport): RecraftVision & { critiques: number } {
  const fake = {
    model: "fake-vision",
    critiques: 0,
    async mapContent() { return stage; },
    async analyzeSource() { return sourcePassport; },
    async critique() { const report = critics[Math.min(fake.critiques, critics.length - 1)]; fake.critiques += 1; return report; },
  };
  return fake;
}

const fakeImage = (calls: string[] = []): RecraftImageModel => ({
  model: "fake-image",
  async redraw(_source, prompt, count) { calls.push(prompt); return Array.from({ length: count }, (_, index) => ({ mimeType: "image/png", base64: `cand${calls.length}${index}` })); },
});

describe("content mapping gate", () => {
  it("never upgrades a risk statement to a disease and drops the code", () => {
    const checked = checkMapping(
      { ...mapping, bindingType: "disease", icd10: "I10", nosologyOrObject: "артериальная гипертензия" },
      { ...article, title: "Факторы риска у молодых: что учитывать", caption: "Профилактика: снижение риска", clinicalSubject: null, excerpt: "Скрининг факторов риска." },
    );
    expect(checked.mapping.bindingType).toBe("risk");
    expect(checked.mapping.icd10).toBe("NO CODE");
    expect(checked.mapping.confidence).toBe("low");
    expect(checked.violations.join(" ")).toContain("Повышение уровня запрещено");
  });

  it("treats a source conflict as blocking with low confidence and no code", () => {
    const checked = checkMapping({ ...mapping, bindingType: "prompt_conflict" }, article);
    expect(checked.blocking).toBe(true);
    expect(checked.mapping.confidence).toBe("low");
    expect(checked.mapping.icd10).toBe("NO CODE");
  });

  it("removes codes from context bindings and invalid codes", () => {
    expect(checkMapping({ ...mapping, bindingType: "context", icd10: "I25" }, article).mapping.icd10).toBe("NO CODE");
    expect(checkMapping({ ...mapping, icd10: "coronary" }, article).mapping.icd10).toBe("NO CODE");
  });

  it("keeps a subcategory code only when the sources name it", () => {
    expect(checkMapping(mapping, article).mapping.icd10).toBe("I25.1");
    expect(checkMapping({ ...mapping, nosologyOrObject: "атеросклеротическая болезнь сердца" }, article).mapping.icd10).toBe("I25");
  });
});

describe("match gate", () => {
  it("maps grades to production rules", () => {
    expect(decideMatch("EXACT", "article_card", "").generate).toBe(true);
    expect(decideMatch("MEDIUM", "article_card", "").label).toContain("Иллюстрация к теме");
    expect(decideMatch("PARTIAL", "article_card", "").status).toBe("replace_image");
    expect(decideMatch("PARTIAL", "digest", "").generate).toBe(true);
    expect(decideMatch("WEAK_PROXY", "hero", "").status).toBe("replace_image");
    expect(decideMatch("NO_VALID_MATCH", "hero", "").status).toBe("do_not_use");
  });
});

describe("semantic lock and critic", () => {
  it("uses a lower transformation strength for diagnostic sources", () => {
    expect(transformationStrength("diagnostic").max).toBeLessThan(transformationStrength("editorial").min);
    expect(strategyFor(passport)).toBe("vascular_flow");
  });

  it("puts the lock, fidelity rules and palette into the redraw prompt", () => {
    const prompt = buildRedrawPrompt(passport, mapping, "vascular_flow", "diagnostic");
    expect(prompt).toContain("проксимальный стеноз ПНА");
    expect(prompt).toContain("stenosis / occlusion location");
    expect(prompt).toContain("#7275FF");
    expect(prompt).toContain("Do not mirror");
  });

  it("flags elements outside the approved statements", () => {
    expect(outsideSemanticBoundary(["стеноз передней нисходящей артерии", "стент в артерии", "фон"], mapping.approvedStatements)).toEqual(["стент в артерии"]);
  });

  it("fails a candidate on any self-reject condition", () => {
    const verdict = criticVerdict({ ...cleanCritic, selfReject: { ...cleanCritic.selfReject, genericCardiologyPicture: true } }, mapping);
    expect(verdict.pass).toBe(false);
    expect(criticVerdict(cleanCritic, mapping).pass).toBe(true);
  });
});

describe("recraft pipeline", () => {
  it("is unavailable without a vision model and never fabricates output", async () => {
    const result = await runRecraft(input(), { vision: null, image: null });
    expect(result.status).toBe("unavailable");
    expect(result.final).toBeNull();
  });

  it("stops before generation on a source conflict", async () => {
    const calls: string[] = [];
    const result = await runRecraft(input(), { vision: fakeVision({ mapping: { ...mapping, bindingType: "prompt_conflict" }, match: { grade: "EXACT", reason: "" } }, [cleanCritic]), image: fakeImage(calls) });
    expect(result.status).toBe("needs_source_verification");
    expect(calls).toHaveLength(0);
  });

  it("stops on a weak proxy and on visible patient identifiers", async () => {
    const weak = await runRecraft(input(), { vision: fakeVision({ mapping, match: { grade: "WEAK_PROXY", reason: "общая картинка" } }, [cleanCritic]), image: fakeImage() });
    expect(weak.status).toBe("replace_image");
    const identified = await runRecraft(input(), { vision: fakeVision({ mapping, match: { grade: "EXACT", reason: "" } }, [cleanCritic], { ...passport, containsPatientIdentifiers: true }), image: fakeImage() });
    expect(identified.status).toBe("needs_deidentification");
  });

  it("returns the semantic lock when only the image model is missing", async () => {
    const result = await runRecraft(input(), { vision: fakeVision({ mapping, match: { grade: "STRONG", reason: "" } }, [cleanCritic]), image: null });
    expect(result.status).toBe("unavailable");
    expect(result.passport?.primaryAnchor).toBe("левая коронарная артерия");
    expect(result.promptDigest).toMatch(/^[0-9a-f]{16}$/u);
  });

  it("generates three candidates, regenerates once with critic feedback and only then accepts", async () => {
    const calls: string[] = [];
    const rejected = { ...cleanCritic, sourceFidelity: { ...cleanCritic.sourceFidelity, sameFindingLocation: false } };
    const result = await runRecraft(input(), { vision: fakeVision({ mapping, match: { grade: "EXACT", reason: "" } }, [rejected, rejected, rejected, cleanCritic]), image: fakeImage(calls) });
    expect(result.status).toBe("completed");
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("находка не на месте");
    expect(result.candidates).toHaveLength(6);
    expect(result.final?.candidateIndex).toBe(3);
    expect(result.label).toContain("Перерисовано по исходному изображению");
  });

  it("rejects when no candidate passes after the second round", async () => {
    const rejected = { ...cleanCritic, hallucinations: ["второй стеноз"] };
    const result = await runRecraft(input(), { vision: fakeVision({ mapping, match: { grade: "EXACT", reason: "" } }, [rejected]), image: fakeImage() });
    expect(result.status).toBe("rejected_by_critic");
    expect(result.final).toBeNull();
  });
});

describe("providers", () => {
  it("reports availability from environment keys only", () => {
    expect(recraftAvailability({} as NodeJS.ProcessEnv)).toEqual({ vision: false, image: false, visionModel: null, imageModel: null });
    expect(recraftAvailability({ ANTHROPIC_API_KEY: "k" } as unknown as NodeJS.ProcessEnv).vision).toBe(true);
  });

  it("extracts JSON from a model answer", () => {
    expect(parseModelJson("Ответ:\n{\"a\":1}\n")).toEqual({ a: 1 });
    expect(() => parseModelJson("нет")).toThrow();
  });
});
