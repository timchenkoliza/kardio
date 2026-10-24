import type { AgentId } from "@/lib/agents/types";
import type { PortalJob } from "@/lib/portal/jobs";
import { JOB_DEFINITIONS, type JobType } from "./jobs";
import type { SourceDomain } from "./sources";

/**
 * CAPABILITY — what the system knows how to do.
 *
 * A capability serves jobs and draws on source domains. It is implemented
 * either by the source mesh (intent → plan → sources → evidence graph) or by
 * an existing executor. Capabilities are not agents and never appear in the
 * interface. `host` is only the persistence partition of runs and results
 * (the legacy agent id), so stored history and «Для вас» keep working.
 *
 * A separate implementation exists only where tools, reasoning, instructions
 * or safety policy genuinely differ — not one per specialty or disease.
 */

export type CapabilityId = "evidence_answer" | "evidence_review" | "event_search" | "learning_path" | "updates_monitor" | "materials_search";

export interface CapabilityDefinition {
  id: CapabilityId;
  /** Internal description for audits; never shown to physicians. */
  description: string;
  jobs: JobType[];
  implementation: { kind: "mesh" } | { kind: "executor"; executor: AgentId };
  host: AgentId;
  sourceDomains: SourceDomain[];
  /** Why this is a separate capability (tools, reasoning, instructions or safety differ). */
  distinctBecause: string;
}

export const CAPABILITIES: Record<CapabilityId, CapabilityDefinition> = {
  evidence_answer: {
    id: "evidence_answer",
    description: "Answers from sources: plans the source set for the intent, normalizes evidence into a graph and compiles the experience",
    jobs: ["reference_answer", "drug_reference", "drug_comparison", "source_positions", "inn_lookup", "disease_reference", "guideline_check", "guideline_discovery", "professional_article_search"],
    implementation: { kind: "mesh" },
    host: "reference",
    sourceDomains: ["drug", "inn", "disease", "guideline", "research", "article", "regulatory"],
    distinctBecause: "verbatim evidence only, source planning per requirement, conflict preservation",
  },
  evidence_review: {
    id: "evidence_review",
    description: "Structured literature review with comparison and export",
    jobs: ["evidence_review"],
    implementation: { kind: "executor", executor: "research" },
    host: "research",
    sourceDomains: ["research"],
    distinctBecause: "multi-step review workflow with structured study extraction and export",
  },
  event_search: {
    id: "event_search",
    description: "Finite, dated professional events with confirmation-gated actions",
    jobs: ["event_search"],
    implementation: { kind: "executor", executor: "events" },
    host: "events",
    sourceDomains: ["event"],
    distinctBecause: "external actions (calendar, registration) under ActionConfirmationService",
  },
  learning_path: {
    id: "learning_path",
    description: "Next learning step from real behaviour signals",
    jobs: ["learning_next_step"],
    implementation: { kind: "executor", executor: "learning" },
    host: "learning",
    sourceDomains: ["learning", "research", "guideline"],
    distinctBecause: "reads the physician's own history; never invents behaviour",
  },
  updates_monitor: {
    id: "updates_monitor",
    description: "Since-last-visit monitoring",
    jobs: ["updates_digest"],
    implementation: { kind: "executor", executor: "whats_new" },
    host: "whats_new",
    sourceDomains: ["research", "guideline", "regulatory"],
    distinctBecause: "scheduled catch-up with since-last-visit semantics",
  },
  materials_search: {
    id: "materials_search",
    description: "Search over the physician's own saved materials",
    jobs: ["materials_search"],
    implementation: { kind: "executor", executor: "materials" },
    host: "materials",
    sourceDomains: ["user_material"],
    distinctBecause: "user-owned content; different privacy boundary",
  },
};

export function capabilityForJob(job: JobType): CapabilityDefinition {
  const found = Object.values(CAPABILITIES).find(capability => capability.jobs.includes(job));
  if (!found) throw new Error(`No capability serves job ${job}`);
  return found;
}

/** Persistence host for a result family: the capability that serves its jobs. */
export function hostForFamily(family: PortalJob): AgentId {
  const job = (Object.values(JOB_DEFINITIONS).find(definition => definition.family === family) ?? JOB_DEFINITIONS.reference_answer).id;
  return capabilityForJob(job).host;
}
