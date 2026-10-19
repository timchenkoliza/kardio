export type ProductBlockKind =
  | "hero_knowledge"
  | "knowledge_shelf"
  | "evidence_shelf"
  | "clinical_shelf"
  | "guideline_shelf"
  | "tool_shelf"
  | "reference_shelf"
  | "event_rail"
  | "source_shelf"
  | "learning_shelf"
  | "saved_shelf"
  | "collection_shelf"
  | "topic_cluster"
  | "context_prompt"
  | "assistant_entry"
  | "update_strip";

export type ProductBlockRegion = "primary" | "rail" | "full";

export interface ProductBlockDefinition {
  kind: ProductBlockKind;
  region: ProductBlockRegion;
  userControllable: boolean;
  purpose: string;
}

export const productBlockTaxonomy: Record<ProductBlockKind, ProductBlockDefinition> = {
  hero_knowledge: { kind: "hero_knowledge", region: "primary", userControllable: true, purpose: "Один главный профессиональный объект для входа в тему." },
  knowledge_shelf: { kind: "knowledge_shelf", region: "primary", userControllable: true, purpose: "Универсальный резервный набор knowledge objects, когда отдельный профессиональный тип не выделен." },
  evidence_shelf: { kind: "evidence_shelf", region: "primary", userControllable: true, purpose: "Исследования, статьи и другие evidence-oriented knowledge objects." },
  clinical_shelf: { kind: "clinical_shelf", region: "primary", userControllable: true, purpose: "Клинические материалы и source-grounded case-oriented objects без пациентского профиля." },
  guideline_shelf: { kind: "guideline_shelf", region: "primary", userControllable: true, purpose: "Текущие рекомендации и их версии." },
  tool_shelf: { kind: "tool_shelf", region: "full", userControllable: true, purpose: "Рабочие инструменты, калькуляторы и быстрые действия." },
  reference_shelf: { kind: "reference_shelf", region: "primary", userControllable: true, purpose: "Справочные и инструментальные объекты каталога." },
  event_rail: { kind: "event_rail", region: "rail", userControllable: true, purpose: "Source-grounded профессиональные события без автоматического вывода актуальности." },
  source_shelf: { kind: "source_shelf", region: "rail", userControllable: true, purpose: "Профессиональные источники и маршруты к первоисточникам." },
  learning_shelf: { kind: "learning_shelf", region: "primary", userControllable: true, purpose: "Лекции, курсы и образовательные материалы." },
  saved_shelf: { kind: "saved_shelf", region: "rail", userControllable: true, purpose: "Пользовательские сохранения и закреплённые материалы." },
  collection_shelf: { kind: "collection_shelf", region: "primary", userControllable: true, purpose: "Пользовательские подборки и наборы материалов." },
  topic_cluster: { kind: "topic_cluster", region: "rail", userControllable: true, purpose: "Явно выбранные темы, интересы и тематические маршруты." },
  context_prompt: { kind: "context_prompt", region: "rail", userControllable: true, purpose: "Короткий вход в поиск или следующий контекстный шаг." },
  assistant_entry: { kind: "assistant_entry", region: "full", userControllable: true, purpose: "Контекстный вход в ассистента без chat-first поверхности." },
  update_strip: { kind: "update_strip", region: "primary", userControllable: true, purpose: "Недавние изменения и продолжение работы." },
};

export function blockRegion(kind: ProductBlockKind): ProductBlockRegion {
  return productBlockTaxonomy[kind].region;
}
