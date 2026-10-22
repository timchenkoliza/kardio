import { countLabel } from "@/lib/agents/format";
import { truncate } from "@/lib/agents/text";
import type { Evidence, EvidenceLevel, IntegrationMode, PlanStep, ResultActionKind, ResultKind, RunExperience, ToolUse } from "@/lib/agents/types";
import { compileExperience, type CompileInput, type CompileOutput } from "@/lib/mesh/compiler";
import type { EvidenceGraph, NormalizedClaim, NormalizedDocument, SourceInvocation, SourceResult } from "@/lib/mesh/evidence";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import { compareShadow, shadowSide, type RunExecution, type ShadowComparison } from "@/lib/mesh/execution";
import type { FlowRun } from "@/lib/mesh/flow-runtime";
import { compileIntent, type NormalizedIntent } from "@/lib/mesh/intent";
import { REQUIREMENT_LABEL } from "@/lib/mesh/jobs";
import type { ManifestExecution } from "@/lib/mesh/manifest";
import { planSources, type ExecutionPlan } from "@/lib/mesh/planner";
import { askedSections, openingView, viewDirectives } from "@/lib/mesh/refine";
import { drugSectionGroup } from "@/lib/presentation/physician";
import { compileWithSkill, executionRecord } from "@/lib/mesh/skill-compile";
import type { IntentSkill } from "@/lib/mesh/skills/types";
import type { SourceId, SourceStatusReport } from "@/lib/mesh/sources";
import type { Strategy } from "@/lib/mesh/strategy";
import type { AgentContext } from "@/server/agents/context";
import type { ResultDraft } from "@/server/agents/drafts";
import type { ExecutorResult } from "@/server/agents/plan";
import { changeFromPolicyFindings } from "./changes";
import { executePlan, type StepEvent } from "./execute";
import { fingerprint } from "./fingerprint";
import { knowledgeStore } from "./knowledge";
import { createSourceRegistry, descriptors, type SourceRegistry } from "./sources/registry";
import { recordSkillCandidates } from "./skill-candidates";
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

const META_FAMILIES = new Set(["sources", "handoff", "next_actions", "notices"]);

/**
 * Progressive result: after every source answer, the partial evidence graph
 * (pending sources marked as being checked, never as gaps) is compiled and
 * validated by the same policy gates as the final one. Only a manifest that
 * passes them and carries at least one content module is published; nothing
 * speculative reaches the page. Progress (pending sources) is published
 * either way.
 */
function progressivePublisher(args: { ctx: AgentContext; intent: NormalizedIntent; plan: ExecutionPlan; registry: SourceRegistry; sources: ReturnType<typeof descriptors>; statuses: Record<SourceId, SourceStatusReport>; graphId: string; extras?: Partial<CompileInput> }) {
  const { ctx, intent, plan, registry } = args;
  const done: SourceResult[] = [];
  const open = new Set(plan.steps.map(step => step.id));
  const slow = new Set<string>();
  const total = plan.steps.filter(step => step.role !== "handoff").length;
  // A Skill's takeaway priority and explanation apply from the first module; flow branches need the complete graph.
  const compileInput: Omit<CompileInput, "graph"> = { user: { signals: ["specialty", ...ctx.preference.topics.map(topic => `saved_topic:${topic}`)], topics: ctx.preference.topics }, modules: intent.modules, policy: { descriptors: args.sources }, scenario: intent.context.scenario, resultKeys: {}, answerMode: ctx.answerMode ?? null, ...args.extras };
  const publish = () => {
    const pendingSteps = plan.steps.filter(step => open.has(step.id) && step.role !== "handoff");
    const pending = [...new Map(pendingSteps.map(step => [registry[step.sourceId].name, { name: registry[step.sourceId].name, slow: slow.has(step.id) }])).values()];
    let experience: RunExperience | null = null;
    if (done.some(result => result.documents.length)) {
      const graph = buildEvidenceGraph({ id: args.graphId, intent, plan, results: done, descriptors: args.sources, statuses: args.statuses, now: ctx.nowIso, pending: [...open] });
      const output = compileExperience({ ...compileInput, graph });
      const useful = output.manifest.modules.some(entry => !META_FAMILIES.has(entry.family));
      if (!output.fallback && useful) experience = { intentId: intent.id, manifest: output.manifest, graph, plan: { id: plan.id, steps: plan.steps.length, invocations: plan.budget.planned, reused: false } };
    }
    ctx.progress?.publish({ experience, pending, stepsDone: total - pendingSteps.length, stepsTotal: total });
  };
  return {
    onStep(event: StepEvent) {
      if (event.kind === "slow") slow.add(event.stepId);
      else {
        open.delete(event.stepId);
        if (event.kind === "done") done.push(event.result);
      }
      // A fallback waiting for its primary is still pending; once nothing is open the final compile takes over.
      if (open.size) publish();
    },
  };
}

