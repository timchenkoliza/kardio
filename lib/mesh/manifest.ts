import { z } from "zod";
import { SPECIALTY_IDS } from "@/lib/domain/types";
import { PORTAL_JOBS } from "@/lib/portal/jobs";
import { JOB_TYPES } from "./jobs";

/**
 * EXPERIENCE — how a result is represented.
 *
 * The ExperienceManifest is the stable contract between adaptive
 * orchestration and the deterministic renderer. Nothing generates frontend
 * code at runtime: the compiler selects and orders approved module families,
 * and every module points at evidence-graph ids instead of carrying medical
 * text of its own.
 *
 * Stable shell (never in a manifest): navigation, typography, primary input,
 * landmarks, save/share semantics. Adaptive interior (manifest-controlled):
 * module selection, order within policy, density, details, next actions.
 */

export const MANIFEST_SCHEMA = "kardio.experience-manifest/0.1" as const;
export const STABLE_SHELL_VERSION = "portal-shell/1" as const;

export const MODULE_FAMILIES = [
  "key_takeaway",
  "recommendation_delta",
  "conflict",
  "drug_reference",
  "evidence",
  "comparison",
  "positions",
  "timeline",
  "sources",
  "event_list",
  "learning_next_step",
  "calculator",
  "handoff",
  "next_actions",
  "notices",
  "partner",
] as const;
export type ModuleFamily = (typeof MODULE_FAMILIES)[number];

export interface ModuleFamilyPolicy {
  /** A renderer built from approved components exists. Unimplemented families can never be selected. */
  implemented: boolean;
  /** Must the module reference evidence-graph claims or documents? */
  requiresEvidence: boolean;
  maxPerManifest: number;
  /** Fixed, editorially approved module title (terminology may be appended by policy). */
  title: string;
}

export const MODULE_POLICY: Record<ModuleFamily, ModuleFamilyPolicy> = {
  key_takeaway: { implemented: true, requiresEvidence: true, maxPerManifest: 1, title: "Коротко по источникам" },
  recommendation_delta: { implemented: true, requiresEvidence: true, maxPerManifest: 1, title: "Рекомендации и их версии" },
  conflict: { implemented: true, requiresEvidence: true, maxPerManifest: 1, title: "Где источники расходятся" },
  drug_reference: { implemented: true, requiresEvidence: true, maxPerManifest: 2, title: "Инструкция по применению" },
  evidence: { implemented: true, requiresEvidence: true, maxPerManifest: 2, title: "Обзоры и рекомендации" },
  comparison: { implemented: true, requiresEvidence: true, maxPerManifest: 1, title: "Сравнение" },
  positions: { implemented: true, requiresEvidence: true, maxPerManifest: 1, title: "Позиции источников" },
  timeline: { implemented: false, requiresEvidence: true, maxPerManifest: 1, title: "Хронология" },
  sources: { implemented: true, requiresEvidence: false, maxPerManifest: 1, title: "Источники и их состояние" },
  event_list: { implemented: true, requiresEvidence: true, maxPerManifest: 1, title: "События" },
  learning_next_step: { implemented: true, requiresEvidence: true, maxPerManifest: 1, title: "Следующий шаг" },
  calculator: { implemented: false, requiresEvidence: true, maxPerManifest: 1, title: "Калькулятор" },
  handoff: { implemented: true, requiresEvidence: false, maxPerManifest: 1, title: "Проверить в официальных источниках" },
  next_actions: { implemented: true, requiresEvidence: false, maxPerManifest: 1, title: "Что дальше" },
  notices: { implemented: true, requiresEvidence: false, maxPerManifest: 1, title: "Важно" },
  partner: { implemented: true, requiresEvidence: false, maxPerManifest: 1, title: "Партнёрский материал" },
};

export const REPRESENTATION_MODES = ["professional_answer", "drug_card", "drug_comparison", "source_positions", "guideline_delta", "evidence_comparison", "event_list", "learning_step", "source_list", "safe_answer"] as const;
export type RepresentationMode = (typeof REPRESENTATION_MODES)[number];

