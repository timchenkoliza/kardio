import type { PharmaAgentId } from "@/lib/access/agent-entitlements";

export type PharmaOutputKind = "article" | "useful" | "media" | "event" | "performance";

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
    name: "Публикатор / Content Studio",
    job: "Превращает проверенный материал партнёра в набор форматов для Яндекс Мед",
    description: "Принимает бриф, текст или ссылку на исходный материал; строит план публикации для статьи, полезного формата, медиа, события и performance-размещения. Факты и медицинские утверждения должны пройти общий evidence/compliance gate до публикации.",
    inputs: ["brief", "source_material", "campaign_goal", "audience"],
    outputs: ["article", "useful", "media", "event", "performance"],
    status: "experimental",
  },
};

export interface ContentStudioPlan {
  agentId: PharmaAgentId;
  input: string;
  steps: readonly string[];
  outputs: readonly PharmaOutputKind[];
}

/**
 * First vertical slice: deterministic routing/plan preview only.
 * It deliberately does not pretend that content generation or publishing is
 * connected yet. The next commit can attach generation tools behind this plan.
 */
export function planContentStudio(input: string): ContentStudioPlan {
  return {
    agentId: "content_studio",
    input: input.trim(),
    steps: [
      "Разобрать бриф и определить аудиторию, цель и обязательные сообщения",
      "Выделить медицинские claims и источники для проверки",
      "Проверить claims, маркировку партнёра и ограничения публикации",
      "Собрать варианты форматов под Ленту и целевое действие",
      "Передать выбранный вариант на human approval перед публикацией",
    ],
    outputs: PHARMA_AGENT_DEFINITIONS.content_studio.outputs,
  };
}
