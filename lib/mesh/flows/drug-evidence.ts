import type { IntentFlow } from "../skills/types";

/**
 * drug_evidence.flow.v1 — «drug X in condition Y: what is known now?»
 *
 * Reuses the proven golden-path evidence set: the Russian guideline (with
 * currentness and the drug's mention or absence), the Russian instruction
 * (US label only as a stand-in), the society guideline and current research.
 *   Russian instruction found?  yes → Russian indication | no → US label as a labelled stand-in
 */
export const DRUG_EVIDENCE_FLOW: IntentFlow = {
  id: "drug_evidence.flow",
  version: "1.0.0",
  inputs: [{ name: "question", required: true }, { name: "drug", required: true }, { name: "nosology", required: true }, { name: "subtype", required: false }],
  steps: [
    { id: "resolve_drug_condition", kind: "resolve", label: "Определяем препарат и состояние" },
    { id: "retrieve_evidence", kind: "retrieve", label: "Находим инструкцию, рекомендации и исследования", requirements: ["russian_drug_reference", "russian_guideline", "specialty_society_guideline", "current_research", "official_guideline_status"] },
    { id: "instruction", kind: "branch", label: "Есть ли российская инструкция", branch: { when: "russian_instruction_found", then: ["indication_match"], otherwise: ["instruction_gap"] } },
    { id: "instruction_gap", kind: "derive", label: "Отмечаем, что российской инструкции нет", operation: "instruction_gap" },
    { id: "indication_match", kind: "derive", label: "Сверяем показания с вопросом", operation: "indication_match" },
    { id: "guideline_position", kind: "derive", label: "Что говорят рекомендации", operation: "guideline_position" },
    { id: "conflicts_currentness", kind: "derive", label: "Проверяем расхождения и актуальность", operation: "conflicts_currentness" },
    { id: "validate", kind: "validate", label: "Проверяем, что каждое утверждение подтверждено источником" },
    { id: "compile", kind: "compile", label: "Собираем результат" },
  ],
  dependencies: [
    { from: "resolve_drug_condition", to: "retrieve_evidence" },
    { from: "retrieve_evidence", to: "instruction" },
    { from: "instruction", to: "indication_match" },
    { from: "instruction", to: "instruction_gap" },
    { from: "instruction_gap", to: "conflicts_currentness" },
    { from: "retrieve_evidence", to: "guideline_position" },
    { from: "indication_match", to: "conflicts_currentness" },
    { from: "guideline_position", to: "conflicts_currentness" },
    { from: "conflicts_currentness", to: "validate" },
    { from: "validate", to: "compile" },
  ],
  stopConditions: [{ id: "budget_exhausted", description: "Исчерпан интерактивный бюджет источников — результат собирается из того, что подтверждено" }],
  fallbackPolicy: { onFailure: "generic_path", failClosed: [] },
  outputContract: { modules: ["key_takeaway", "drug_reference", "sources", "handoff"], traceable: true },
};
