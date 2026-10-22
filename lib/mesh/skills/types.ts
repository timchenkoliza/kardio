import { z } from "zod";
import type { SpecialtyId } from "@/lib/domain/types";
import type { PortalJob } from "@/lib/portal/jobs";
import type { CapabilityId } from "../capabilities";
import type { SafetyRuleId } from "../domain-graph";
import type { ClaimKind } from "../evidence";
import type { EvidenceRequirement, JobType } from "../jobs";
import type { ModuleFamily } from "../manifest";
import type { SourceId } from "../sources";

/**
 * Execution contracts for repeated physician jobs.
 *
 *   IntentSkill  a versioned contract for one repeatable job: when it applies,
 *                what context it needs, what evidence it must gather, which
 *                Flow runs it, how the result is represented and how it is
 *                evaluated. Not a prompt, not a regex, not a persona, not a
 *                template.
 *   IntentFlow   a versioned, inspectable DAG of steps with evidence-dependent
 *                branches. The DAG is stable; the evidence path varies.
 *
 * Both are internal. A physician never sees a Skill id or a step list unless
 * the work is large enough to deserve an explicit plan.
 */

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

/** A deterministic signal: a phrase pattern over the normalized question, with a weight. */
export interface SignalRule {
  id: string;
  /** Unicode-aware regular expression source, matched against the normalized (lowercase, ё→е) text. */
  pattern: string;
  weight: number;
  /** Physician-language reason shown in traces (never the matched text). */
  reason: string;
}

export interface IntentMatchRules {
  /** Portal families the Skill can serve (from the router). */
  families: readonly PortalJob[];
  /** Fine-grained job types it can serve. */
  jobs?: readonly JobType[];
  /** Entities that must be present. */
  requires: { drug?: boolean; nosology?: boolean; population?: string };
  /** Phrase signals that raise confidence (semantic layer, deterministic). */
  signals: readonly SignalRule[];
  /** Phrase signals that rule the Skill out. */
  excludes?: readonly SignalRule[];
  /** Minimum confidence for the Skill to take the request. */
  threshold: number;
}

export type ContextRequirement = "drug" | "nosology" | "subtype" | "population" | "specialty";

export interface ClarificationPolicy {
  /** Ask when a required context item is missing and cannot be resolved from the session. */
  askWhenMissing: readonly ContextRequirement[];
  /** Never ask more than this many turns (one, unless safety requires otherwise). */
  maxTurns: 1;
}

export interface SkillSourcePolicy {
  /** Sources this Skill prefers when the planner has a choice. */
  prefer?: readonly SourceId[];
  /** Sources it must not use. */
  exclude?: readonly SourceId[];
}

/** How the compiled experience is shaped for this job (bounded; deterministic renderers only). */
export interface SkillExperiencePolicy {
  /** Module families in policy order. */
  modules: readonly ModuleFamily[];
  /** Key-takeaway claim priority, per family (kind, cap). Falls back to the compiler default when absent. */
  takeaway?: Partial<Record<PortalJob, ReadonlyArray<readonly [ClaimKind, number]>>>;
  /** Physician-language line describing what is being done («Сравниваем текущую и предыдущую версии рекомендаций»). */
  explanation: string;
}

export interface EvaluationCase {
  text: string;
  specialty: SpecialtyId;
  /** The Skill must match (or must not, when false). */
  expectMatch: boolean;
  /** Module families the result must contain when evidence is available. */
  expectModules?: readonly ModuleFamily[];
}

export interface EvaluationContract {
  /** Golden intents: matching precision and behaviour. */
  cases: readonly EvaluationCase[];
  /** The Skill must never be worse than the generic path on these (lost modules, lost sources, unsupported claims). */
  noRegressionAgainst: "generic";
  /** Hard limits. */
  maxUnsupportedClaims: 0;
}

export type SkillMode = "shadow" | "primary";

export interface SkillRollout {
  /** shadow: the generic path answers and the Skill runs alongside for comparison; primary: the Skill answers. */
  mode: SkillMode;
  /** Control Plane Change that approved the current mode (null while in shadow). */
  change: string | null;
}

export interface IntentSkill {
  id: string;
  version: string;
  domain: { specialties?: readonly SpecialtyId[]; nosologies?: readonly string[]; subtypes?: readonly string[] };
  matches: IntentMatchRules;
  requiredContext: readonly ContextRequirement[];
  optionalContext: readonly ContextRequirement[];
  clarificationPolicy: ClarificationPolicy;
  /** Evidence the Skill must gather (added to what the compiled intent already requires). */
  evidenceNeeds: readonly EvidenceRequirement[];
  optionalEvidence?: readonly EvidenceRequirement[];
  /** Job type the Skill executes as (the manifest and graph agree on it). */
  executesAs?: JobType;
  preferredCapabilities: readonly CapabilityId[];
  sourcePolicy: SkillSourcePolicy;
  flowId: string;
  experiencePolicy: SkillExperiencePolicy;
  evaluationContract: EvaluationContract;
  safety?: readonly SafetyRuleId[];
  rollout: SkillRollout;
}

/* ------------------------------------------------------------------ */
/* Flows                                                               */
/* ------------------------------------------------------------------ */

export type FlowStepKind = "resolve" | "retrieve" | "derive" | "branch" | "validate" | "compile";

/** Deterministic conditions a branch can test (evaluated by the flow runtime over the evidence). */
export type FlowCondition =
  | "official_ru_guideline_available"
  | "previous_version_found"
  | "russian_instruction_found"
  | "pediatric_section_found"
  | "guideline_found";

