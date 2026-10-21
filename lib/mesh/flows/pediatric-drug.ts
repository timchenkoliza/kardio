import type { IntentFlow } from "../skills/types";

/**
 * pediatric_drug_reference.flow.v1 — «drug X in children».
 *
 * The instruction's own sections only: indications, contraindications
 * (including age limits), the «use in children» section and dosing as
 * written. No prescribing.
 *   pediatric section found?  yes → shown first | no → explicit gap («в инструкции нет отдельного раздела о детях»)
 */
export const PEDIATRIC_DRUG_FLOW: IntentFlow = {
  id: "pediatric_drug_reference.flow",
  version: "1.0.0",
  inputs: [{ name: "question", required: true }, { name: "drug", required: true }, { name: "population", required: true }],
  steps: [
    { id: "resolve_drug_population", kind: "resolve", label: "Определяем препарат и возраст" },
    { id: "retrieve_instruction", kind: "retrieve", label: "Открываем инструкцию", requirements: ["russian_drug_reference"] },
    { id: "pediatric_section", kind: "branch", label: "Есть ли в инструкции раздел о детях", branch: { when: "pediatric_section_found", then: ["pediatric_first"], otherwise: ["pediatric_gap"] } },
    { id: "pediatric_first", kind: "derive", label: "Показываем раздел о детях первым", operation: "pediatric_first" },
    { id: "pediatric_gap", kind: "derive", label: "Отмечаем, что отдельного раздела нет", operation: "pediatric_gap" },
    { id: "retrieve_research", kind: "retrieve", label: "Добавляем публикации о детях", requirements: ["current_research"] },
    { id: "validate", kind: "validate", label: "Проверяем, что каждое утверждение подтверждено источником" },
    { id: "compile", kind: "compile", label: "Собираем результат" },
  ],
  dependencies: [
    { from: "resolve_drug_population", to: "retrieve_instruction" },
    { from: "resolve_drug_population", to: "retrieve_research" },
    { from: "retrieve_instruction", to: "pediatric_section" },
    { from: "pediatric_section", to: "pediatric_first" },
    { from: "pediatric_section", to: "pediatric_gap" },
    { from: "pediatric_first", to: "validate" },
    { from: "pediatric_gap", to: "validate" },
    { from: "retrieve_research", to: "validate" },
    { from: "validate", to: "compile" },
  ],
  stopConditions: [{ id: "no_drug", description: "Препарат не распознан — выполняется общий путь" }],
  fallbackPolicy: { onFailure: "generic_path", failClosed: [] },
  outputContract: { modules: ["key_takeaway", "drug_reference", "sources"], traceable: true },
};
