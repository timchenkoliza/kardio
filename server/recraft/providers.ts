import "server-only";
import { z } from "zod";
import type { CriticReport, MappingStageOutput, RecraftInput, RecraftSourceImage, SourceVisualPassport } from "@/lib/recraft/contract";
import { CRITIC_PROMPT, MAPPING_PROMPT, PASSPORT_PROMPT, RECRAFT_SYSTEM_PROMPT } from "@/lib/recraft/prompts";

/**
 * Model access for Clinical Visual Recraft. Both providers are optional:
 * without keys the pipeline reports UNAVAILABLE and never fabricates output.
 */

export interface GeneratedImage { mimeType: string; base64: string }

export interface RecraftVision {
  readonly model: string;
  mapContent(input: RecraftInput): Promise<MappingStageOutput>;
  analyzeSource(input: RecraftInput): Promise<SourceVisualPassport>;
  critique(input: RecraftInput, candidate: GeneratedImage, lock: string): Promise<CriticReport>;
}

export interface RecraftImageModel {
  readonly model: string;
  redraw(source: RecraftSourceImage, prompt: string, count: number): Promise<GeneratedImage[]>;
}

export interface RecraftProviders { vision: RecraftVision | null; image: RecraftImageModel | null }

const mappingSchema = z.object({
  mapping: z.object({
    clinicalTopic: z.string(),
    nosologyOrObject: z.string(),
    icd10: z.string(),
    bindingType: z.enum(["disease", "symptom", "risk", "context", "anatomy", "diagnostic_finding", "intervention", "device_status", "mechanism", "no_code", "prompt_conflict"]),
    confidence: z.enum(["high", "medium", "low"]),
    catalogBlock: z.string().nullable(),
    ambiguity: z.string().nullable(),
    sourceBasis: z.string(),
    approvedStatements: z.array(z.string()),
  }),
  match: z.object({ grade: z.enum(["EXACT", "STRONG", "MEDIUM", "PARTIAL", "WEAK_PROXY", "NO_VALID_MATCH"]), reason: z.string() }),
});

const passportSchema = z.object({
  sourceType: z.enum(["angiography", "ct_coronary", "ct", "mri", "echocardiography", "ecg", "anatomical_illustration", "pathology_specimen", "diagram", "photo", "other"]),
  primaryAnchor: z.string(),
  viewProjection: z.string().nullable(),
  mustPreserveStructures: z.array(z.string()),
  mustPreserveRelationships: z.array(z.string()),
  pathologyFinding: z.string().nullable(),
  laterality: z.enum(["left", "right", "none", "not_applicable"]),
  flowDirection: z.string().nullable(),
  articleRelationship: z.string().nullable(),
  read500ms: z.string(),
  mustNotInvent: z.array(z.string()),
  containsPatientIdentifiers: z.boolean(),
  diagnosticMarkers: z.array(z.string()),
});

const criticSchema = z.object({
  sourceFidelity: z.object({ sameStructure: z.boolean(), sameViewOrSide: z.boolean(), sameFindingLocation: z.boolean(), noNewClinicalInformation: z.boolean() }),
  semanticFidelity: z.boolean(),
  styleFidelity: z.boolean(),
  hallucinations: z.array(z.string()),
  depictedElements: z.array(z.string()),
  selfReject: z.object({
    anatomyDiffers: z.boolean(),
    pathologyMoved: z.boolean(),
    lateralityOrProjectionChanged: z.boolean(),
    structureInvented: z.boolean(),
    genericCardiologyPicture: z.boolean(),
    decorationDominates: z.boolean(),
    differentClinicalConcept: z.boolean(),
    stockAdvertisingLook: z.boolean(),
    outsideVisualSystem: z.boolean(),
  }),
  notes: z.string(),
});

/** Extracts the first JSON object from a model answer. */
export function parseModelJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Модель не вернула JSON");
  return JSON.parse(text.slice(start, end + 1));
}

function articleBlock(input: RecraftInput): string {
  const { article } = input;
  return [
    `Caption: ${article.caption ?? "—"}`,
    `Title: ${article.title}`,
    `Clinical subject: ${article.clinicalSubject ?? "—"}`,
    `Clinical job: ${article.clinicalJob ?? "—"}`,
    `Excerpt: ${article.excerpt ?? "—"}`,
    `Content Passport: ${article.contentPassport ?? "—"}`,
  ].join("\n");
}

type ContentBlock = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function anthropicVision(apiKey: string, model: string): RecraftVision {
  async function ask(content: ContentBlock[]): Promise<unknown> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 2000, system: RECRAFT_SYSTEM_PROMPT, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`Модель анализа изображений ответила ${response.status}`);
    const payload = await response.json() as { content?: Array<{ type: string; text?: string }> };
    return parseModelJson(payload.content?.filter(block => block.type === "text").map(block => block.text ?? "").join("\n") ?? "");
  }
  const image = (value: { mimeType: string; base64: string }): ContentBlock => ({ type: "image", source: { type: "base64", media_type: value.mimeType, data: value.base64 } });

  return {
    model,
    async mapContent(input) {
      return mappingSchema.parse(await ask([image(input.source), { type: "text", text: `${MAPPING_PROMPT}\n\n${articleBlock(input)}` }]));
    },
    async analyzeSource(input) {
      return passportSchema.parse(await ask([image(input.source), { type: "text", text: `${PASSPORT_PROMPT}\n\n${articleBlock(input)}` }]));
    },
    async critique(input, candidate, lock) {
      return criticSchema.parse(await ask([image(input.source), image(candidate), { type: "text", text: `${CRITIC_PROMPT}\n\nSemantic lock:\n${lock}` }]));
    },
  };
}

function openAiImageEdit(apiKey: string, model: string): RecraftImageModel {
  return {
    model,
    async redraw(source, prompt, count) {
      const form = new FormData();
      form.set("model", model);
      form.set("prompt", `${RECRAFT_SYSTEM_PROMPT}\n\n${prompt}`);
      form.set("n", String(count));
      form.set("size", "1536x1024");
      form.set("input_fidelity", "high");
      form.set("image", new Blob([Buffer.from(source.base64, "base64")], { type: source.mimeType }), "source");
      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) throw new Error(`Модель перерисовки ответила ${response.status}`);
      const payload = await response.json() as { data?: Array<{ b64_json?: string }> };
      return (payload.data ?? []).filter(item => item.b64_json).map(item => ({ mimeType: "image/png", base64: item.b64_json as string }));
    },
  };
}

export function recraftProviders(env: NodeJS.ProcessEnv = process.env): RecraftProviders {
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  const openAiKey = env.OPENAI_API_KEY?.trim();
  return {
    vision: anthropicKey ? anthropicVision(anthropicKey, env.RECRAFT_VISION_MODEL?.trim() || "claude-sonnet-4-5") : null,
    image: openAiKey ? openAiImageEdit(openAiKey, env.RECRAFT_IMAGE_MODEL?.trim() || "gpt-image-1") : null,
  };
}

export interface RecraftAvailability { vision: boolean; image: boolean; visionModel: string | null; imageModel: string | null }

export function recraftAvailability(env: NodeJS.ProcessEnv = process.env): RecraftAvailability {
  const providers = recraftProviders(env);
  return { vision: Boolean(providers.vision), image: Boolean(providers.image), visionModel: providers.vision?.model ?? null, imageModel: providers.image?.model ?? null };
}
