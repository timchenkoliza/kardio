import type { IntentSkill } from "../types";

const L = "(?<![\\p{L}])";

/**
 * pediatrics.drug_reference_children — «Амоксициллин у детей».
 * A high-frequency reference task with real coverage: the Russian instruction
 * (MEDI) has a «use in children» section, contraindications with age limits
 * and dosing as written. No prescribing; the US label only as a labelled stand-in.
 */
export const PEDIATRIC_DRUG_REFERENCE: IntentSkill = {
  id: "pediatrics.drug_reference_children",
  version: "1.0.0",
  domain: { specialties: ["pediatrics"] },
  matches: {
    families: ["drug", "answer"],
    requires: { drug: true, population: "children" },
    signals: [
      { id: "children", pattern: `${L}(?:у\\s+детей|детям|детск\\p{L}*|ребен\\p{L}*|в\\s+педиатрии|новорожден\\p{L}*|подрост\\p{L}*)`, weight: 0.3, reason: "применение у детей" },
      { id: "label_section", pattern: `${L}(?:противопоказ|дозир|показани|можно\\s+ли|с\\s+какого\\s+возраст)`, weight: 0.15, reason: "раздел инструкции" },
    ],
    excludes: [{ id: "research", pattern: `${L}(?:метаанализ|рандомизир|исследовани\\p{L}*\\s+по)`, weight: 1, reason: "запрос на разбор исследований" }],
    threshold: 0.6,
  },
  requiredContext: ["drug", "population"],
  optionalContext: [],
  clarificationPolicy: { askWhenMissing: ["drug"], maxTurns: 1 },
  evidenceNeeds: ["russian_drug_reference"],
  optionalEvidence: ["drug_label", "current_research"],
  preferredCapabilities: ["evidence_answer"],
  sourcePolicy: { prefer: ["medi"] },
  flowId: "pediatric_drug_reference.flow",
  experiencePolicy: {
    modules: ["key_takeaway", "drug_reference", "conflict", "evidence", "sources", "handoff", "next_actions"],
    // Children first (by the flow), then age limits in contraindications, dosing as written, indications.
    takeaway: { drug: [["contraindication", 1], ["dosing", 1], ["warning", 1], ["indication", 2]], answer: [["contraindication", 1], ["dosing", 1], ["warning", 1], ["indication", 1], ["review_conclusion", 1]] },
    explanation: "Открываем инструкцию: что сказано о детях, противопоказания и дозирование — как в тексте",
  },
  evaluationContract: {
    cases: [
      { text: "Амоксициллин у детей", specialty: "pediatrics", expectMatch: true, expectModules: ["key_takeaway", "drug_reference"] },
      { text: "Ибупрофен детям: противопоказания", specialty: "pediatrics", expectMatch: true, expectModules: ["key_takeaway", "drug_reference"] },
      { text: "Амоксициллин", specialty: "pediatrics", expectMatch: false },
      { text: "Амоксициллин у детей", specialty: "cardiology", expectMatch: false },
    ],
    noRegressionAgainst: "generic",
    maxUnsupportedClaims: 0,
  },
  safety: ["pediatric_sections", "jurisdiction_boundary", "no_prescribing"],
  // Promoted after the differential evaluation passed (local live 14/14, remote shadow 14/14).
  rollout: { mode: "primary", change: "CHG-2026-10-22-intent-skills-primary" },
};

export const SKILLS: readonly IntentSkill[] = [PEDIATRIC_DRUG_REFERENCE];
