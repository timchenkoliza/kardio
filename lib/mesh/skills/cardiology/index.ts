import type { IntentSkill } from "../types";

const L = "(?<![\\p{L}])";

/**
 * cardiology.guideline_change — «Что изменилось в рекомендациях по ХСН?»
 * Current vs previous version, changed positions, currentness and the official-status boundary.
 */
export const GUIDELINE_CHANGE: IntentSkill = {
  id: "cardiology.guideline_change",
  version: "1.0.0",
  domain: { specialties: ["cardiology"], nosologies: ["cardiology/heart_failure", "cardiology/atrial_fibrillation", "cardiology/arterial_hypertension"] },
  matches: {
    families: ["guidelines", "answer"],
    requires: { nosology: true },
    signals: [
      { id: "what_changed", pattern: `${L}что\\s+(?:\\p{L}+\\s+)?измени`, weight: 0.4, reason: "вопрос о том, что изменилось" },
      { id: "changes", pattern: `${L}(?:изменени|обновлени|нового\\s+в)`, weight: 0.3, reason: "речь об изменениях" },
      { id: "new_guidelines", pattern: `${L}(?:нов\\p{L}*|свеж\\p{L}*|последн\\p{L}*)\\s+(?:\\p{L}+\\s+)?рекомендац`, weight: 0.35, reason: "новые рекомендации" },
      { id: "compare_versions", pattern: `${L}(?:сравни|сопостав|отлича)\\p{L}*.*(?:предыдущ|прошл|стар|прежн)`, weight: 0.45, reason: "сравнение с предыдущей версией" },
      { id: "vs_previous", pattern: `${L}(?:по\\s+сравнению\\s+с|относительно)\\s+(?:предыдущ|прошл|прежн)`, weight: 0.4, reason: "относительно предыдущей версии" },
      { id: "guideline_word", pattern: `${L}(?:рекомендац|гайдлайн|guideline)`, weight: 0.1, reason: "речь о рекомендациях" },
    ],
    excludes: [{ id: "drug_label_task", pattern: `${L}(?:противопоказ|дозир|инструкци|взаимодейств)`, weight: 1, reason: "вопрос об инструкции препарата" }],
    threshold: 0.65,
  },
  requiredContext: ["nosology"],
  optionalContext: ["subtype", "drug"],
  clarificationPolicy: { askWhenMissing: ["nosology"], maxTurns: 1 },
  // A Skill only adds evidence to what the compiled intent requires — it never drops any (no-regression by construction).
  evidenceNeeds: ["russian_guideline", "official_guideline_status", "current_research"],
  optionalEvidence: ["specialty_society_guideline"],
  executesAs: "guideline_check",
  preferredCapabilities: ["evidence_answer"],
  sourcePolicy: { prefer: ["medi", "goldenset_catalog", "esc_guidelines_snapshot"] },
  flowId: "guideline_change.flow",
  experiencePolicy: {
    modules: ["key_takeaway", "recommendation_delta", "conflict", "drug_reference", "evidence", "sources", "handoff", "next_actions"],
    takeaway: { guidelines: [["currentness", 1], ["society_assertion", 2], ["guideline_statement", 1], ["guideline_metadata", 1], ["drug_not_mentioned", 1], ["review_conclusion", 1]] },
    explanation: "Сравниваем текущую и предыдущую версии рекомендаций",
  },
  evaluationContract: {
    cases: [
      { text: "Что изменилось в рекомендациях по ХСН?", specialty: "cardiology", expectMatch: true, expectModules: ["key_takeaway", "recommendation_delta"] },
      { text: "Какие новые рекомендации по ХСН-сФВ?", specialty: "cardiology", expectMatch: true, expectModules: ["key_takeaway", "recommendation_delta"] },
      { text: "Сравни текущие рекомендации по ХСН с предыдущими", specialty: "cardiology", expectMatch: true, expectModules: ["key_takeaway", "recommendation_delta"] },
      { text: "Что изменилось в рекомендациях по фибрилляции предсердий?", specialty: "cardiology", expectMatch: true },
      { text: "Сердечная недостаточность", specialty: "cardiology", expectMatch: false },
      { text: "Эмпаглифлозин при ХСН: противопоказания", specialty: "cardiology", expectMatch: false },
      { text: "Что изменилось в рекомендациях по мигрени?", specialty: "neurology", expectMatch: false },
    ],
    noRegressionAgainst: "generic",
    maxUnsupportedClaims: 0,
  },
  safety: ["currentness_must_be_shown", "no_prescribing"],
  // Promoted after the differential evaluation passed (local live 14/14, remote shadow 14/14).
  rollout: { mode: "primary", change: "CHG-2026-10-22-intent-skills-primary" },
};

