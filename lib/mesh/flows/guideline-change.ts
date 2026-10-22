import type { IntentFlow } from "../skills/types";

/**
 * guideline_change.flow.v1 — «what changed in the recommendations?»
 *
 * The DAG is stable; the evidence path varies:
 *   official RU guideline available?  yes → compare | no → hand-off + professional copy + explicit gap
 *   previous version found?            yes → delta   | no → current-state experience
 */
export const GUIDELINE_CHANGE_FLOW: IntentFlow = {
  id: "guideline_change.flow",
  version: "1.0.0",
  inputs: [{ name: "question", required: true }, { name: "nosology", required: true }, { name: "subtype", required: false }, { name: "drug", required: false }],
  steps: [
    { id: "resolve_topic", kind: "resolve", label: "Определяем тему вопроса" },
    { id: "resolve_scope", kind: "resolve", label: "Уточняем специальность и заболевание" },
    { id: "retrieve_current", kind: "retrieve", label: "Находим действующие рекомендации", requirements: ["russian_guideline", "specialty_society_guideline", "official_guideline_status"] },
    { id: "official_status", kind: "branch", label: "Есть ли российские рекомендации по теме", branch: { when: "official_ru_guideline_available", then: ["current_version"], otherwise: ["official_gap"] } },
    { id: "official_gap", kind: "derive", label: "Показываем, где проверить официальный статус", operation: "official_gap" },
    { id: "current_version", kind: "derive", label: "Определяем текущую версию", operation: "current_version" },
    { id: "retrieve_previous", kind: "derive", label: "Ищем предыдущую версию", operation: "previous_version" },
    { id: "has_previous", kind: "branch", label: "Есть ли с чем сравнивать", branch: { when: "previous_version_found", then: ["version_delta"], otherwise: ["current_state"] } },
    { id: "version_delta", kind: "derive", label: "Сравниваем версии", operation: "version_delta" },
    { id: "current_state", kind: "derive", label: "Показываем текущее состояние", operation: "current_state" },
    { id: "affected_claims", kind: "derive", label: "Отмечаем изменившиеся положения", operation: "affected_claims" },
    { id: "retrieve_research", kind: "retrieve", label: "Добавляем свежие публикации", requirements: ["current_research"] },
    { id: "conflicts_currentness", kind: "derive", label: "Проверяем расхождения и актуальность", operation: "conflicts_currentness" },
    { id: "validate", kind: "validate", label: "Проверяем, что каждое утверждение подтверждено источником" },
    { id: "compile", kind: "compile", label: "Собираем результат" },
  ],
  dependencies: [
    { from: "resolve_topic", to: "resolve_scope" },
    { from: "resolve_scope", to: "retrieve_current" },
    { from: "resolve_scope", to: "retrieve_research" },
    { from: "retrieve_current", to: "official_status" },
    { from: "official_status", to: "current_version" },
    { from: "official_status", to: "official_gap" },
    { from: "official_gap", to: "current_version" },
    { from: "current_version", to: "retrieve_previous" },
    { from: "retrieve_previous", to: "has_previous" },
    { from: "has_previous", to: "version_delta" },
    { from: "has_previous", to: "current_state" },
    { from: "version_delta", to: "affected_claims" },
    { from: "current_state", to: "affected_claims" },
    { from: "affected_claims", to: "conflicts_currentness" },
    { from: "retrieve_research", to: "conflicts_currentness" },
    { from: "conflicts_currentness", to: "validate" },
    { from: "validate", to: "compile" },
  ],
  stopConditions: [
    { id: "no_topic", description: "Тема не распознана — выполняется общий путь" },
    { id: "budget_exhausted", description: "Исчерпан интерактивный бюджет источников — результат собирается из того, что подтверждено" },
  ],
  fallbackPolicy: { onFailure: "generic_path", failClosed: [] },
  outputContract: { modules: ["key_takeaway", "recommendation_delta", "sources", "handoff"], traceable: true },
};
