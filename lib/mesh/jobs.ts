import type { PortalJob } from "@/lib/portal/jobs";

/**
 * JOB — what the physician is trying to accomplish.
 *
 * Four concepts are deliberately separate:
 *   JOB        what the physician wants done            (this file)
 *   CAPABILITY what the system knows how to do           (capabilities.ts)
 *   SOURCE     where evidence, data and actions come from (sources.ts)
 *   EXPERIENCE how the result is represented             (manifest.ts)
 *
 * A job never names an agent, a source, a model or a route. The physician
 * owns the intent; the system owns execution.
 */

export type JobType =
  | "reference_answer"
  | "drug_reference"
  | "drug_comparison"
  | "source_positions"
  | "inn_lookup"
  | "disease_reference"
  | "guideline_check"
  | "guideline_discovery"
  | "professional_article_search"
  | "evidence_review"
  | "event_search"
  | "learning_next_step"
  | "updates_digest"
  | "materials_search";

export const JOB_TYPES: readonly JobType[] = [
  "reference_answer", "drug_reference", "drug_comparison", "source_positions", "inn_lookup", "disease_reference", "guideline_check", "guideline_discovery",
  "professional_article_search", "evidence_review", "event_search", "learning_next_step", "updates_digest", "materials_search",
];

/**
 * What a result must be grounded in. The planner chooses sources per
 * requirement; a requirement is never «call source X».
 */
export type EvidenceRequirement =
  | "russian_drug_reference"
  | "drug_label"
  | "drug_safety_signal"
  | "product_listing"
  | "russian_guideline"
  | "official_guideline_status"
  | "official_drug_registration"
  | "international_guideline"
  | "specialty_society_guideline"
  | "current_research"
  | "professional_article"
  | "event_listing"
  | "learning_material"
  | "user_material";

export const EVIDENCE_REQUIREMENTS: readonly EvidenceRequirement[] = [
  "russian_drug_reference", "drug_label", "drug_safety_signal", "product_listing", "russian_guideline", "official_guideline_status",
  "official_drug_registration", "international_guideline", "specialty_society_guideline", "current_research", "professional_article",
  "event_listing", "learning_material", "user_material",
];

/** Physician-language name of a requirement (used for gaps and «what is missing»). */
export const REQUIREMENT_LABEL: Record<EvidenceRequirement, string> = {
  russian_drug_reference: "российская инструкция по применению",
  drug_label: "инструкция регулятора",
  drug_safety_signal: "сигналы безопасности препарата",
  product_listing: "препараты с этим действующим веществом",
  russian_guideline: "российские клинические рекомендации",
  official_guideline_status: "официальный статус рекомендаций в России",
  official_drug_registration: "официальная регистрация препарата в России",
  international_guideline: "международные рекомендации",
  specialty_society_guideline: "рекомендации профессионального общества",
  current_research: "свежие обзоры и метаанализы",
  professional_article: "профессиональные статьи на русском",
  event_listing: "афиша профессиональных событий",
  learning_material: "учебные материалы",
  user_material: "ваши материалы",
};

export interface JobDefinition {
  id: JobType;
  /** Physician-facing result family (the existing portal vocabulary). */
  family: PortalJob;
  /** Evidence the result cannot be honest without. */
  requirements: EvidenceRequirement[];
  /** Evidence that improves the result when cheap and relevant. */
  optional: EvidenceRequirement[];
}

export const JOB_DEFINITIONS: Record<JobType, JobDefinition> = {
  reference_answer: { id: "reference_answer", family: "answer", requirements: ["current_research"], optional: ["russian_guideline", "russian_drug_reference", "drug_label", "drug_safety_signal"] },
  drug_reference: { id: "drug_reference", family: "drug", requirements: ["russian_drug_reference"], optional: ["drug_label", "drug_safety_signal", "official_drug_registration", "current_research"] },
  // Two to four drugs side by side: the instruction of each, the same sections in the same order.
  drug_comparison: { id: "drug_comparison", family: "drug", requirements: ["russian_drug_reference"], optional: ["drug_label", "drug_safety_signal", "official_drug_registration", "current_research"] },
  // «Консилиум»: the position of each kind of source on one question, side by side — Russian and international
  // guidelines, systematic reviews, the instruction when a drug is named. Disagreement is shown, never averaged.
  source_positions: { id: "source_positions", family: "answer", requirements: ["russian_guideline", "current_research"], optional: ["international_guideline", "specialty_society_guideline", "official_guideline_status", "russian_drug_reference", "drug_label"] },
  inn_lookup: { id: "inn_lookup", family: "drug", requirements: ["product_listing"], optional: ["official_drug_registration"] },
  disease_reference: { id: "disease_reference", family: "answer", requirements: ["russian_guideline"], optional: ["current_research", "official_guideline_status"] },
  guideline_check: { id: "guideline_check", family: "guidelines", requirements: ["russian_guideline", "current_research"], optional: ["official_guideline_status", "russian_drug_reference", "specialty_society_guideline", "international_guideline"] },
  guideline_discovery: { id: "guideline_discovery", family: "guidelines", requirements: ["russian_guideline"], optional: ["official_guideline_status", "international_guideline", "specialty_society_guideline"] },
  professional_article_search: { id: "professional_article_search", family: "answer", requirements: ["professional_article"], optional: ["current_research"] },
  evidence_review: { id: "evidence_review", family: "research", requirements: ["current_research"], optional: [] },
  event_search: { id: "event_search", family: "events", requirements: ["event_listing"], optional: [] },
  learning_next_step: { id: "learning_next_step", family: "learning", requirements: ["learning_material"], optional: [] },
  updates_digest: { id: "updates_digest", family: "updates", requirements: ["current_research"], optional: ["specialty_society_guideline", "drug_safety_signal"] },
  materials_search: { id: "materials_search", family: "materials", requirements: ["user_material"], optional: [] },
};

export function isJobType(value: unknown): value is JobType {
  return typeof value === "string" && (JOB_TYPES as readonly string[]).includes(value);
}

/** The default job type for a result family when nothing more specific was recognised. */
export const DEFAULT_JOB_FOR_FAMILY: Record<PortalJob, JobType> = {
  answer: "reference_answer",
  drug: "drug_reference",
  guidelines: "guideline_discovery",
  research: "evidence_review",
  events: "event_search",
  learning: "learning_next_step",
  updates: "updates_digest",
  materials: "materials_search",
};
