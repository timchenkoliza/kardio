import type { SpecialtyId } from "@/lib/domain/types";
import { normalizeQuery } from "@/lib/portal/lexicon";
import type { NormalizedIntent } from "../intent";
import { JOB_DEFINITIONS } from "../jobs";
import { SKILL_LIBRARY } from "./registry";
import type { ContextRequirement, IntentSkill, SignalRule, SkillMatch } from "./types";

/**
 * Layered Skill matching — never a single regex:
 *
 *   1. domain graph     the Skill's specialty and nosology scope
 *   2. job family       the router's family must be one the Skill serves
 *   3. entities         required drug / nosology / population are present
 *   4. signals          weighted phrase evidence of the job (and exclusions)
 *   5. confidence       entity layer + signal layer, compared with the Skill's threshold
 *
 * Returns the best match with its reasons and the runner-up alternatives.
 * A Skill whose job is clearly asked for but whose required context is
 * missing is reported separately: the strategy decides whether to resolve it
 * from the session or ask one question.
 */

/** Confidence the entity/domain layer contributes when every required entity is present. */
const ENTITY_LAYER = 0.35;
/** Signal strength that counts as «this job is clearly asked for» even with context missing. */
const CLEAR_JOB_SIGNAL = 0.4;

const compiled = new Map<string, RegExp>();
function pattern(source: string): RegExp {
  let value = compiled.get(source);
  if (!value) { value = new RegExp(source, "u"); compiled.set(source, value); }
  return value;
}

function hits(text: string, rules: readonly SignalRule[] | undefined): SignalRule[] {
  return (rules ?? []).filter(rule => pattern(rule.pattern).test(text));
}

function missingContext(skill: IntentSkill, intent: NormalizedIntent): ContextRequirement[] {
  const missing: ContextRequirement[] = [];
  const { requires } = skill.matches;
  if (requires.drug && !intent.entities.drugs.length) missing.push("drug");
  if (requires.nosology && !intent.context.nosology) missing.push("nosology");
  if (requires.population && !intent.context.populations.includes(requires.population)) missing.push("population");
  return missing;
}

export interface SkillEvaluation {
  skill: IntentSkill;
  /** Every layer passed and confidence ≥ threshold. */
  matched: boolean;
  confidence: number;
  /** Sum of signal weights (the semantic layer alone). */
  signal: number;
  reasons: string[];
  /** Required context the request does not carry (empty when matched). */
  missing: ContextRequirement[];
  /** Why the Skill was ruled out (internal; never shown). */
  rejected: string | null;
}

export function evaluateSkill(skill: IntentSkill, intent: NormalizedIntent, text: string, specialty: SpecialtyId): SkillEvaluation {
  const value = normalizeQuery(text);
  const base = { skill, matched: false, confidence: 0, signal: 0, reasons: [] as string[], missing: [] as ContextRequirement[], rejected: null as string | null };
  // 1. Domain graph: the physician's own specialty, the Skill's nosologies.
  if (skill.domain.specialties && !skill.domain.specialties.includes(specialty)) return { ...base, rejected: "specialty" };
  if (skill.domain.nosologies && intent.context.nosology && !skill.domain.nosologies.includes(intent.context.nosology.id)) return { ...base, rejected: "nosology" };
  // 2. Job family (an explicitly chosen job is the physician's decision and is never overridden).
  if (!skill.matches.families.includes(intent.job.family)) return { ...base, rejected: "family" };
  if (skill.matches.jobs && !skill.matches.jobs.includes(intent.job.primary)) return { ...base, rejected: "job" };
  if (intent.job.explicit && skill.executesAs && JOB_DEFINITIONS[skill.executesAs].family !== intent.job.family) return { ...base, rejected: "explicit_job" };
  // 4. Signals and exclusions.
  const excluded = hits(value, skill.matches.excludes);
  if (excluded.length) return { ...base, rejected: `excluded:${excluded[0].id}` };
  const signals = hits(value, skill.matches.signals);
  const signal = Math.round(signals.reduce((sum, rule) => sum + rule.weight, 0) * 100) / 100;
  const reasons = signals.map(rule => rule.reason);
  // 3. Entities.
  const missing = missingContext(skill, intent);
  if (missing.length) return { ...base, signal, reasons, missing, rejected: `missing:${missing.join(",")}` };
  const entityReasons = [
    intent.context.nosology ? `тема: ${intent.context.nosology.label.toLocaleLowerCase("ru-RU")}` : null,
    intent.entities.drugs.length ? `препарат: ${intent.entities.drugs.map(drug => drug.ru).join(", ")}` : null,
    skill.matches.requires.population ? "применение у детей" : null,
  ].filter((item): item is string => Boolean(item));
  // 5. Confidence.
  const confidence = Math.min(1, Math.round((ENTITY_LAYER + signal) * 100) / 100);
  return { ...base, confidence, signal, reasons: [...entityReasons, ...reasons], missing, matched: confidence >= skill.matches.threshold, rejected: confidence >= skill.matches.threshold ? null : "below_threshold" };
}

export interface SkillMatchResult {
  matched: SkillMatch | null;
  alternatives: SkillMatch[];
  /** A Skill whose job is clearly asked for, with required context missing (resolve from the session or ask). */
  incomplete: { skill: IntentSkill; missing: ContextRequirement[]; signal: number } | null;
  evaluations: SkillEvaluation[];
}

const toMatch = (evaluation: SkillEvaluation): SkillMatch => ({ skillId: evaluation.skill.id, version: evaluation.skill.version, confidence: evaluation.confidence, reasons: evaluation.reasons });

export function matchSkill(intent: NormalizedIntent, text: string, specialty: SpecialtyId, library: readonly IntentSkill[] = SKILL_LIBRARY): SkillMatchResult {
  const evaluations = library.map(skill => evaluateSkill(skill, intent, text, specialty));
  const matched = evaluations.filter(item => item.matched).sort((a, b) => b.confidence - a.confidence || a.skill.id.localeCompare(b.skill.id));
  const incomplete = evaluations
    .filter(item => item.missing.length && item.signal >= CLEAR_JOB_SIGNAL && item.missing.every(missing => item.skill.clarificationPolicy.askWhenMissing.includes(missing)))
    .sort((a, b) => b.signal - a.signal)[0];
  return {
    matched: matched[0] ? toMatch(matched[0]) : null,
    alternatives: matched.slice(1).map(toMatch),
    incomplete: !matched.length && incomplete ? { skill: incomplete.skill, missing: incomplete.missing, signal: incomplete.signal } : null,
    evaluations,
  };
}

/** Do two Skills execute the same way (same job and evidence)? Then the choice is made silently. */
export function sameExecution(a: IntentSkill, b: IntentSkill): boolean {
  const key = (skill: IntentSkill) => [skill.executesAs ?? "-", ...[...skill.evidenceNeeds].sort()].join("|");
  return key(a) === key(b);
}