/**
 * cardiology.drug_evidence — «Эмпаглифлозин при ХСН-сФВ — что сейчас известно?»
 * Reuses the proven golden-path evidence set (Russian guideline with currentness, Russian
 * instruction, society guideline, current research, official-status hand-off).
 */
export const DRUG_EVIDENCE: IntentSkill = {
  id: "cardiology.drug_evidence",
  version: "1.0.0",
  domain: { specialties: ["cardiology"], nosologies: ["cardiology/heart_failure", "cardiology/atrial_fibrillation", "cardiology/arterial_hypertension"] },
  matches: {
    families: ["drug", "guidelines", "answer"],
    requires: { drug: true, nosology: true },
    signals: [
      { id: "current_state", pattern: `${L}(?:что\\s+сейчас|что\\s+известно|актуальн|на\\s+сегодня|сейчас)`, weight: 0.3, reason: "вопрос о текущем состоянии" },
      { id: "guidelines", pattern: `${L}рекомендац`, weight: 0.25, reason: "положение в рекомендациях" },
      { id: "evidence", pattern: `${L}(?:доказательств|данн\\p{L}*|исследован|эффективн)`, weight: 0.25, reason: "доказательная база" },
      { id: "at_condition", pattern: `${L}(?:при|у\\s+пациент\\p{L}*\\s+с)\\s+`, weight: 0.1, reason: "препарат при заболевании" },
    ],
    excludes: [
      { id: "label_section", pattern: `${L}(?:противопоказ|дозир|дозиров|взаимодейств|побочн)`, weight: 1, reason: "вопрос о разделе инструкции" },
      { id: "inn_lookup", pattern: `${L}(?:аналог|дженерик|торгов\\p{L}*\\s+назван)`, weight: 1, reason: "поиск препаратов по МНН" },
    ],
    threshold: 0.6,
  },
  requiredContext: ["drug", "nosology"],
  optionalContext: ["subtype"],
  clarificationPolicy: { askWhenMissing: ["drug"], maxTurns: 1 },
  evidenceNeeds: ["russian_drug_reference", "russian_guideline", "specialty_society_guideline", "current_research", "official_guideline_status"],
  // Executes as the proven golden path: the same job, scenario, plan, modules and takeaway as
  // «Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?».
  executesAs: "guideline_check",
  preferredCapabilities: ["evidence_answer"],
  sourcePolicy: { prefer: ["medi", "pubmed", "esc_guidelines_snapshot"] },
  flowId: "drug_evidence.flow",
  experiencePolicy: {
    modules: ["key_takeaway", "recommendation_delta", "conflict", "drug_reference", "evidence", "sources", "handoff", "next_actions"],
    explanation: "Сверяем инструкцию, рекомендации и свежие исследования",
  },
  evaluationContract: {
    cases: [
      { text: "Эмпаглифлозин при ХСН-сФВ — что сейчас известно?", specialty: "cardiology", expectMatch: true, expectModules: ["key_takeaway", "drug_reference", "recommendation_delta", "evidence"] },
      { text: "Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?", specialty: "cardiology", expectMatch: true, expectModules: ["key_takeaway", "recommendation_delta", "drug_reference", "evidence"] },
      { text: "Дапаглифлозин при сердечной недостаточности: актуальные данные", specialty: "cardiology", expectMatch: true },
      { text: "Апиксабан: противопоказания", specialty: "cardiology", expectMatch: false },
      { text: "Эмпаглифлозин при ХСН: дозировка", specialty: "cardiology", expectMatch: false },
    ],
    noRegressionAgainst: "generic",
    maxUnsupportedClaims: 0,
  },
  safety: ["currentness_must_be_shown", "jurisdiction_boundary", "no_prescribing"],
  // Promoted after the differential evaluation passed (local live 14/14, remote shadow 14/14).
  rollout: { mode: "primary", change: "CHG-2026-10-22-intent-skills-primary" },
};

export const SKILLS: readonly IntentSkill[] = [GUIDELINE_CHANGE, DRUG_EVIDENCE];
