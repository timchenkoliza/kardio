import { countLabel } from "@/lib/agents/format";
import { truncate } from "@/lib/agents/text";
import type { Evidence, EvidenceLevel, IntegrationMode, PlanStep, ResultActionKind, ResultKind, RunExperience, ToolUse } from "@/lib/agents/types";
import { compileExperience } from "@/lib/mesh/compiler";
import type { EvidenceGraph, NormalizedClaim, NormalizedDocument, SourceInvocation, SourceResult } from "@/lib/mesh/evidence";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { compileIntent, type NormalizedIntent } from "@/lib/mesh/intent";
import { REQUIREMENT_LABEL } from "@/lib/mesh/jobs";
import { planSources, type ExecutionPlan } from "@/lib/mesh/planner";
import type { SourceId, SourceStatusReport } from "@/lib/mesh/sources";
import type { AgentContext } from "@/server/agents/context";
import type { ResultDraft } from "@/server/agents/drafts";
import type { ExecutorResult } from "@/server/agents/plan";
import { changeFromPolicyFindings } from "./changes";
import { executePlan } from "./execute";
import { fingerprint } from "./fingerprint";
import { knowledgeStore } from "./knowledge";
import { createSourceRegistry, descriptors, type SourceRegistry } from "./sources/registry";
import { recordMeshEvent } from "./telemetry";

/**
 * The evidence_answer capability:
 *
 *   intent → SourcePlanner → source adapters → EvidenceGraph → ExperienceManifest
 *
 * Runs inside the existing supervisor, so input risk gates, evidence
 * validation, persistence, saves and telemetry stay exactly as they are.
 * Drafts are a projection of graph documents for persistence; what the
 * physician sees is the compiled manifest.
 */

/** Compiled experiences of the same scenario are reused for this long (sources change far less often than they are asked). */
const REUSE_MS = 6 * 3_600_000;

const KIND: Record<NormalizedDocument["kind"], ResultKind> = {
  drug_instruction: "drug_label",
  drug_label: "drug_label",
  inn_listing: "drug_label",
  guideline: "guideline_change",
  society_guideline_summary: "guideline_change",
  guideline_publication: "reference_answer",
  review: "reference_answer",
  regulatory_signal: "drug_change",
  catalog_item: "research_finding",
};

const LEVEL: Record<NormalizedDocument["kind"], EvidenceLevel> = {
  drug_instruction: "regulatory",
  drug_label: "regulatory",
  inn_listing: "catalog_metadata",
  guideline: "guideline",
  society_guideline_summary: "guideline",
  guideline_publication: "guideline",
  review: "peer_reviewed",
  regulatory_signal: "regulatory",
  catalog_item: "catalog_metadata",
};

function evidenceOf(claim: NormalizedClaim, document: NormalizedDocument, connectorId: string): Evidence {
  return {
    id: claim.id,
    claim: claim.statement,
    sourceId: document.sourceId,
    sourceUrl: document.url,
    sourceType: LEVEL[document.kind],
    publicationDate: document.publishedAt,
    retrievedAt: document.retrievedAt,
    evidenceLevel: LEVEL[document.kind],
    confidence: claim.confidence,
    verificationStatus: claim.verification,
    verificationNote: claim.verificationNote,
    supportText: claim.quote,
    provenance: {
      connectorId,
      source: document.publisher ?? document.title,
      sourceUrl: document.url,
      publisher: document.publisher,
      retrievedAt: document.retrievedAt,
      publishedAt: document.publishedAt,
      version: document.version.label,
      ownership: "PUBLIC_SOURCE",
      dataOrigin: document.state === "LIVE" ? "runtime_api" : document.sourceId === "goldenset_catalog" ? "catalog_snapshot" : "curated_snapshot",
      ...(typeof document.attributes.journal === "string" ? { journal: document.attributes.journal } : {}),
    },
  };
}

