import type { SpecialtyId } from "@/lib/domain/types";
import type { PortalJob } from "@/lib/portal/jobs";
import { missingContextClarification, optionOf, referenceClarification, skillsDisagreeClarification, suitabilityClarification } from "./clarification";
import { flowById } from "./flows/registry";
import { compileIntent, type NormalizedIntent } from "./intent";
import type { ModuleFamily } from "./manifest";
import { resolveReferences, type SessionContext, type SessionEntity } from "./session-context";
import { matchSkill, sameExecution } from "./skills/match";
import { SKILL_LIBRARY, skillById } from "./skills/registry";
import { planPreviewSchema, type ClarificationAnswer, type ClarificationManifest, type ExecutionStrategy, type IntentFlow, type IntentSkill, type PlanPreview, type SkillMode } from "./skills/types";

/**
 * Execution strategy:
 *
 *   UserIntent → IntentCompiler → known Skill?  → run its Flow (fast path)
 *                               → ambiguous?    → one ClarificationManifest
 *                               → novel?        → dynamic plan (SourcePlanner)
 *
 * Free-form planning is never used when a proven Skill exists. While a Skill
 * is in shadow, the generic path answers and the Skill runs alongside for
 * comparison; it answers only after its differential evaluation passed
 * (rollout mode «primary», approved by a Control Plane Change).
 */

/** Two matched Skills closer than this, executing differently, are a real ambiguity. */
const DISAGREEMENT_GAP = 0.1;
/** A topic from the session is used for a missing context only at this confidence. */
const SESSION_TOPIC_CONFIDENCE = 0.5;
/** Comparing this many drugs at once is large enough to show the plan first. */
const PLAN_PREVIEW_DRUGS = 3;
/** Jobs whose sources compare several drugs; learning, events, updates and materials never stop for a plan. */
const PLAN_PREVIEW_JOBS: ReadonlySet<PortalJob> = new Set(["answer", "drug", "guidelines", "research"]);

export interface StrategyInput {
  text: string;
  specialty: SpecialtyId;
  job?: PortalJob | null;
  session?: SessionContext | null;
  /** The physician already answered one clarification for this request (max one turn). */
  answered?: ClarificationAnswer | null;
  /** The physician confirmed the explicit plan. */
  planConfirmed?: string | null;
  library?: readonly IntentSkill[];
}

