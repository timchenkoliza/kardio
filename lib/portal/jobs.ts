import type { AgentId } from "@/lib/agents/types";

/**
 * Physician jobs: the user-experience unit of the portal. Agents are the
 * implementation units behind them and never appear in this vocabulary.
 */
export type PortalJob = "answer" | "drug" | "guidelines" | "research" | "events" | "learning" | "updates" | "materials";
export const PORTAL_JOBS: readonly PortalJob[] = ["answer", "drug", "guidelines", "research", "events", "learning", "updates", "materials"];

export interface PortalJobDefinition {
  id: PortalJob;
  /** Agent (implementation unit) that executes the job and owns persistence. */
  agentId: AgentId;
  /** Physician-facing result name. */
  label: string;
  /** What the physician gets, in one line. */
  promise: string;
  placeholder: string;
  /** Route preview under the input: «Покажем …». */
  preview: string;
  icon: "answer" | "pill" | "scale" | "search" | "calendar" | "graduation" | "sparkles" | "folder";
}

export const JOBS: Record<PortalJob, PortalJobDefinition> = {
  answer: { id: "answer", agentId: "reference", label: "Ответ по источникам", promise: "Выводы систематических обзоров и рекомендаций — цитатами, с источником и годом", placeholder: "Например: длительность антибиотикотерапии при внебольничной пневмонии", preview: "ответ по источникам", icon: "answer" },
  drug: { id: "drug", agentId: "reference", label: "Справка по препарату", promise: "Показания, противопоказания, предупреждения и дозирование из официальной инструкции, плюс свежие сигналы безопасности", placeholder: "МНН или торговое название, например: дапаглифлозин", preview: "справку по препарату", icon: "pill" },
  guidelines: { id: "guidelines", agentId: "guidelines", label: "Клинические рекомендации", promise: "Актуальные рекомендации по теме и что в них изменилось", placeholder: "Тема, например: бронхиальная астма у детей", preview: "клинические рекомендации", icon: "scale" },
  research: { id: "research", agentId: "research", label: "Разбор по исследованиям", promise: "Подборка исследований по вопросу с проверкой источников, сравнением и экспортом", placeholder: "Вопрос, например: эффективность ГПП-1 при ожирении у подростков", preview: "разбор по исследованиям", icon: "search" },
  events: { id: "events", agentId: "events", label: "Профессиональные события", promise: "Ближайшие конференции и школы по теме с датой, форматом и организатором", placeholder: "Тема и формат, например: конференции онлайн в ноябре", preview: "профессиональные события", icon: "calendar" },
  learning: { id: "learning", agentId: "learning", label: "Следующий шаг в обучении", promise: "Что изучить дальше и почему — по вашей специальности и вопросам", placeholder: "Что хотите освежить, например: ведение гипотиреоза", preview: "следующий шаг в обучении", icon: "graduation" },
  updates: { id: "updates", agentId: "whats_new", label: "Что нового", promise: "Новые исследования, рекомендации и сигналы по препаратам с прошлого визита", placeholder: "Тема, например: что нового по мигрени", preview: "что нового по теме", icon: "sparkles" },
  materials: { id: "materials", agentId: "materials", label: "Мои материалы", promise: "Поиск по сохранённым ссылкам, заметкам и загруженным файлам", placeholder: "Что найти в сохранённом", preview: "поиск по вашим материалам", icon: "folder" },
};

/**
 * Homepage shortcuts, chosen by docs/PRODUCT_OPPORTUNITY_MAP.md (frequency ×
 * retention × commercial × confidence × readiness ÷ cost), not by what exists.
 */
export const HOME_SHORTCUTS: readonly PortalJob[] = ["drug", "guidelines", "research"];

export function isPortalJob(value: unknown): value is PortalJob {
  return typeof value === "string" && (PORTAL_JOBS as readonly string[]).includes(value);
}

/** Runs created before the portal carry the agent intent; map them to a job. */
export function jobForRun(run: { agentId: AgentId; intent: string | null }): PortalJob {
  if (isPortalJob(run.intent)) return run.intent;
  const byAgent: Record<AgentId, PortalJob> = { reference: "answer", whats_new: "updates", guidelines: "guidelines", drugs: "drug", research: "research", events: "events", learning: "learning", materials: "materials" };
  return byAgent[run.agentId];
}

export function askHref(specialty: string, args: { run?: string; job?: PortalJob } = {}): string {
  const params = new URLSearchParams();
  if (args.run) params.set("run", args.run);
  if (args.job) params.set("job", args.job);
  const query = params.toString();
  return `/${specialty}/ask${query ? `?${query}` : ""}`;
}
