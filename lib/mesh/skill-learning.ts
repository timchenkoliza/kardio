import { DEFAULT_JOB_FOR_FAMILY, JOB_DEFINITIONS, isJobType } from "./jobs";
import { skillCandidateSchema, type SkillCandidate } from "./skills/types";

/**
 * Skill learning — never self-modification.
 *
 *   repeated novel intent (dynamic_plan_used, by text-free signature)
 *     → SkillCandidate → Control Plane Change (PROPOSED, release BLOCK)
 *     → evaluation set curated by an editor → differential evaluation
 *     → human approval → a NEW versioned Skill in code
 *
 * Nothing here edits the Skills library. A candidate carries only the request
 * shape (job, nosology, entity kinds) — never the physician's text.
 */

export const CANDIDATE_MIN_COUNT = 3;
export const CANDIDATE_MIN_SESSIONS = 2;
export const CANDIDATE_WINDOW_MS = 14 * 24 * 3_600_000;

export interface DynamicPlanObservation {
  signature: string;
  sessionId: string | null;
  at: string;
}

function candidateId(signature: string): string {
  let hash = 2166136261;
  for (const char of signature) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return `skill-candidate-${hash.toString(36)}`;
}

/** Signature: specialty|job|nosology|subtype|drug|populations (see requestSignature). */
export function parseSignature(signature: string): { specialty: string; job: string; nosology: string | null; subtype: string | null; drug: boolean; populations: string[] } | null {
  const parts = signature.split("|");
  if (parts.length !== 6) return null;
  const [specialty, job, nosology, subtype, drug, populations] = parts;
  return { specialty, job, nosology: nosology === "-" ? null : nosology, subtype: subtype === "-" ? null : subtype, drug: drug === "drug", populations: populations === "-" ? [] : populations.split("+") };
}

/** Repeated dynamic requests of one shape, by enough sessions, become candidates (once per signature). */
export function proposeSkillCandidates(observations: readonly DynamicPlanObservation[], args: { now: Date; existing?: ReadonlySet<string> }): SkillCandidate[] {
  const since = args.now.getTime() - CANDIDATE_WINDOW_MS;
  const groups = new Map<string, DynamicPlanObservation[]>();
  for (const item of observations) {
    if (Date.parse(item.at) < since) continue;
    groups.set(item.signature, [...(groups.get(item.signature) ?? []), item]);
  }
  const candidates: SkillCandidate[] = [];
  for (const [signature, items] of groups) {
    const sessions = new Set(items.map(item => item.sessionId ?? "anonymous")).size;
    const shape = parseSignature(signature);
    const id = candidateId(signature);
    if (!shape || items.length < CANDIDATE_MIN_COUNT || sessions < CANDIDATE_MIN_SESSIONS || args.existing?.has(id)) continue;
    // Requests without a recognised topic or drug are too vague to become a repeatable job.
    if (!shape.nosology && !shape.drug) continue;
    const family = isJobType(shape.job) ? JOB_DEFINITIONS[shape.job].family : "answer";
    candidates.push(skillCandidateSchema.parse({
      schema: "kardio.skill-candidate/0.1",
      id,
      signature,
      observedIntents: { count: items.length, sessions, features: [shape.drug ? "drug" : null, shape.nosology ? "nosology" : null, shape.subtype ? "subtype" : null, ...shape.populations.map(item => `population:${item}`)].filter((item): item is string => Boolean(item)), jobType: shape.job, nosology: shape.nosology },
      proposedMatchRules: { families: [family], signals: [], requires: { drug: shape.drug, nosology: Boolean(shape.nosology), ...(shape.populations.length ? { population: true } : {}) } },
      proposedFlow: `${isJobType(shape.job) ? shape.job : DEFAULT_JOB_FOR_FAMILY[family]}.flow (to be designed)`,
      expectedBenefit: `a repeated ${shape.job} request${shape.nosology ? ` about ${shape.nosology}` : ""} would run a fixed, evaluated evidence path instead of a fresh dynamic plan`,
      // Raw questions are never stored: an editor curates the evaluation set before any evaluation.
      evaluationSet: [],
      status: "candidate",
      createdAt: args.now.toISOString(),
    }));
  }
  return candidates;
}