interface PlannedRun {
  intent: NormalizedIntent;
  plan: ExecutionPlan;
  results: SourceResult[];
  skipped: string[];
  reused: boolean;
  graph: EvidenceGraph;
  /** Knowledge-store key of this intent's evidence. */
  key: string;
  durationMs: number;
}

interface SourceEnv {
  registry: SourceRegistry;
  sources: ReturnType<typeof descriptors>;
  statuses: Record<SourceId, SourceStatusReport>;
}

/** intent → plan → sources (progressive when a sink is given) → evidence graph. */
async function gather(ctx: AgentContext, env: SourceEnv, intent: NormalizedIntent, args: { progressive: boolean; extras?: Partial<CompileInput>; record: boolean; knowledge: boolean }): Promise<PlannedRun> {
  const started = Date.now();
  const plan = planSources({ intent, sources: env.sources, statuses: env.statuses, excludedConnectors: ctx.preference.excludedSources });
  const sessionId = ctx.sessionId ?? null;
  if (args.record) await recordMeshEvent(sessionId, "source_plan_created", { specialty: ctx.specialty, job: intent.job.primary, planId: plan.id, steps: plan.steps.length, invocations: plan.budget.planned, rejected: plan.rejected.length, unmet: plan.unmet.length });
  const store = knowledgeStore();
  const key = `${intent.id}|${fingerprint(ctx.preference.excludedSources.join(","))}`;
  const reusable = args.knowledge ? store.fresh(key, ctx.now, REUSE_MS) : null;
  let results: SourceResult[];
  let skipped: string[] = [];
  if (reusable && reusable.plan.steps.map(step => step.sourceId).join() === plan.steps.map(step => step.sourceId).join()) {
    results = reusable.results;
    skipped = plan.steps.filter(step => !results.some(result => result.invocation.stepId === step.id)).map(step => step.id);
  } else {
    const progressive = args.progressive && ctx.progress ? progressivePublisher({ ctx, intent, plan, registry: env.registry, sources: env.sources, statuses: env.statuses, graphId: `graph-${ctx.nowIso}-${intent.id}`, extras: args.extras }) : null;
    const execution = await executePlan({ plan, intent, registry: env.registry, ctx, sessionId: args.record ? sessionId : null, ...(progressive ? { onStep: progressive.onStep } : {}) });
    results = execution.results;
    skipped = execution.skipped;
  }
  const reused = results === reusable?.results;
  const graph = buildEvidenceGraph({ id: `graph-${ctx.nowIso}-${intent.id}`, intent, plan, results, descriptors: env.sources, statuses: env.statuses, now: ctx.nowIso });
  if (args.record) await recordMeshEvent(sessionId, "evidence_graph_built", { specialty: ctx.specialty, job: intent.job.primary, planId: plan.id, documents: graph.documents.length, claims: graph.claims.length, conflicts: graph.conflicts.length, reason: reused ? "knowledge_reuse" : undefined });
  return { intent, plan, results, skipped, reused, graph, key, durationMs: Date.now() - started };
}

