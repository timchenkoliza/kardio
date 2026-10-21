import type { SemanticSummary } from "../types";
import { SEMANTIC_ENABLED, SEMANTIC_MODES, type SemanticMode } from "./modes";

/**
 * Entry point of the semantic layer. v1 never calls the Anthropic API: it returns
 * a skipped summary with the reason. The prompt, schema, fact filter and cache key
 * are ready for v2, where a client implementation is plugged in here.
 */
export function runSemantic(input: { mode: SemanticMode; noAi: boolean; routes: string[] }): SemanticSummary {
  const config = SEMANTIC_MODES[input.mode];
  const reason = input.noAi
    ? "Смысловой слой выключен флагом --no-ai"
    : !SEMANTIC_ENABLED
      ? "Смысловой слой в v1 отключён: Anthropic API не вызывается"
      : "Клиент Claude API ещё не подключён";
  return { mode: "skipped", model: null, effort: config.effort, routes: input.routes.slice(0, config.maxRoutes), cache_hits: 0, cost_usd: 0, skipped_reason: reason };
}
