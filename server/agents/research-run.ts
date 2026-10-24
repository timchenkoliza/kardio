import { countLabel } from "@/lib/agents/format";
import type { RoutedIntent } from "@/lib/agents/intent";
import { hasStudyIdentifiers, studyIdentifierCount, studyIdentifiersIn } from "@/lib/agents/study-identifiers";
import type { AgentResult, AgentRun } from "@/lib/agents/types";
import type { NormalizedIntent } from "@/lib/mesh/intent";
import type { AnswerMode } from "@/lib/portal/answer-mode";
import type { PortalJob } from "@/lib/portal/jobs";
import { researchContentScopeLabel, researchDomainPolicyLabel, researchModeLabel, researchSourceScopeLabel, type ResearchRunOptions } from "@/lib/agents/research-options";
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

/**
 * The one way the research scenario runs, whichever door the physician used:
 * the scenario page (`/api/agents/research`), a background research job, or the
 * portal input routed to the research job (`executeAskRun`, which passes the
 * queued run). Scenario settings are applied before retrieval, the top
 * PubMed records are read and structured, and the plan says what happened.
 */
/** The depth a review was asked in, kept on the run: every door (the scenario, «История», /ask) shows it the same way. */
const ANSWER_MODE_FOR: Record<ResearchRunOptions["mode"], AnswerMode> = { articles: "short", brief: "full", academic: "research" };

export async function executeResearchRun(
  sessionId: string,
  specialty: SpecialtyId,
  text: string,
  options: ResearchRunOptions,
  queued: { run?: AgentRun | null; routed?: RoutedIntent | null; job?: PortalJob | null; intent?: NormalizedIntent | null; answerMode?: AnswerMode | null } = {},
): Promise<RunOutcome> {
  const store = workspaceStore();
  const profile = bindResearchRunOptions(await loadProfile(sessionId, specialty), options);
  const catalog = await catalogFor(specialty);
  const rehydrated = isRehydrated(sessionId, specialty);
  const routed = queued.routed ?? routeTask(text, specialty, { preferred: "research" });

  // Reading and structuring the top records happens before the run is marked finished, so the result
  // page never shows a «done» answer that is still missing the effects it is about to read.
  const finishing = async ({ results, run }: { results: AgentResult[]; run: AgentRun }): Promise<AgentResult[]> => {
    const enrichmentStarted = Date.now();
    const skipStructuredRetrieval = options.contentScope === "guidelines" || options.mode === "articles";
    // A publication named by identifier is read in full whatever the mode: reading it is the job.
    const named = hasStudyIdentifiers(studyIdentifiersIn(text));
    const limit = named ? Math.max(1, studyIdentifierCount(studyIdentifiersIn(text))) : options.mode === "academic" ? 4 : 3;
    const enrichment = skipStructuredRetrieval && !named
      ? { results, attempted: 0, enriched: 0, fullText: 0, abstracts: 0, unavailable: 0, notes: [] as string[] }
      : await enrichResearchResultsWithStructuredEvidence(results, { limit });

    const domainPolicy = researchDomainPolicyLabel(options);
    const extractionDetail = structuredEvidenceNote(enrichment, options.mode === "articles" && !named);
    run.plan = [{
      id: "research-retrieval-policy",
      label: "Применили фильтры до поиска",
      tool: null,
      status: "done",
      detail: [
        `Что получить: ${researchModeLabel(options.mode)}`,
        `Источники: ${researchSourceScopeLabel(options.sourceScope)}`,
        `Тип: ${researchContentScopeLabel(options.contentScope)}`,
        domainPolicy ? `Сайты: ${domainPolicy}` : null,
      ].filter(Boolean).join(" · "),
      connectorIds: [],
    }, ...run.plan, {
      id: "research-structured-evidence",
      label: "Извлекли и нормализовали параметры исследований",
      tool: "retrieveDocument",
      status: enrichment.enriched ? "done" : "skipped",
      detail: extractionDetail,
      connectorIds: enrichment.attempted ? ["pubmed"] : [],
    }];
    if (enrichment.attempted) {
      run.toolsUsed = [...run.toolsUsed, {
        tool: "retrieveDocument",
        connectorIds: ["pubmed"],
        modes: ["LIVE"],
        status: enrichment.unavailable === enrichment.attempted ? "unavailable" : enrichment.unavailable ? "partial" : "ok",
        itemCount: enrichment.enriched,
        durationMs: Date.now() - enrichmentStarted,
        note: extractionDetail,
      }];
    }

    if (run.synthesis?.includes(OLD_FULL_TEXT_GAP) && (!skipStructuredRetrieval || named)) {
      const replacement = enrichment.fullText
        ? `Полный текст получен для ${countLabel(enrichment.fullText, ["публикации", "публикаций", "публикаций"])}${enrichment.abstracts ? `, для ${countLabel(enrichment.abstracts, ["публикации", "публикаций", "публикаций"])} — только аннотация` : ""}. Параметры исследований указаны только там, где они явно есть в тексте`
        : enrichment.abstracts
          ? `Полный текст статей недоступен, для ${countLabel(enrichment.abstracts, ["публикации", "публикаций", "публикаций"])} использована аннотация. Параметры исследований указаны только там, где они явно есть в тексте`
          : OLD_FULL_TEXT_GAP;
      run.synthesis = run.synthesis.replace(OLD_FULL_TEXT_GAP, replacement);
    }
    // What text was read is a property of each record (shown in the answer and the trace), not a safety notice.
    return enrichment.attempted ? enrichment.results : results;
  };

  const outcome = await runAgent(
    { store, sessionId, catalog, rehydrated, finishing },
    { agentId: "research", specialty, profile, trigger: "composer", text, routed, run: queued.run ?? null, job: queued.job ?? null, intent: queued.intent ?? null, answerMode: queued.answerMode ?? ANSWER_MODE_FOR[options.mode] },
  );

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