export interface Strategy extends ExecutionStrategy {
  /** Text the intent is compiled from: the physician's words plus entities resolved from the session or a clarification. */
  effectiveText: string;
  /** The generic compiled intent (what b5317b5 executes). */
  generic: NormalizedIntent;
  /** The intent to execute now: the Skill's when it is primary, the generic one otherwise. */
  intent: NormalizedIntent;
  /** The Skill's intent (executed in shadow while the Skill is not primary). */
  skillIntent: NormalizedIntent | null;
  skill: IntentSkill | null;
  flow: IntentFlow | null;
  mode: SkillMode | null;
  clarification: ClarificationManifest | null;
  planPreview: PlanPreview | null;
  /** Entities taken from the session or a clarification (ids only). */
  resolution: { entities: string[]; from: "session" | "clarification" } | null;
  /** Stable, text-free signature of the request shape (for SkillCandidate learning). */
  signature: string;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** Apply a Skill to a compiled intent: its job, its evidence, its experience order — never less evidence than the generic path. */
export function applySkill(generic: NormalizedIntent, skill: IntentSkill, text: string): NormalizedIntent {
  const base = skill.executesAs && skill.executesAs !== generic.job.primary ? compileIntent(text, generic.context.specialty, { jobType: skill.executesAs }) : generic;
  const requirements = unique([...base.requirements, ...generic.requirements, ...skill.evidenceNeeds]);
  const optional = unique([...base.optional, ...(skill.optionalEvidence ?? [])]).filter(item => !requirements.includes(item));
  const modules = unique<ModuleFamily>([...skill.experiencePolicy.modules, ...base.modules]);
  return {
    ...base,
    job: { ...base.job, reasons: [...base.job.reasons] },
    requirements,
    optional,
    safety: unique([...base.safety, ...(skill.safety ?? [])]),
    modules,
  };
}

export function requestSignature(intent: NormalizedIntent): string {
  return [intent.context.specialty, intent.job.primary, intent.context.nosology?.id ?? "-", intent.context.subtype?.id ?? "-", intent.entities.drugs.length ? "drug" : "-", intent.context.populations.join("+") || "-"].join("|");
}

function withEntities(text: string, entities: readonly SessionEntity[]): string {
  return entities.length ? `${text.trim()} (${entities.map(entity => entity.label).join(", ")})` : text;
}

function planPreviewFor(intent: NormalizedIntent, text: string): PlanPreview | null {
  if (intent.entities.drugs.length < PLAN_PREVIEW_DRUGS || !PLAN_PREVIEW_JOBS.has(intent.job.family)) return null;
  const [first, ...rest] = intent.entities.drugs.map(drug => drug.ru);
  const steps = [
    // A drug comparison reads the instruction of every drug (up to four, server/mesh/sources/medi.ts); any other
    // answer opens one instruction and names the rest for ГРЛС, never promising them.
    intent.job.primary === "drug_comparison" ? `Открою российские инструкции: ${[first, ...rest].join(", ")}`
      : [...intent.requirements, ...intent.optional].includes("russian_drug_reference") ? `Открою российскую инструкцию: ${first}${rest.length ? `; инструкции ${rest.join(", ")} — по ссылке на ГРЛС` : ""}` : null,
    // Only what the planned sources do: guidelines when the job asks for them, reviews when PubMed may answer.
    intent.requirements.some(item => /guideline/u.test(item)) ? (intent.context.nosology ? `Найду позицию каждого препарата в рекомендациях: ${intent.context.nosology.label.toLocaleLowerCase("ru-RU")}` : "Найду позицию препаратов в клинических рекомендациях") : null,
    [...intent.requirements, ...intent.optional].includes("current_research") ? "Подберу свежие сравнительные обзоры и метаанализы, если они включены в ваших источниках" : null,
    "Если источники расходятся — покажу где, с датами и ссылками",
  ].filter((step): step is string => Boolean(step));
  // A plan of one generic step says nothing the result will not: run directly.
  if (steps.length < 2) return null;
  return planPreviewSchema.parse({ schema: "kardio.plan-preview/0.1", id: `plan-${requestSignature(intent).replace(/[^a-z0-9|_-]/giu, "")}-${intent.entities.drugs.length}`.slice(0, 80), title: "Я проверю", steps, reason: "multi_entity_comparison", original: { text, specialty: intent.context.specialty } });
}

export function decideStrategy(input: StrategyInput): Strategy {
  const library = input.library ?? SKILL_LIBRARY;
  const answered = input.answered ?? null;
  let effectiveText = input.text;
  let resolution: Strategy["resolution"] = null;
  let generic = compileIntent(effectiveText, input.specialty, { job: input.job ?? null });

  const result = (args: Partial<Strategy> & Pick<Strategy, "executionClass">): Strategy => ({
    matched: null, alternatives: [], explanation: null, effectiveText, generic, intent: generic, skillIntent: null, skill: null, flow: null, mode: null, clarification: null, planPreview: null, resolution, signature: requestSignature(generic), ...args,
  });
  const clarify = (manifest: ClarificationManifest | null): Strategy | null => (manifest && !answered ? result({ executionClass: "clarify", clarification: manifest }) : null);

  // «этот препарат»: resolved from the session when one recent entity is clearly meant; otherwise one question.
  const references = resolveReferences(input.text, input.session ?? null, { drugs: generic.entities.drugs.length, nosology: Boolean(generic.context.nosology) });
  if (references.resolved.length) {
    effectiveText = withEntities(input.text, references.resolved);
    resolution = { entities: references.resolved.map(entity => entity.id), from: "session" };
    generic = compileIntent(effectiveText, input.specialty, { job: input.job ?? null });
  } else if (references.candidates.length) {
    const asked = clarify(referenceClarification(input.text, input.specialty, references.candidates));
    if (asked) return asked;
  } else if (references.refers.includes("drug")) {
    // «этот препарат» with nothing in the session to point at: ask, never guess.
    const asked = clarify(referenceClarification(input.text, input.specialty, []));
    if (asked) return asked;
  }

  const suitability = clarify(suitabilityClarification(effectiveText, generic));
  if (suitability) return suitability;

  // «Консилиум» is asked for explicitly: no Skill replaces it with another job, and it never stops for a plan.
  if (generic.job.primary === "source_positions") return result({ executionClass: "dynamic", planPreview: null, alternatives: [] });

  let match = matchSkill(generic, effectiveText, input.specialty, library);

  // A Skill's job is clearly asked for but its topic is missing: the session may name it; otherwise one question.
  if (!match.matched && match.incomplete) {
    const { skill, missing } = match.incomplete;
    const topic = missing.length === 1 && missing[0] === "nosology"
      ? input.session?.activeEntities.find(entity => entity.kind === "nosology" && entity.confidence >= SESSION_TOPIC_CONFIDENCE && (!skill.domain.nosologies || skill.domain.nosologies.includes(entity.id.replace(/^nosology:/u, ""))))
      : undefined;
    if (topic) {
      effectiveText = `${input.text.trim().replace(/[?？.!…]+$/u, "")}: ${topic.label.toLocaleLowerCase("ru-RU")}`;
      resolution = { entities: [...(resolution?.entities ?? []), topic.id], from: "session" };
      generic = compileIntent(effectiveText, input.specialty, { job: input.job ?? null });
      match = matchSkill(generic, effectiveText, input.specialty, library);
    } else {
      const asked = clarify(missingContextClarification(input.text, input.specialty, skill, missing));
      if (asked) return asked;
    }
  }

  const best = match.matched;
  if (best) {
    let chosen = library.find(skill => skill.id === best.skillId) ?? skillById(best.skillId)!;
    const rival = match.alternatives.find(item => best.confidence - item.confidence < DISAGREEMENT_GAP);
    const rivalSkill = rival ? library.find(skill => skill.id === rival.skillId) ?? null : null;
    if (rival && rivalSkill && !sameExecution(chosen, rivalSkill)) {
      const question = skillsDisagreeClarification(input.text, input.specialty, [{ match: best, skill: chosen }, { match: rival, skill: rivalSkill }]);
      const preferred = answered ? library.find(skill => skill.id === optionOf(question, answered.optionId)?.effect.prefer) : null;
      if (preferred) chosen = preferred;
      else {
        const asked = clarify(question);
        if (asked) return asked;
      }
    }
    const matched = chosen.id === best.skillId ? best : match.alternatives.find(item => item.skillId === chosen.id)!;
    const skillIntent = applySkill(generic, chosen, effectiveText);
    const primary = chosen.rollout.mode === "primary";
    return result({
      executionClass: "skill",
      matched,
      alternatives: [best, ...match.alternatives].filter(item => item.skillId !== chosen.id),
      explanation: chosen.experiencePolicy.explanation,
      intent: primary ? skillIntent : generic,
      skillIntent,
      skill: chosen,
      flow: flowById(chosen.flowId),
      mode: chosen.rollout.mode,
    });
  }

  const preview = input.planConfirmed ? null : planPreviewFor(generic, input.text);
  return result({ executionClass: "dynamic", planPreview: preview, alternatives: [] });
}
