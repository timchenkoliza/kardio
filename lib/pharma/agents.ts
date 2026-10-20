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
    job: "Превращает материал партнёра в управляемый пакет публикации для Яндекс Мед",
    description: "Принимает бриф и исходные материалы; строит Claim Map, применяет evidence/source-policy/compliance gate и ведёт пакет со статьёй, полезным форматом, медиа, событием и performance-размещением до review.",
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

/** Stable workflow plan embedded into each persisted Content Studio run. */
export function planContentStudio(input: string): ContentStudioPlan {
  return {
    agentId: "content_studio",
    input: input.trim(),
    steps: [
      "Разобрать бриф и определить аудиторию, цель и обязательные сообщения",
      "Принять исходные материалы и выделить атомарные медицинские claims",
      "Применить source-policy, FactCheck и compliance gate к каждому claim",
      "Собрать рабочие форматы под Ленту и целевое действие без неподтверждённых медицинских утверждений",
      "Передать пакет с Claim Map на human review перед одобрением и публикацией",
    ],
    outputs: PHARMA_AGENT_DEFINITIONS.content_studio.outputs,
  };
}
