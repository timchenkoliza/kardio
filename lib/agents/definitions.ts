import type { AgentDefinition, AgentId, AgentPreference, AgentSafetyPolicy } from "./types";

const baseSafety: AgentSafetyPolicy = {
  prescribing: "forbidden",
  patientIdentifiers: "redact_and_warn",
  imageInterpretation: "forbidden",
  externalActions: "confirmation_required",
  partnerContent: "separate_labelled_slot",
};

function preference(overrides: Partial<AgentPreference>): AgentPreference {
  return {
    topics: null,
    contentTypes: [],
    frequency: "daily",
    delivery: ["home"],
    formats: [],
    horizonDays: 90,
    goals: [],
    ...overrides,
  };
}

/**
 * The only user-facing agents. Tools, connectors, fact checking and risk
 * checking are deliberately not agents: they are shared capabilities.
 */
export const AGENT_DEFINITIONS: Record<AgentId, AgentDefinition> = {
  whats_new: {
    id: "whats_new",
    name: "Что нового для меня",
    job: "Показывает, что существенно изменилось в ваших темах с прошлого визита",
    description: "Сводит новые публикации, обновления рекомендаций и изменения по препаратам в одну короткую сводку. Каждая находка — с источником и причиной, почему она здесь.",
    icon: "sparkles",
    inputs: [{ id: "topics", label: "Темы", required: true }, { id: "sources", label: "Источники", required: false }],
    preferenceGroups: ["topics", "contentTypes", "sources", "frequency", "delivery"],
    supportedTools: ["searchMedical", "searchPubmed", "guidelineDiff", "findDrugChanges", "rankEvidence", "factCheck", "riskCheck", "matchPartnerContent"],
    triggerMode: "scheduled",
    outputSchema: ["update", "guideline_change", "drug_change", "partner"],
    safetyPolicy: baseSafety,
    status: "active",
    defaultPreference: preference({ contentTypes: ["research", "guidelines", "drugs"], frequency: "daily", horizonDays: 90 }),
  },
  guidelines: {
    id: "guidelines",
    name: "Изменения рекомендаций",
    job: "Находит новые версии рекомендаций и показывает только клинически значимые отличия",
    description: "Сравнивает версии рекомендаций РКО и ESC, отмечает заменённые и требующие проверки документы. Если полного текста нет, говорит об этом прямо.",
    icon: "scale",
    inputs: [{ id: "topics", label: "Темы", required: true }, { id: "sources", label: "Общества", required: false }],
    preferenceGroups: ["topics", "sources", "frequency", "delivery", "horizon"],
    supportedTools: ["searchMedical", "retrieveDocument", "guidelineDiff", "factCheck", "riskCheck"],
    triggerMode: "scheduled",
    outputSchema: ["guideline_change"],
    safetyPolicy: { ...baseSafety, partnerContent: "not_applicable" },
    status: "active",
    defaultPreference: preference({ contentTypes: ["guidelines"], frequency: "weekly", horizonDays: 365 }),
  },
  drugs: {
    id: "drugs",
    name: "Препараты",
    job: "Отслеживает значимые изменения по препаратам в ваших темах",
    description: "Регистрации, отзывы, новые ограничения, изменения инструкций и рекомендаций, важные исследования — только то, что изменилось с вашего прошлого просмотра. Не назначает лечение.",
    icon: "pill",
    inputs: [{ id: "topics", label: "Нозологии", required: true }, { id: "horizon", label: "Период", required: false }],
    preferenceGroups: ["topics", "sources", "frequency", "delivery", "horizon"],
    supportedTools: ["findDrugChanges", "searchPubmed", "factCheck", "riskCheck", "matchPartnerContent"],
    triggerMode: "scheduled",
    outputSchema: ["drug_change", "partner"],
    safetyPolicy: baseSafety,
    status: "active",
    defaultPreference: preference({ contentTypes: ["drugs"], frequency: "daily", horizonDays: 365 }),
  },
  research: {
    id: "research",
    name: "Исследовать тему",
    job: "Исследует профессиональный вопрос по доверенным источникам и возвращает проверяемый обзор",
    description: "Формулирует план поиска, ищет в каталоге и PubMed, проверяет каждое утверждение по источнику и отделяет найденное от неизвестного.",
    icon: "search",
    inputs: [{ id: "text", label: "Вопрос", required: true }, { id: "sources", label: "Источники", required: false }],
    preferenceGroups: ["topics", "sources", "delivery"],
    supportedTools: ["searchMedical", "searchPubmed", "retrieveDocument", "rankEvidence", "factCheck", "riskCheck"],
    triggerMode: "on_demand",
    outputSchema: ["research_finding"],
    safetyPolicy: { ...baseSafety, partnerContent: "not_applicable" },
    status: "active",
    defaultPreference: preference({ contentTypes: ["research", "guidelines"], frequency: "important_only" }),
  },
  events: {
    id: "events",
    name: "События",
    job: "Находит подходящие профессиональные события и помогает сделать следующий шаг",
    description: "Ищет конференции, школы и вебинары по вашим темам, формату и периоду, объясняет, почему событие подходит, и готовит действие: календарь или переход к регистрации — только после вашего подтверждения.",
    icon: "calendar",
    inputs: [{ id: "topics", label: "Темы", required: true }, { id: "formats", label: "Город и формат", required: true }, { id: "horizon", label: "Период", required: true }],
    preferenceGroups: ["topics", "sources", "formats", "horizon", "delivery"],
    supportedTools: ["searchEvents", "rankEvidence", "factCheck", "riskCheck", "matchPartnerContent"],
    triggerMode: "scheduled",
    outputSchema: ["event", "partner"],
    safetyPolicy: baseSafety,
    status: "active",
    defaultPreference: preference({ contentTypes: ["events"], frequency: "weekly", formats: ["moscow", "online"], horizonDays: 60, delivery: ["home", "calendar"] }),
  },
  learning: {
    id: "learning",
    name: "Моё обучение",
    job: "Строит и ведёт учебный маршрут под ваши цели",
    description: "Собирает маршрут из актуальных рекомендаций, видеолекций разработчиков и событий с НМО. Помечает устаревшие версии и отслеживает пройденное.",
    icon: "graduation",
    inputs: [{ id: "goals", label: "Цели", required: true }, { id: "topics", label: "Темы", required: true }],
    preferenceGroups: ["goals", "topics", "horizon", "delivery"],
    supportedTools: ["generateLearningPlan", "searchMedical", "searchEvents", "factCheck"],
    triggerMode: "on_demand",
    outputSchema: ["learning_module"],
    safetyPolicy: { ...baseSafety, partnerContent: "not_applicable" },
    status: "active",
    defaultPreference: preference({ contentTypes: ["learning"], frequency: "weekly", goals: ["guideline_refresh"], horizonDays: 90 }),
  },
  materials: {
    id: "materials",
    name: "Мои материалы",
    job: "Отвечает по документам и ссылкам, которые вы сами сохранили или загрузили",
    description: "Ищет только в вашей личной базе: загруженные файлы, ссылки, заметки и сохранённые результаты агентов. Чужим пользователям ваши материалы недоступны.",
    icon: "folder",
    inputs: [{ id: "text", label: "Вопрос", required: true }, { id: "file", label: "Файл", required: false }],
    preferenceGroups: ["delivery"],
    supportedTools: ["indexUserMaterial", "searchUserMaterials", "saveMaterial", "factCheck", "riskCheck"],
    triggerMode: "on_demand",
    outputSchema: ["material_hit"],
    safetyPolicy: { ...baseSafety, partnerContent: "not_applicable" },
    status: "active",
    defaultPreference: preference({ frequency: "important_only" }),
  },
};

export const AGENT_ORDER: readonly AgentId[] = ["whats_new", "guidelines", "drugs", "research", "events", "learning", "materials"];

export function agentDefinition(id: AgentId): AgentDefinition {
  return AGENT_DEFINITIONS[id];
}

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(AGENT_DEFINITIONS, value);
}

/** URL slugs keep links readable; ids stay snake_case internally. */
export const AGENT_SLUGS: Record<AgentId, string> = {
  whats_new: "whats-new",
  guidelines: "guidelines",
  drugs: "drugs",
  research: "research",
  events: "events",
  learning: "learning",
  materials: "materials",
};

export function agentIdFromSlug(slug: string): AgentId | null {
  const entry = (Object.entries(AGENT_SLUGS) as Array<[AgentId, string]>).find(([, value]) => value === slug);
  return entry ? entry[0] : null;
}

export function agentHref(specialty: string, id: AgentId): string {
  if (id === "materials") return `/${specialty}/materials`;
  return `/${specialty}/agents/${AGENT_SLUGS[id]}`;
}