/** Graph documents → persisted results (identity, saves, activation telemetry). */
export function draftsFromDocuments(ctx: AgentContext, documents: readonly NormalizedDocument[], connectorOf: (sourceId: SourceId) => string): ResultDraft[] {
  return documents.map((document, index) => {
    const connectorId = connectorOf(document.sourceId);
    const evidence = document.claims.map(claim => evidenceOf(claim, document, connectorId));
    const internal = typeof document.attributes.internalHref === "string" ? document.attributes.internalHref : null;
    const actions: Array<{ kind: ResultActionKind; label: string; href: string | null; requiresConfirmation: boolean }> = [
      internal ? { kind: "open_internal", label: "Открыть", href: internal, requiresConfirmation: false } : { kind: "open_source", label: "Открыть источник", href: document.url, requiresConfirmation: false },
      { kind: "save", label: "Сохранить", href: null, requiresConfirmation: false },
    ];
    const kind = document.kind === "review" && !document.claims.length ? "research_finding" : KIND[document.kind];
    return {
      key: `mesh:${document.id}`,
      agentId: ctx.agentId,
      specialty: ctx.specialty,
      kind,
      category: document.kind,
      title: truncate(document.title, 220),
      summary: [document.publisher, document.version.label, document.version.date ?? document.publishedAt].filter(Boolean).join(" · "),
      reasonShown: [document.authority === "official" ? "Официальный источник" : document.authority === "professional" ? "Профессиональный источник, вторичная публикация" : document.authority === "primary" ? "Первичная публикация" : "Обзор публикации"],
      // A sortable timestamp: a year- or month-precision version date falls back to the source's full date.
      observedAt: document.version.date && document.version.date.length >= 10 ? document.version.date : document.publishedAt ?? document.version.date,
      evidence,
      source: { ...evidence[0]?.provenance ?? { connectorId, source: document.publisher ?? document.title, sourceUrl: document.url, publisher: document.publisher, retrievedAt: document.retrievedAt, publishedAt: document.publishedAt, version: document.version.label, ownership: "PUBLIC_SOURCE" as const, dataOrigin: "runtime_api" as const } },
      actions,
      attributes: { documentId: document.id, documentKind: document.kind, jurisdiction: document.jurisdiction, ...Object.fromEntries(Object.entries(document.attributes).filter(([, value]) => typeof value !== "object" || value === null)) },
      partner: null,
      rank: index + 1,
    };
  });
}

const TOOL_STATUS: Record<SourceInvocation["outcome"], ToolUse["status"]> = { ok: "ok", empty: "ok", failed: "failed", unavailable: "unavailable", handoff: "unavailable", blocked: "blocked" };
const MODE: Record<string, IntegrationMode> = { LIVE: "LIVE", LIMITED: "LIVE", SNAPSHOT: "LIVE", HANDOFF: "UNAVAILABLE", UNAVAILABLE: "UNAVAILABLE" };

function traceFor(plan: ExecutionPlan, results: readonly SourceResult[], registry: SourceRegistry, skipped: readonly string[], reused: boolean): { plan: PlanStep[]; toolsUsed: ToolUse[] } {
  const steps: PlanStep[] = [];
  const tools: ToolUse[] = [];
  for (const step of plan.steps) {
    const adapter = registry[step.sourceId];
    const invocation = results.find(result => result.invocation.stepId === step.id)?.invocation;
    const label = `${REQUIREMENT_LABEL[step.requirement][0].toLocaleUpperCase("ru-RU")}${REQUIREMENT_LABEL[step.requirement].slice(1)}: ${adapter.name}`;
    if (!invocation) {
      steps.push({ id: step.id, label, tool: "readSource", status: "skipped", detail: skipped.includes(step.id) ? "Не понадобилось: основной источник уже ответил" : "Не выполнялось", connectorIds: [adapter.connectorId] });
      continue;
    }
    const found = invocation.documentIds.length;
    const detail = invocation.outcome === "handoff"
      ? `Проверка по ссылке${invocation.note ? ` — ${invocation.note}` : ""}`
      : invocation.outcome === "ok" ? `${countLabel(found, ["документ", "документа", "документов"])}${reused ? " · из недавно проверенных" : ""}${invocation.note ? ` · ${invocation.note}` : ""}`
        : invocation.note ?? (invocation.outcome === "empty" ? "Ничего не нашлось" : "Источник не ответил");
    steps.push({ id: step.id, label, tool: "readSource", status: invocation.outcome === "failed" ? "failed" : invocation.outcome === "ok" ? "done" : "skipped", detail, connectorIds: [adapter.connectorId] });
    if (invocation.outcome !== "handoff") tools.push({ tool: "readSource", connectorIds: [adapter.connectorId], modes: [MODE[invocation.status] ?? "LIVE"], status: TOOL_STATUS[invocation.outcome], itemCount: found, durationMs: invocation.durationMs, note: invocation.errorCode ?? invocation.note });
  }
  return { plan: steps, toolsUsed: tools };
}