export interface FlowStep {
  id: string;
  kind: FlowStepKind;
  /** Physician-language label (used in the trace and in an explicit plan). */
  label: string;
  /** Evidence requirements a retrieve step is satisfied by. */
  requirements?: readonly EvidenceRequirement[];
  /** Named deterministic operation of a derive step. */
  operation?: string;
  /** Branch: the condition and the step ids taken when it holds / does not hold. */
  branch?: { when: FlowCondition; then: readonly string[]; otherwise: readonly string[] };
}

export interface FlowDependency {
  from: string;
  to: string;
}

export interface FlowInput {
  name: ContextRequirement | "question";
  required: boolean;
}

export interface StopCondition {
  /** e.g. «budget_exhausted», «no_topic». */
  id: string;
  description: string;
}

export interface FlowFallbackPolicy {
  /** What happens when the flow cannot complete: always the generic Intent → Evidence → Experience path. */
  onFailure: "generic_path";
  /** Safety policies that fail closed instead (none for the representative flows). */
  failClosed: readonly SafetyRuleId[];
}

export interface FlowOutputContract {
  /** Modules the flow must produce when their evidence exists. */
  modules: readonly ModuleFamily[];
  /** Every shown claim resolves to a document in the graph (validated by the policy gates). */
  traceable: true;
}

export interface IntentFlow {
  id: string;
  version: string;
  inputs: readonly FlowInput[];
  steps: readonly FlowStep[];
  dependencies: readonly FlowDependency[];
  stopConditions: readonly StopCondition[];
  fallbackPolicy: FlowFallbackPolicy;
  outputContract: FlowOutputContract;
}

/* ------------------------------------------------------------------ */
/* Routing result                                                      */
/* ------------------------------------------------------------------ */

export type ExecutionClass = "skill" | "dynamic" | "clarify";

export interface SkillMatch {
  skillId: string;
  version: string;
  confidence: number;
  reasons: string[];
}

export interface ExecutionStrategy {
  executionClass: ExecutionClass;
  matched: SkillMatch | null;
  alternatives: SkillMatch[];
  /** Physician-language explanation of what will be done (never a Skill id). */
  explanation: string | null;
}

/* ------------------------------------------------------------------ */
/* Clarification                                                       */
/* ------------------------------------------------------------------ */

export const clarificationOptionSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  /** What choosing it changes: a job, a focus, a resolved entity, or text to complete. */
  effect: z.object({
    job: z.enum(["answer", "drug", "guidelines", "research", "events", "learning", "updates", "materials"]).optional(),
    focus: z.array(z.string()).max(4).optional(),
    entity: z.string().max(80).optional(),
    completeText: z.string().max(200).optional(),
    /** Put the text into the input for the physician to finish instead of running it. */
    edit: z.boolean().optional(),
    /** Internal: the execution the option selects when two Skills disagree (never shown). */
    prefer: z.string().max(80).optional(),
  }),
});

export const clarificationManifestSchema = z.object({
  schema: z.literal("kardio.clarification/0.1"),
  id: z.string().min(1).max(80),
  question: z.string().min(1).max(120),
  /** Empty when only free text can answer («О каком препарате речь?»). */
  options: z.array(clarificationOptionSchema).max(6),
  allowFreeText: z.literal(true),
  reason: z.enum(["facet_changes_execution", "entity_unresolved", "skills_disagree"]),
  /** The original intent, preserved for the answer. */
  original: z.object({ text: z.string().max(1200), specialty: z.string() }),
});

export type ClarificationManifest = z.infer<typeof clarificationManifestSchema>;
export type ClarificationOption = z.infer<typeof clarificationOptionSchema>;

/** The physician's answer: an option, or free text in the same input (optionId null). One turn: an answered request is never asked again. */
export interface ClarificationAnswer {
  id: string;
  optionId: string | null;
}

export const clarificationAnswerSchema = z.object({ id: z.string().min(1).max(80), optionId: z.string().min(1).max(40).nullable() });

/* ------------------------------------------------------------------ */
/* Explicit plan (large open-ended work only)                          */
/* ------------------------------------------------------------------ */

export const planPreviewSchema = z.object({
  schema: z.literal("kardio.plan-preview/0.1"),
  id: z.string().min(1).max(80),
  title: z.string().max(80),
  steps: z.array(z.string().min(1).max(120)).min(2).max(8),
  reason: z.enum(["large_open_ended", "multi_entity_comparison"]),
  original: z.object({ text: z.string().max(1200), specialty: z.string() }),
});

export type PlanPreview = z.infer<typeof planPreviewSchema>;

/* ------------------------------------------------------------------ */
/* Skill learning (never self-modifying)                               */
/* ------------------------------------------------------------------ */

export const skillCandidateSchema = z.object({
  schema: z.literal("kardio.skill-candidate/0.1"),
  id: z.string(),
  /** Signature of the repeated novel intent: job type, nosology and phrase features — never raw text. */
  signature: z.string(),
  observedIntents: z.object({ count: z.number().int(), sessions: z.number().int(), features: z.array(z.string()), jobType: z.string(), nosology: z.string().nullable() }),
  proposedMatchRules: z.object({ families: z.array(z.string()), signals: z.array(z.string()), requires: z.record(z.string(), z.boolean()) }),
  proposedFlow: z.string(),
  expectedBenefit: z.string(),
  evaluationSet: z.array(z.string()),
  status: z.enum(["candidate", "in_evaluation", "approved", "rejected"]),
  createdAt: z.string(),
});

export type SkillCandidate = z.infer<typeof skillCandidateSchema>;
