import { researchContentScopeLabel, researchDomainPolicyLabel, researchSourceScopeLabel, type ResearchRunOptions } from "@/lib/agents/research-options";
import type { SpecialtyId } from "@/lib/domain/types";
import { routeTask, runAgent, type RunOutcome } from "./supervisor";
import { bindResearchRunOptions } from "./services/research-runtime-policy";
import { enrichResearchResultsWithStructuredEvidence } from "./services/research-structured-evidence";
import { workspaceStore } from "./store";
import { isRehydrated, markRehydrationConsumed } from "./store/mirror";
import { catalogFor, loadProfile } from "./workspace";

const OLD_FULL_TEXT_GAP = "Полные тексты статей не загружались — агент не пересказывает выводы исследований";

function structuredEvidenceNote(args: { attempted: number; enriched: number; fullText: number; abstracts: number; unavailable: number }, skippedForMode = false): string {
  if (skippedForMode) return "Пропущено: режим «Найти статьи» остаётся быстрым metadata-first поиском";
  if (!args.attempted) return "В выдаче нет публикаций PubMed для извлечения клинических параметров";
  const parts = [
    args.fullText ? `полный текст PMC: ${args.fullText}` : null,
    args.abstracts ? `abstract: ${args.abstracts}` : null,
    args.enriched ? `извлечено и нормализовано: ${args.enriched}` : null,
    args.unavailable ? `без доступного текста: ${args.unavailable}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "Доступного текста для структурирования не найдено";
}

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
    const enrichmentStarted = Date.now();
    const skipStructuredRetrieval = options.contentScope === "guidelines" || options.mode === "articles";
    const enrichment = skipStructuredRetrieval
      ? { results: outcome.results, attempted: 0, enriched: 0, fullText: 0, abstracts: 0, unavailable: 0, notes: [] as string[] }
      : await enrichResearchResultsWithStructuredEvidence(outcome.results, { limit: options.mode === "academic" ? 4 : 3 });

    if (enrichment.enriched) {
      outcome.results = enrichment.results;
      await store.upsertResults(sessionId, outcome.results);
    }

    const domainPolicy = researchDomainPolicyLabel(options);
    const extractionDetail = structuredEvidenceNote(enrichment, options.mode === "articles");
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
    }, ...outcome.run.plan, {
      id: "research-structured-evidence",
      label: "Извлекли и нормализовали параметры исследований",
      tool: "retrieveDocument",
      status: enrichment.enriched ? "done" : "skipped",
      detail: extractionDetail,
      connectorIds: enrichment.attempted ? ["pubmed"] : [],
    }];
    if (enrichment.attempted) {
      outcome.run.toolsUsed.push({
        tool: "retrieveDocument",
        connectorIds: ["pubmed"],
        modes: ["LIVE"],
        status: enrichment.unavailable === enrichment.attempted ? "unavailable" : enrichment.unavailable ? "partial" : "ok",
        itemCount: enrichment.enriched,
        durationMs: Date.now() - enrichmentStarted,
        note: extractionDetail,
      });
    }

    if (outcome.run.synthesis?.includes(OLD_FULL_TEXT_GAP) && !skipStructuredRetrieval) {
      const replacement = enrichment.fullText
        ? `Полный текст PMC получен для ${enrichment.fullText} публикаций;${enrichment.abstracts ? ` для ${enrichment.abstracts} использован abstract;` : ""} N, возраст, вмешательство, comparator, endpoint, follow-up и статистический эффект нормализуются только из явно найденных фрагментов`
        : enrichment.abstracts
          ? `Полный текст PMC не получен; для ${enrichment.abstracts} публикаций использован abstract; нормализованные поля заполняются только при явном фрагменте, без достраивания пропусков`
          : OLD_FULL_TEXT_GAP;
      outcome.run.synthesis = outcome.run.synthesis.replace(OLD_FULL_TEXT_GAP, replacement);
    }
    if (enrichment.notes.length) outcome.run.riskNotices = [...new Set([...outcome.run.riskNotices, ...enrichment.notes])];
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