export const ACTION_KINDS = ["open_source", "compare_versions", "investigate_deeper", "save", "follow_up", "verify_official"] as const;
export type ManifestActionKind = (typeof ACTION_KINDS)[number];

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]);

export const manifestModuleSchema = z.object({
  id: z.string().min(1),
  family: z.enum(MODULE_FAMILIES),
  title: z.string().min(1).max(120),
  emphasis: z.enum(["primary", "secondary"]),
  collapsed: z.boolean(),
  claimIds: z.array(z.string()),
  documentIds: z.array(z.string()),
  resultKeys: z.array(z.string()),
  props: z.record(z.string(), scalar),
});

export const manifestActionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(ACTION_KINDS),
  label: z.string().min(1).max(80),
  documentId: z.string().nullable(),
  href: z.string().nullable(),
  job: z.enum(PORTAL_JOBS).nullable(),
});

export const experienceManifestSchema = z.object({
  schema: z.literal(MANIFEST_SCHEMA),
  id: z.string().min(1),
  graphId: z.string().min(1),
  createdAt: z.string(),
  intent: z.object({
    job: z.enum(JOB_TYPES),
    family: z.enum(PORTAL_JOBS),
    specialty: z.enum(SPECIALTY_IDS),
    nosology: z.string().nullable(),
    subtype: z.string().nullable(),
    scenario: z.string().nullable(),
  }),
  representation: z.object({
    density: z.enum(["compact", "standard", "detailed"]),
    mode: z.enum(REPRESENTATION_MODES),
  }),
  modules: z.array(manifestModuleSchema).min(1).max(12),
  actions: z.array(manifestActionSchema).max(12),
  personalization: z.object({
    applied: z.boolean(),
    source: z.enum(["default", "session", "preference"]),
    /** Real signals only (e.g. «specialty», «saved_topic:hf»); never inferred traits. */
    signals: z.array(z.string()),
  }),
  stableShell: z.literal(STABLE_SHELL_VERSION),
  provenance: z.object({ sourceIds: z.array(z.string()), documentCount: z.number().int().min(0), claimCount: z.number().int().min(0) }),
  compiler: z.object({
    version: z.string(),
    fallback: z.boolean(),
    warnings: z.array(z.string()),
    decisions: z.array(z.string()),
    policy: z.object({ passed: z.boolean(), blocking: z.number().int().min(0), findings: z.number().int().min(0) }),
  }),
  /**
   * How the result was executed. Internal ids (Skill, Flow) are kept for
   * traces and evaluation and are never rendered; `explanation` is the
   * physician-language line («Сравниваем текущую и предыдущую версии рекомендаций»).
   * Absent on manifests compiled before Skills existed.
   */
  execution: z.object({
    class: z.enum(["skill", "dynamic"]),
    explanation: z.string().max(140).nullable(),
    skill: z.object({ id: z.string(), version: z.string(), mode: z.enum(["shadow", "primary"]) }).nullable(),
    flow: z.object({ id: z.string(), version: z.string(), branches: z.array(z.string()).max(12) }).nullable(),
  }).optional(),
  /** The view a refinement applied («только российские источники»); absent = everything. */
  view: z.object({
    jurisdiction: z.enum(["RU"]).nullable(),
    since: z.number().int().min(1900).max(2100).nullable(),
    focus: z.array(z.string()).max(4),
    expandedDocumentId: z.string().nullable(),
    comparison: z.enum(["previous_version"]).nullable(),
  }).optional(),
});

export type ExperienceManifest = z.infer<typeof experienceManifestSchema>;
export type ManifestExecution = NonNullable<ExperienceManifest["execution"]>;
export type ManifestView = NonNullable<ExperienceManifest["view"]>;
export type ManifestModule = z.infer<typeof manifestModuleSchema>;
export type ManifestAction = z.infer<typeof manifestActionSchema>;