function manifestExecution(strategy: Strategy | null, skill: IntentSkill | null, flow: FlowRun | null): ManifestExecution | null {
  return strategy ? executionRecord(skill, flow) : null;
}

export interface EvidenceAnswerResult extends ExecutorResult {
  experience: RunExperience | null;
  execution: RunExecution | null;
  /** Shadow comparison to run after the primary result is saved (never delays the physician). */
  shadow: (() => Promise<ShadowComparison | null>) | null;
}

export async function evidenceAnswer(ctx: AgentContext): Promise<EvidenceAnswerResult> {
  const question = ctx.inputText?.trim() ?? "";
  if (!question) {
    return { intent: ctx.job ?? "answer", plan: [{ id: "step-1", label: "Нужен вопрос", tool: null, status: "skipped", detail: "Напишите вопрос, препарат или тему", connectorIds: [] }], toolsUsed: [], drafts: [], synthesis: null, notices: [], experience: null, execution: null, shadow: null };
  }
  const strategy = ctx.strategy ?? null;
  const intent = strategy?.intent ?? ctx.intent ?? compileIntent(question, ctx.specialty, { job: ctx.job });
  const primarySkill = strategy?.executionClass === "skill" && strategy.mode === "primary" ? strategy.skill : null;
  const registry = createSourceRegistry(ctx.browserDriver !== undefined ? { browserDriver: ctx.browserDriver } : {});
  const sources = descriptors(registry);
  const statuses = Object.fromEntries(await Promise.all(Object.values(registry).map(async adapter => [adapter.id, await adapter.status()] as const))) as Record<SourceId, SourceStatusReport>;
  const env: SourceEnv = { registry, sources, statuses };
  const sessionId = ctx.sessionId ?? null;
  const started = Date.now();

  if (strategy?.skill && strategy.flow) await recordMeshEvent(sessionId, "intent_skill_matched", { specialty: ctx.specialty, job: intent.job.primary, skillId: strategy.skill.id, skillVersion: strategy.skill.version, confidence: strategy.matched?.confidence, mode: strategy.mode ?? undefined });
  if (primarySkill && strategy?.flow) await recordMeshEvent(sessionId, "intent_flow_started", { specialty: ctx.specialty, skillId: primarySkill.id, flowId: strategy.flow.id, skillVersion: strategy.flow.version });
  if (strategy?.executionClass === "dynamic") {
    await recordMeshEvent(sessionId, "dynamic_plan_used", { specialty: ctx.specialty, job: intent.job.primary, signature: strategy.signature });
    // A repeated novel request shape becomes a Skill candidate — a proposed, blocked Change, never a library edit.
    await recordSkillCandidates({ now: ctx.now, sessionId }).catch(() => []);
  }

  const extras: Partial<CompileInput> = primarySkill ? { takeaway: primarySkill.experiencePolicy.takeaway?.[intent.job.family] ?? null, execution: manifestExecution(strategy, primarySkill, null) } : { execution: manifestExecution(strategy, null, null) };
  const gathered = await gather(ctx, env, intent, { progressive: true, extras, record: true, knowledge: true });
  const { plan, results, skipped, reused } = gathered;
  let graph = gathered.graph;

  const documents = results.flatMap(result => result.documents).filter((document, index, all) => all.findIndex(item => item.id === document.id) === index);
  const connectorOf = (sourceId: SourceId) => registry[sourceId].connectorId;
  const drafts = draftsFromDocuments(ctx, documents, connectorOf);
  const resultKeys = Object.fromEntries(drafts.map(draft => [String(draft.attributes.documentId), `${ctx.agentId}:${draft.key}`]));
  const base: Omit<CompileInput, "graph"> = { user: { signals: ["specialty", ...ctx.preference.topics.map(topic => `saved_topic:${topic}`)], topics: ctx.preference.topics }, modules: intent.modules, policy: { descriptors: sources }, scenario: intent.context.scenario, resultKeys, answerMode: ctx.answerMode ?? null };
  // The question opens with what it asked for: the named instruction sections first, «что изменилось» as a comparison.
  const opening = openingView(question, intent.job.family);
  const asked = intent.job.family === "drug" ? askedSections(question) : [];
  const directives = opening ? viewDirectives(graph, null, opening, graph) : { moduleProps: {}, priorityClaims: [] as string[] };
  const askedClaims = asked.length ? graph.claims.filter(claim => {
    const chunk = claim.chunkId ? graph.chunks.find(item => item.id === claim.chunkId) : undefined;
    return (asked as readonly string[]).includes(drugSectionGroup(chunk?.heading));
  }).map(claim => claim.id) : [];
  const shaping = { moduleProps: { ...directives.moduleProps, ...(asked.length ? { drug_reference: { ...(directives.moduleProps.drug_reference ?? {}), asked } } : {}) }, priorityClaims: [...askedClaims, ...directives.priorityClaims], view: opening };
  let output: CompileOutput;
  let flow: FlowRun | null = null;
  let skillFallback: string | null = null;
  if (primarySkill && strategy) {
    const shaped = compileWithSkill(base, graph, primarySkill, strategy.flow, shaping);
    output = shaped.output;
    flow = shaped.flow;
    graph = shaped.graph;
    skillFallback = shaped.fallback;
    if (flow) {
      await Promise.all([
        ...flow.trace.steps.filter(step => step.status !== "not_taken").map(step => recordMeshEvent(sessionId, "intent_flow_step_completed", { specialty: ctx.specialty, flowId: flow!.trace.flowId, stepId: step.id, status: step.status })),
        ...flow.trace.branches.map(branch => recordMeshEvent(sessionId, "intent_flow_branch_taken", { specialty: ctx.specialty, flowId: flow!.trace.flowId, stepId: branch.split(":")[0], branch: branch.split(":")[1] })),
      ]);
    }
    if (skillFallback) await recordMeshEvent(sessionId, "experience_fallback_used", { specialty: ctx.specialty, job: intent.job.primary, planId: plan.id, reason: skillFallback.slice(0, 80), skillId: primarySkill.id });
  } else {
    // A named section is the whole takeaway: the rest of the instruction stays one click away.
    output = compileExperience({ ...base, graph, ...extras, ...shaping, ...(askedClaims.length ? { takeaway: [] } : {}) });
  }
  await recordMeshEvent(sessionId, "experience_manifest_compiled", { specialty: ctx.specialty, job: intent.job.primary, planId: plan.id, modules: output.manifest.modules.length, findings: output.report.findings.length, blocking: output.rejected?.blocking ?? 0 });
  if (output.fallback) {
    await recordMeshEvent(sessionId, "experience_fallback_used", { specialty: ctx.specialty, job: intent.job.primary, planId: plan.id, reason: output.manifest.compiler.warnings[0]?.split(":")[0] ?? "unknown", blocking: output.rejected?.blocking ?? 0 });
    if (output.rejected) await changeFromPolicyFindings({ findings: output.rejected.findings, manifest: output.manifest, now: ctx.nowIso, sessionId });
  }
  if (!reused) knowledgeStore().registerExperience({ key: gathered.key, scenario: intent.context.scenario, intent, plan, results, statuses, descriptors: sources, compile: base, graph: gathered.graph, manifest: output.manifest });

  const trace = traceFor(plan, results, registry, skipped, reused);
  trace.plan.unshift({ id: "step-0", label: "Разобрали запрос", tool: null, status: "done", detail: [...intent.job.reasons, ...(primarySkill ? [primarySkill.experiencePolicy.explanation] : [])].join(" · "), connectorIds: [] });
  // The last step says what actually happened: an answer, nothing found, sources that did not answer, or no search at all.
  const searched = graph.sources.some(source => source.invoked && (source.outcome === "ok" || source.outcome === "empty"));
  const broken = graph.sources.some(source => source.invoked && (source.outcome === "failed" || source.outcome === "unavailable"));
  const final: PlanStep = graph.documents.length
    ? { id: "", label: "Собрали ответ из источников", tool: null, status: "done", detail: `${countLabel(graph.claims.length, ["выдержка", "выдержки", "выдержек"])}${graph.conflicts.length ? ` · расхождений: ${graph.conflicts.length}` : ""}`, connectorIds: [] }
    : intent.vague || !searched && !broken
      ? { id: "", label: "Поиск не выполнялся", tool: null, status: "skipped", detail: "В вопросе не распознаны заболевание, препарат или тема — искать было нечего", connectorIds: [] }
      : broken && !searched
        ? { id: "", label: "Ответ не собран", tool: null, status: "failed", detail: "Источники не ответили — результат не установлен", connectorIds: [] }
        : { id: "", label: "Ответ не собран", tool: null, status: "done", detail: "Поиск выполнен, подходящих материалов не нашлось", connectorIds: [] };
  trace.plan.push({ ...final, id: `step-${trace.plan.length + 1}` });
  const experience: RunExperience = { intentId: intent.id, manifest: output.manifest, graph, plan: { id: plan.id, steps: plan.steps.length, invocations: plan.budget.planned, reused } };
  const totalMs = Date.now() - started;
  const execution: RunExecution | null = strategy ? {
    class: strategy.executionClass === "skill" ? "skill" : "dynamic",
    explanation: primarySkill ? primarySkill.experiencePolicy.explanation : null,
    skill: strategy.skill && strategy.matched ? { id: strategy.skill.id, version: strategy.skill.version, mode: strategy.skill.rollout.mode, confidence: strategy.matched.confidence, reasons: strategy.matched.reasons.slice(0, 6) } : null,
    alternatives: strategy.alternatives.map(item => ({ id: item.skillId, confidence: item.confidence })),
    flow: flow?.trace ?? null,
    signature: strategy.signature,
    resolution: strategy.resolution,
    fallback: skillFallback ? { reason: skillFallback } : null,
    shadow: null,
    timings: { totalMs, firstModuleMs: null },
  } : null;

  // Shadow: the Skill runs alongside the generic answer — after it is saved — and is compared, never shown.
  const shadowSkill = strategy?.executionClass === "skill" && strategy.mode === "shadow" && strategy.skill && strategy.skillIntent ? strategy.skill : null;
  const shadow = shadowSkill && strategy ? async (): Promise<ShadowComparison | null> => {
    const skillIntent = strategy.skillIntent!;
    const run = await gather(ctx, env, skillIntent, { progressive: false, record: false, knowledge: false });
    const skillBase: Omit<CompileInput, "graph"> = { ...base, modules: skillIntent.modules, scenario: skillIntent.context.scenario, resultKeys: {} };
    const shaped = compileWithSkill(skillBase, run.graph, shadowSkill, strategy.flow);
    const comparison = compareShadow({
      skillId: shadowSkill.id, version: shadowSkill.version, flowId: shadowSkill.flowId, at: new Date().toISOString(),
      generic: shadowSide(output.manifest, graph, { durationMs: gathered.durationMs }),
      skill: shadowSide(shaped.output.manifest, shaped.graph, { durationMs: run.durationMs, branches: shaped.flow?.trace.branches ?? [] }),
    });
    await recordMeshEvent(sessionId, "intent_skill_shadow_compared", { specialty: ctx.specialty, skillId: shadowSkill.id, skillVersion: shadowSkill.version, verdict: comparison.verdict, reason: comparison.reasons.join(";").slice(0, 120) || undefined, durationMs: run.durationMs });
    return comparison;
  } : null;

  return {
    intent: ctx.job ?? intent.job.family,
    plan: trace.plan,
    toolsUsed: trace.toolsUsed,
    drafts,
    synthesis: synthesisOf(graph, intent, question),
    notices: [],
    experience,
    execution,
    shadow,
  };
}
