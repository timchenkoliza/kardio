import type { SourceResult } from "@/lib/mesh/evidence";
import type { NormalizedIntent } from "@/lib/mesh/intent";
import type { ExecutionPlan, ExecutionStep } from "@/lib/mesh/planner";
import type { SourceId } from "@/lib/mesh/sources";
import { emptyResult } from "./sources/common";
import type { SourceRegistry } from "./sources/registry";
import type { SourceContext } from "./sources/types";
import { recordMeshEvent } from "./telemetry";

/**
 * Executes an ExecutionPlan: primaries in parallel, fallbacks only after
 * their primary came back empty or failed, hand-offs without any network
 * call. Every step ends in a recorded invocation — a step that times out or
 * throws is a failure, never a silent success.
 */

const STEP_TIMEOUT_MS = 45_000;

export interface PlanExecution {
  results: SourceResult[];
  /** Fallback steps that were not needed. */
  skipped: string[];
}

async function withTimeout(promise: Promise<SourceResult>, step: ExecutionStep, fallback: () => SourceResult): Promise<SourceResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<SourceResult>(resolve => { timer = setTimeout(() => resolve(fallback()), STEP_TIMEOUT_MS); });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function executePlan(args: { plan: ExecutionPlan; intent: NormalizedIntent; registry: SourceRegistry; ctx: SourceContext; sessionId: string | null; runId?: string }): Promise<PlanExecution> {
  const { plan, intent, registry, ctx } = args;
  const outcomes = new Map<string, Promise<SourceResult | null>>();
  const skipped: string[] = [];

  const run = (step: ExecutionStep): Promise<SourceResult | null> => {
    const existing = outcomes.get(step.id);
    if (existing) return existing;
    const promise = (async () => {
      if (step.runIf) {
        const previous = plan.steps.find(item => item.id === step.runIf!.previousEmpty);
        const prior = previous ? await run(previous) : null;
        if (prior && prior.documents.length > 0) { skipped.push(step.id); return null; }
      }
      const adapter = registry[step.sourceId as SourceId];
      const request = { stepId: step.id, operation: step.operation, requirement: step.requirement, intent, ctx };
      const started = Date.now();
      let result: SourceResult;
      try {
        result = await withTimeout(adapter.execute(request), step, () => emptyResult(request, { sourceId: step.sourceId, outcome: "failed", status: "LIVE", execution: adapter.execution, started, errorCode: "timeout:step", note: "Источник не ответил вовремя" }));
      } catch (error) {
        result = emptyResult(request, { sourceId: step.sourceId, outcome: "failed", status: "LIVE", execution: adapter.execution, started, errorCode: "unexpected", note: error instanceof Error ? error.message.slice(0, 160) : "ошибка источника" });
      }
      const invocation = result.invocation;
      await recordMeshEvent(args.sessionId, "source_invoked", { specialty: intent.context.specialty, job: intent.job.primary, runId: args.runId, planId: plan.id, sourceId: step.sourceId, operation: step.operation, requirement: step.requirement, role: step.role, outcome: invocation.outcome, status: invocation.status, execution: invocation.execution, durationMs: invocation.durationMs, documents: result.documents.length, claims: result.documents.reduce((sum, document) => sum + document.claims.length, 0) });
      if (invocation.outcome === "failed" || invocation.outcome === "unavailable") {
        await recordMeshEvent(args.sessionId, "source_failed", { specialty: intent.context.specialty, job: intent.job.primary, runId: args.runId, planId: plan.id, sourceId: step.sourceId, operation: step.operation, outcome: invocation.outcome, errorCode: invocation.errorCode ?? invocation.outcome });
      }
      return result;
    })();
    outcomes.set(step.id, promise);
    return promise;
  };

  const results = (await Promise.all(plan.steps.map(run))).filter((item): item is SourceResult => Boolean(item));
  return { results, skipped };
}