function synthesisOf(graph: EvidenceGraph, intent: NormalizedIntent, question: string): string {
  const counts = new Map<string, number>();
  for (const document of graph.documents) counts.set(document.kind, (counts.get(document.kind) ?? 0) + 1);
  const found = [
    counts.get("guideline") ? countLabel(counts.get("guideline")!, ["российский документ рекомендаций", "российских документа рекомендаций", "российских документов рекомендаций"]) : null,
    counts.get("drug_instruction") ? countLabel(counts.get("drug_instruction")!, ["российская инструкция", "российские инструкции", "российских инструкций"]) : null,
    counts.get("drug_label") ? `${countLabel(counts.get("drug_label")!, ["инструкция", "инструкции", "инструкций"])} FDA` : null,
    counts.get("society_guideline_summary") ? countLabel(counts.get("society_guideline_summary")!, ["рекомендация общества", "рекомендации обществ", "рекомендаций обществ"]) : null,
    (counts.get("review") ?? 0) + (counts.get("guideline_publication") ?? 0) ? countLabel((counts.get("review") ?? 0) + (counts.get("guideline_publication") ?? 0), ["публикация", "публикации", "публикаций"]) : null,
  ].filter(Boolean);
  const lines = [found.length ? `По запросу «${truncate(question, 120)}» найдено: ${found.join(", ")}. Выдержки приведены дословно, со ссылкой и датой; продукт их не пересказывает.` : `По запросу «${truncate(question, 120)}» подходящих источников не нашлось.`];
  if (graph.conflicts.length) lines.push(`Источники расходятся: ${countLabel(graph.conflicts.length, ["расхождение", "расхождения", "расхождений"])} — показаны обе стороны с датами.`);
  const boundary = intent.entities.drugs.length ? " Официальный статус регистрации и инструкции в России проверяйте в ГРЛС." : "";
  if (graph.gaps.length) lines.push(`Чего не хватает: ${graph.gaps.join("; ")}.${boundary}`);
  else if (boundary) lines.push(boundary.trim());
  if (intent.job.family === "guidelines" || graph.documents.some(document => document.kind === "guideline")) lines.push("Действующую версию клинических рекомендаций проверяйте в рубрикаторе Минздрава.");
  return lines.join("\n\n");
}

