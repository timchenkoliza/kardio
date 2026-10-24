import type { SpecialtyId } from "@/lib/domain/types";
import { eventsWordMeansProfessionalEvents } from "./clinical-terms";
import { AGENT_DEFINITIONS } from "./definitions";
import { detectRiskSignals, type RiskSignals } from "./risk-rules";
import { normalizeText, stemPattern, wordPattern } from "./text";
import type { AgentId } from "./types";
import { topicsMentioned } from "./vocabulary";

export type IntentKind = "reference_answer" | "monitor_updates" | "compare_guidelines" | "track_drugs" | "research_question" | "find_events" | "plan_learning" | "ask_my_materials";

export interface RoutedIntent {
  agentId: AgentId;
  intent: IntentKind;
  /** Matching confidence of the router, not of any medical statement. */
  confidence: number;
  topics: string[];
  reasons: string[];
  risk: RiskSignals;
  wantsCalendar: boolean;
  wantsRegistration: boolean;
}

interface Rule {
  agentId: AgentId;
  intent: IntentKind;
  patterns: RegExp[];
  weight: number;
}

/** «события» counts for the events agent only when it means congresses and schools (./clinical-terms.ts). */
const EVENTS_WORD = stemPattern("событ");

const RULES: Rule[] = [
  { agentId: "events", intent: "find_events", weight: 3, patterns: [EVENTS_WORD,stemPattern("конференц"), stemPattern("конгресс"), stemPattern("вебинар"), stemPattern("мероприят"), wordPattern("школ[аыу]"), stemPattern("зарегистрируй"), stemPattern("в календар"), stemPattern("будильник"), stemPattern("форум"), stemPattern("симпозиум")] },
  { agentId: "drugs", intent: "track_drugs", weight: 3, patterns: [stemPattern("препарат"), stemPattern("лекарств"), wordPattern("мнн"), stemPattern("отозван"), stemPattern("отзыв\\p{L}* (?:препарат|лекарств|сери)"), stemPattern("ограничени\\p{L}* (?:по|на|примен)"), stemPattern("инструкци"), wordPattern("грлс|fda"), stemPattern("баксдростат|афикамтен|апиксабан|ривароксабан|дабигатран|сакубитрил|семаглутид|тирзепатид|инклисиран|статин|селексипаг")] },
  { agentId: "guidelines", intent: "compare_guidelines", weight: 3, patterns: [stemPattern("рекомендац"), stemPattern("гайдлайн"), stemPattern("guideline"), stemPattern("клинреком"), wordPattern("кр"), wordPattern("esc"), stemPattern("что изменилось в"), stemPattern("нов\\p{L}* верси"), stemPattern("редакци")] },
  { agentId: "learning", intent: "plan_learning", weight: 3, patterns: [stemPattern("обучени"), stemPattern("курс"), stemPattern("лекци"), stemPattern("подготов\\p{L}* к"), wordPattern("нмо"), stemPattern("баллы"), stemPattern("аккредитац"), stemPattern("учебн"), stemPattern("хочу разобраться")] },
  { agentId: "materials", intent: "ask_my_materials", weight: 4, patterns: [stemPattern("мо(?:их|ем|и) материал"), stemPattern("в моих (?:файл|документ|заметк)"), stemPattern("загруженн"), stemPattern("мой файл"), stemPattern("по моему (?:файлу|документу)"), stemPattern("в сохраненн")] },
  { agentId: "whats_new", intent: "monitor_updates", weight: 2, patterns: [stemPattern("что нового"), stemPattern("новост"), stemPattern("обновлени"), stemPattern("с прошлого"), stemPattern("за неделю"), stemPattern("свеж"), stemPattern("появилось")] },
  { agentId: "research", intent: "research_question", weight: 2, patterns: [stemPattern("исследуй"), stemPattern("исследовани"), stemPattern("доказательств"), wordPattern("pico"), stemPattern("сравни"), stemPattern("метаанализ"), wordPattern("рки"), stemPattern("найди данные"), stemPattern("какие данные"), stemPattern("обзор литератур"), stemPattern("что известно"), stemPattern("pubmed")] },
];

/**
 * Deterministic intent router. It routes by task type, it does not interpret
 * medical meaning. Unknown phrasing falls back to the research agent.
 */
export function routeIntent(text: string, specialty: SpecialtyId, options: { preferred?: AgentId | null; hasAttachment?: boolean } = {}): RoutedIntent {
  const value = normalizeText(text);
  const risk = detectRiskSignals(text);
  const topics = topicsMentioned(specialty, text);
  const wantsCalendar = /календар|будильник|напомин/u.test(value);
  const wantsRegistration = /зарегистрир|регистрац\p{L}* на|записа\p{L}* на/u.test(value);

  if (options.preferred) {
    const intent = RULES.find(rule => rule.agentId === options.preferred)?.intent ?? "research_question";
    return { agentId: options.preferred, intent, confidence: 1, topics, reasons: [`Вы выбрали агента «${AGENT_DEFINITIONS[options.preferred].name}»`], risk, wantsCalendar, wantsRegistration };
  }

  const scores = new Map<AgentId, { score: number; hits: string[] }>();
  const professionalEvents = eventsWordMeansProfessionalEvents(value, text);
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern === EVENTS_WORD && !professionalEvents) continue;
      const match = value.match(pattern);
      if (!match) continue;
      const current = scores.get(rule.agentId) ?? { score: 0, hits: [] };
      current.score += rule.weight;
      current.hits.push(match[0].trim());
      scores.set(rule.agentId, current);
    }
  }
  if (options.hasAttachment) {
    const current = scores.get("materials") ?? { score: 0, hits: [] };
    current.score += 3;
    current.hits.push("прикреплён файл");
    scores.set("materials", current);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  if (!ranked.length) {
    return { agentId: "research", intent: "research_question", confidence: 0.4, topics, reasons: ["Вопрос похож на исследовательский — начнём с поиска по источникам"], risk, wantsCalendar, wantsRegistration };
  }
  const [agentId, best] = ranked[0];
  const total = ranked.reduce((sum, [, entry]) => sum + entry.score, 0);
  const intent = RULES.find(rule => rule.agentId === agentId)?.intent ?? "research_question";
  return {
    agentId,
    intent,
    confidence: Math.round((best.score / Math.max(total, 1)) * 100) / 100,
    topics,
    reasons: [`Распознали задачу: ${[...new Set(best.hits)].slice(0, 3).join(", ")}`],
    risk,
    wantsCalendar,
    wantsRegistration,
  };
}
