import type { PharmaAgentId } from "@/lib/access/agent-entitlements";

export type PharmaOutputKind = "article" | "useful" | "media" | "event" | "brand_page";

export interface PharmaAgentDefinition {
  id: PharmaAgentId;
  name: string;
  job: string;
  description: string;
  inputs: readonly string[];
  outputs: readonly PharmaOutputKind[];
  status: "experimental";
}

/** First partner-facing agent. One brief in; multiple publication formats out. */
export const PHARMA_AGENT_DEFINITIONS: Record<PharmaAgentId, PharmaAgentDefinition> = {
  content_studio: {
    id: "content_studio",
    name: "Студия контента",
    job: "Готовит из материала партнёра пакет публикаций для Ленты врачей",
    description: "Принимает задачу и исходные материалы, выделяет медицинские утверждения, проверяет их по источникам и готовит статью, полезный материал, медиа, анонс события и бренд-страницу до проверки редакцией.",
    inputs: ["brief", "source_material", "campaign_goal", "audience"],
    outputs: ["article", "useful", "media", "event", "brand_page"],
    status: "experimental",
  },
};

export interface ContentStudioPlan {
  agentId: PharmaAgentId;
  input: string;
  steps: readonly string[];
  outputs: readonly PharmaOutputKind[];
}

/** Stable workflow plan embedded into each persisted Content Studio run. */
export function planContentStudio(input: string): ContentStudioPlan {
  return {
    agentId: "content_studio",
    input: input.trim(),
    steps: [
      "Разобрать бриф и определить аудиторию, цель и обязательные сообщения",
      "Принять исходные материалы и выделить отдельные медицинские утверждения",
      "Проверить каждое утверждение: источник, подтверждение, допустимость для публикации",
      "Собрать форматы для Ленты без неподтверждённых медицинских утверждений",
      "Передать пакет с картой утверждений на проверку редакции до публикации",
    ],
    outputs: PHARMA_AGENT_DEFINITIONS.content_studio.outputs,
  };
}