export async function evidenceAnswer(ctx: AgentContext): Promise<ExecutorResult & { experience: RunExperience | null }> {
  const question = ctx.inputText?.trim() ?? "";
  if (!question) {
    return { intent: ctx.job ?? "answer", plan: [{ id: "step-1", label: "Нужен вопрос", tool: null, status: "skipped", detail: "Напишите вопрос, препарат или тему", connectorIds: [] }], toolsUsed: [], drafts: [], synthesis: null, notices: [], experience: null };
  }
  const intent = ctx.intent ?? compileIntent(question, ctx.specialty, { job: ctx.job });
  const registry = createSourceRegistry(ctx.browserDriver !== undefined ? { browserDriver: ctx.browserDriver } : {});
  const sources = descriptors(registry);
  const statuses = Object.fromEntries(await Promise.all(Object.values(registry).map(async adapter => [adapter.id, await adapter.status()] as const))) as Record<SourceId, SourceStatusReport>;
  const plan = planSources({ intent, sources, statuses, excludedConnectors: ctx.preference.excludedSources });
  const sessionId = ctx.sessionId ?? null;
  await recordMeshEvent(sessionId, "source_plan_created", { specialty: ctx.specialty, job: intent.job.primary, planId: plan.id, steps: plan.steps.length, invocations: plan.budget.planned, rejected: plan.rejected.length, unmet: plan.unmet.length });

  const store = knowledgeStore();
  const key = `${intent.id}|${fingerprint(ctx.preference.excludedSources.join(","))}`;
  const reusable = store.fresh(key, ctx.now, REUSE_MS);
  let results: SourceResult[];
  let skipped: string[] = [];
  if (reusable && reusable.plan.steps.map(step => step.sourceId).join() === plan.steps.map(step => step.sourceId).join()) {
    results = reusable.results;
    skipped = plan.steps.filter(step => !results.some(result => result.invocation.stepId === step.id)).map(step => step.id);
  } else {
    const execution = await executePlan({ plan, intent, registry, ctx, sessionId });
    results = execution.results;
    skipped = execution.skipped;
  }
  const reused = results === reusable?.results;

  const graph = buildEvidenceGraph({ id: `graph-${ctx.nowIso}-${intent.id}`, intent, plan, results, descriptors: sources, statuses, now: ctx.nowIso });
  await recordMeshEvent(sessionId, "evidence_graph_built", { specialty: ctx.specialty, job: intent.job.primary, planId: plan.id, documents: graph.documents.length, claims: graph.claims.length, conflicts: graph.conflicts.length, reason: reused ? "knowledge_reuse" : undefined });

  const documents = results.flatMap(result => result.documents).filter((document, index, all) => all.findIndex(item => item.id === document.id) === index);
  const connectorOf = (sourceId: SourceId) => registry[sourceId].connectorId;
  const drafts = draftsFromDocuments(ctx, documents, connectorOf);
  const resultKeys = Object.fromEntries(drafts.map(draft => [String(draft.attributes.documentId), `${ctx.agentId}:${draft.key}`]));
  const compileInput = { user: { signals: ["specialty", ...ctx.preference.topics.map(topic => `saved_topic:${topic}`)], topics: ctx.preference.topics }, modules: intent.modules, policy: { descriptors: sources }, scenario: intent.context.scenario, resultKeys };
  const output = compileExperience({ ...compileInput, graph });
  await recordMeshEvent(sessionId, "experience_manifest_compiled", { specialty: ctx.specialty, job: intent.job.primary, planId: plan.id, modules: output.manifest.modules.length, findings: output.report.findings.length, blocking: output.rejected?.blocking ?? 0 });
  if (output.fallback) {
    await recordMeshEvent(sessionId, "experience_fallback_used", { specialty: ctx.specialty, job: intent.job.primary, planId: plan.id, reason: output.manifest.compiler.warnings[0]?.split(":")[0] ?? "unknown", blocking: output.rejected?.blocking ?? 0 });
    if (output.rejected) await changeFromPolicyFindings({ findings: output.rejected.findings, manifest: output.manifest, now: ctx.nowIso, sessionId });
  }
  if (!reused) store.registerExperience({ key, scenario: intent.context.scenario, intent, plan, results, statuses, descriptors: sources, compile: compileInput, graph, manifest: output.manifest });

  const trace = traceFor(plan, results, registry, skipped, reused);
  trace.plan.unshift({ id: "step-0", label: "Разобрали запрос", tool: null, status: "done", detail: intent.job.reasons.join(" · "), connectorIds: [] });
  trace.plan.push({ id: `step-${trace.plan.length + 1}`, label: "Собрали ответ из источников", tool: null, status: "done", detail: `${countLabel(graph.claims.length, ["выдержка", "выдержки", "выдержек"])}${graph.conflicts.length ? ` · расхождений: ${graph.conflicts.length}` : ""}`, connectorIds: [] });
  return {
    intent: ctx.job ?? intent.job.family,
    plan: trace.plan,
    toolsUsed: trace.toolsUsed,
    drafts,
    synthesis: synthesisOf(graph, intent, question),
    notices: [],
    experience: { intentId: intent.id, manifest: output.manifest, graph, plan: { id: plan.id, steps: plan.steps.length, invocations: plan.budget.planned, reused } },
  };
}
