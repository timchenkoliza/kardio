import { agentById } from "@/lib/agent-first/agents";
import type { AgentId, AgentPlan, IntentKind } from "@/lib/agent-first/types";

const ACT = /\b(зарегистр|добав|постав|отправ|опубли|куп|запиш|сохрани)\w*/iu;
const SIMULATE = /\b(симулир|отрепетир|сыграй|возражен|диалог|сценари)\w*/iu;
const PREPARE = /\b(подготов|состав|сделай|оформи|черновик|план|презентац)\w*/iu;

export function classifyIntent(input: string): IntentKind {
  if (ACT.test(input)) return "act";
  if (SIMULATE.test(input)) return "simulate";
  if (PREPARE.test(input)) return "prepare";
  return "research";
}

export function selectAgent(input: string, requestedAgent?: AgentId): AgentId {
  if (requestedAgent && agentById[requestedAgent]) return requestedAgent;
  const normalized = input.toLocaleLowerCase("ru-RU");
  if (/событ|конференц|вебинар|нмо|календар|регистрац/u.test(normalized)) return "events";
  if (/препарат|лекарств|таблет|фарм|антикоаг|статин/u.test(normalized)) return "drug-change";
  if (/рекомендац|гайдлайн|guideline|esc|рко/u.test(normalized)) return "guideline-change";
  if (/обуч|курс|лекц|учеб/u.test(normalized)) return "learning";
  if (/мо[ийх]\s+материал|загруз|сохран[её]н|моя\s+база/u.test(normalized)) return "materials";
  if (/что\s+нов|изменил|с\s+прошл/u.test(normalized)) return "whats-new";
  return "research";
}

export function createPlan(input: string, requestedAgent?: AgentId): AgentPlan {
  const intent = classifyIntent(input);
  const agentId = selectAgent(input, requestedAgent);
  return {
    intent,
    agentId,
    steps: [
      "normalize_intent",
      "select_agent",
      "retrieve_available_sources",
      "validate_provenance",
      "fact_and_risk_gate",
      intent === "act" ? "request_human_approval" : "compose_result",
    ],
    requiresApproval: intent === "act",
  };
}

export function routeTask(input: string, requestedAgent?: AgentId): AgentPlan {
  return createPlan(input, requestedAgent);
}

export function isNewSinceLastSeen(lastSeenAt: string | null | undefined, candidateDates: Array<string | null | undefined>): boolean {
  if (!lastSeenAt) return false;
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return false;
  return candidateDates.some(value => {
    if (!value) return false;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp > seen;
  });
}
