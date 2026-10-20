import { researchContentScopeLabel, researchDomainPolicyLabel, researchSourceScopeLabel, type ResearchRunOptions } from "@/lib/agents/research-options";
import type { SpecialtyId } from "@/lib/domain/types";
import { routeTask, runAgent, type RunOutcome } from "./supervisor";
import { bindResearchRunOptions } from "./services/research-runtime-policy";
import { workspaceStore } from "./store";
import { isRehydrated, markRehydrationConsumed } from "./store/mirror";
import { catalogFor, loadProfile } from "./workspace";

export async function executeResearchRun(
  sessionId: string,
  specialty: SpecialtyId,
  text: string,
  options: ResearchRunOptions,
): Promise<RunOutcome> {
  const store = workspaceStore();
  const profile = bindResearchRunOptions(await loadProfile(sessionId, specialty), options);
  const catalog = await catalogFor(specialty);
  const rehydrated = isRehydrated(sessionId, specialty);
  const routed = routeTask(text, specialty, { preferred: "research" });

  const outcome = await runAgent(
    { store, sessionId, catalog, rehydrated },
    { agentId: "research", specialty, profile, trigger: "composer", text, routed },
  );

  if (outcome.run.status !== "blocked") {
    const domainPolicy = researchDomainPolicyLabel(options);
    outcome.run.plan = [{
      id: "research-retrieval-policy",
      label: "Применили фильтры до поиска",
      tool: null,
      status: "done",
      detail: [
        `Источники: ${researchSourceScopeLabel(options.sourceScope)}`,
        `Тип: ${researchContentScopeLabel(options.contentScope)}`,
        domainPolicy ? `Сайты: ${domainPolicy}` : null,
      ].filter(Boolean).join(" · "),
      connectorIds: [],
    }, ...outcome.run.plan];
    await store.saveRun(sessionId, outcome.run);
  }

  if (rehydrated) markRehydrationConsumed(sessionId, specialty);
  const fresh = await loadProfile(sessionId, specialty);
  fresh.subscriptions.research = {
    ...fresh.subscriptions.research,
    lastRunAt: outcome.run.completedAt ?? outcome.run.startedAt,
    lastRunId: outcome.run.id,
  };
  fresh.updatedAt = new Date().toISOString();
  await store.saveProfile(sessionId, fresh);
  return outcome;
}
