import "server-only";
import { createHash } from "node:crypto";
import type { RecraftCandidate, RecraftInput, RecraftResult } from "@/lib/recraft/contract";
import { buildRedrawPrompt, checkMapping, criticVerdict, decideMatch, passportStops, sourceClassOf, strategyFor } from "@/lib/recraft/gates";
import type { RecraftProviders } from "./providers";

/**
 * Clinical Visual Recraft pipeline at the image ↔ article matching stage:
 * content mapping → match gate → source passport (semantic lock) → strategy →
 * design-system translation → 3 candidates → source-vs-output critic → one
 * regeneration round → final derivative or an explicit stop. Nothing is
 * returned as final unless the critic passed it.
 */

export const CANDIDATES_PER_ROUND = 3;
export const MAX_ROUNDS = 2;

function base(input: RecraftInput, providers: RecraftProviders, now: Date): RecraftResult {
  return {
    status: "failed",
    reason: "",
    input: { sourceId: input.source.id, contentId: input.article.contentId, usage: input.target.usage },
    mapping: null,
    match: null,
    productionRule: null,
    passport: null,
    sourceClass: null,
    strategy: null,
    promptDigest: null,
    candidates: [],
    final: null,
    label: null,
    models: { vision: providers.vision?.model ?? null, image: providers.image?.model ?? null },
    createdAt: now.toISOString(),
  };
}

export async function runRecraft(input: RecraftInput, providers: RecraftProviders, now = new Date()): Promise<RecraftResult> {
  const result = base(input, providers, now);
  if (input.target.specialty !== "cardiology") return { ...result, status: "unavailable", reason: "Перерисовка настроена только для кардиологии" };
  if (!providers.vision) return { ...result, status: "unavailable", reason: "Модель анализа изображений не подключена" };

  try {
    // 0. Content mapping and match gate.
    const stage = await providers.vision.mapContent(input);
    const checked = checkMapping(stage.mapping, input.article);
    result.mapping = checked.mapping;
    result.match = stage.match;
    if (checked.mapping.bindingType === "prompt_conflict") {
      return { ...result, status: "needs_source_verification", productionRule: "do_not_use", reason: checked.violations.join("; ") };
    }
    if (checked.blocking) return { ...result, status: "needs_source_verification", reason: checked.violations.join("; ") };
    const decision = decideMatch(stage.match.grade, input.target.usage, stage.match.reason);
    result.productionRule = decision.rule;
    if (!decision.generate) return { ...result, status: decision.status ?? "do_not_use", reason: decision.reason };

    // 1–2. Source visual passport = semantic lock.
    const passport = await providers.vision.analyzeSource(input);
    result.passport = passport;
    const stop = passportStops(passport);
    if (stop) return { ...result, status: stop.status, reason: stop.reason };

    // 3–4. Strategy and design-system translation.
    const sourceClass = sourceClassOf(passport.sourceType);
    const strategy = strategyFor(passport);
    const prompt = buildRedrawPrompt(passport, checked.mapping, strategy, sourceClass);
    result.sourceClass = sourceClass;
    result.strategy = strategy;
    result.promptDigest = createHash("sha256").update(prompt).digest("hex").slice(0, 16);
    if (!providers.image) return { ...result, status: "unavailable", reason: "Смысловая фиксация готова; модель перерисовки не подключена" };

    // 5–6. Candidates, critic, one regeneration round.
    let feedback = "";
    for (let round = 1; round <= MAX_ROUNDS; round += 1) {
      const images = await providers.image.redraw(input.source, feedback ? `${prompt}\nPrevious candidates were rejected for: ${feedback}. Fix exactly these problems.` : prompt, CANDIDATES_PER_ROUND);
      const roundCandidates: RecraftCandidate[] = [];
      for (const [index, image] of images.entries()) {
        const critic = await providers.vision.critique(input, image, prompt);
        const verdict = criticVerdict(critic, checked.mapping);
        roundCandidates.push({ index: result.candidates.length + index, round, mimeType: image.mimeType, base64: image.base64, critic, verdict });
      }
      result.candidates.push(...roundCandidates);
      const passed = roundCandidates.find(candidate => candidate.verdict.pass);
      if (passed) {
        const credit = input.source.credit ? ` · оригинал: ${input.source.credit}` : "";
        return {
          ...result,
          status: "completed",
          reason: round === 1 ? "Кандидат прошёл сверку с источником" : "Кандидат прошёл сверку с источником после повторной генерации",
          final: { mimeType: passed.mimeType, base64: passed.base64, candidateIndex: passed.index },
          label: `${decision.label ? `${decision.label}. ` : ""}Перерисовано по исходному изображению${credit}`,
        };
      }
      feedback = [...new Set(roundCandidates.flatMap(candidate => candidate.verdict.failures))].join("; ");
    }
    return { ...result, status: "rejected_by_critic", reason: `Ни один кандидат не прошёл сверку с источником: ${feedback}` };
  } catch (error) {
    return { ...result, status: "failed", reason: error instanceof Error ? error.message : "Перерисовка не выполнена" };
  }
}
