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
 *
 * Interactive deadlines (no single source may block the physician's result):
 *   soft    a step that passes it is reported as slow; the result page keeps
 *           showing what is already validated
 *   hard    the step is cut: outcome failed, status LIMITED, the rest continues
 *   budget  the whole plan; a fallback that cannot start with enough time left
 *           is not started (LIMITED) instead of overrunning the request
 * source failure != request failure.
 */

export interface SourceDeadlines {
  softMs: number;
  hardMs: number;
  budgetMs: number;
  /** A step needs at least this much of the budget left to start. */
  minStartMs: number;
}

export const INTERACTIVE_DEADLINES: SourceDeadlines = { softMs: 4_000, hardMs: 18_000, budgetMs: 24_000, minStartMs: 1_500 };

function envMs(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function interactiveDeadlines(): SourceDeadlines {
  return {
    softMs: envMs("MESH_SOURCE_SOFT_MS", INTERACTIVE_DEADLINES.softMs),
    hardMs: envMs("MESH_SOURCE_HARD_MS", INTERACTIVE_DEADLINES.hardMs),
    budgetMs: envMs("MESH_BUDGET_MS", INTERACTIVE_DEADLINES.budgetMs),
    minStartMs: INTERACTIVE_DEADLINES.minStartMs,
  };
}

/**
 * Failure injection for remote verification of the deadline path — Preview
 * only, scoped to one branch, never in production and never by default:
 *
 *   KARDIO_FAULT_SOURCE_DELAY="pubmed:30000"   delay that source's answer
 *   KARDIO_FAULT_BRANCH="feature/intent-skills-flows"
 *
 * Both must be set, the deployment must be a Preview of exactly that branch.
 * The source itself is untouched: the delay is added before it is called.
 */
export function injectedDelayMs(sourceId: string, env: Record<string, string | undefined> = process.env): number | null {
  const spec = env.KARDIO_FAULT_SOURCE_DELAY?.trim();
  const branch = env.KARDIO_FAULT_BRANCH?.trim();
  if (!spec || !branch) return null;
  if (env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== branch) return null;
  const [id, ms] = spec.split(":");
  const delay = Number(ms);
  return id === sourceId && Number.isFinite(delay) && delay > 0 ? Math.min(delay, 120_000) : null;
}

export type StepEvent =
  | { kind: "done"; stepId: string; result: SourceResult }
  | { kind: "skipped"; stepId: string }
  | { kind: "slow"; stepId: string };

export interface PlanExecution {
  results: SourceResult[];
  /** Fallback steps that were not needed. */
  skipped: string[];
}

async function withDeadline(promise: Promise<SourceResult>, ms: number, fallback: () => SourceResult): Promise<SourceResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<SourceResult>(resolve => { timer = setTimeout(() => resolve(fallback()), Math.max(0, ms)); });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function executePlan(args: { plan: ExecutionPlan; intent: NormalizedIntent; registry: SourceRegistry; ctx: SourceContext; sessionId: string | null; runId?: string; deadlines?: SourceDeadlines; startedAt?: number; onStep?: (event: StepEvent) => void; since?: number }): Promise<PlanExecution> {
  const { plan, intent, registry, ctx } = args;
  const deadlines = args.deadlines ?? interactiveDeadlines();
  const budgetEnd = (args.startedAt ?? Date.now()) + deadlines.budgetMs;
  const outcomes = new Map<string, Promise<SourceResult | null>>();
  const skipped: string[] = [];
  const emit = (event: StepEvent) => { try { args.onStep?.(event); } catch { /* progress must never break execution */ } };

  const run = (step: ExecutionStep): Promise<SourceResult | null> => {
    const existing = outcomes.get(step.id);
    if (existing) return existing;
    const promise = (async () => {
      if (step.runIf) {
        const previous = plan.steps.find(item => item.id === step.runIf!.previousEmpty);
        const prior = previous ? await run(previous) : null;
        if (prior && prior.documents.length > 0) { skipped.push(step.id); emit({ kind: "skipped", stepId: step.id }); return null; }
      }
      const adapter = registry[step.sourceId as SourceId];
      const started = Date.now();
      const remaining = budgetEnd - started;
      const hardMs = Math.min(deadlines.hardMs, remaining);
      const request = { stepId: step.id, operation: step.operation, requirement: step.requirement, intent, ctx, deadlineAt: started + Math.max(0, hardMs), ...(args.since ? { since: args.since } : {}) };
      let result: SourceResult;
      if (remaining < deadlines.minStartMs && step.role !== "handoff") {
        result = emptyResult(request, { sourceId: step.sourceId, outcome: "failed", status: "LIMITED", execution: adapter.execution, started, errorCode: "deadline:budget", note: "Не хватило времени — ответ собран без этого источника" });
      } else {
        const soft = setTimeout(() => emit({ kind: "slow", stepId: step.id }), deadlines.softMs);
        try {
          const fault = injectedDelayMs(step.sourceId);
          const execution = fault ? new Promise<void>(resolve => setTimeout(resolve, fault)).then(() => adapter.execute(request)) : adapter.execute(request);
          result = await withDeadline(execution, hardMs, () => emptyResult(request, { sourceId: step.sourceId, outcome: "failed", status: "LIMITED", execution: adapter.execution, started, errorCode: "deadline:hard", note: `Источник не ответил за ${Math.max(1, Math.round(hardMs / 1000))} с — ответ собран без него` }));
        } catch (error) {
          result = emptyResult(request, { sourceId: step.sourceId, outcome: "failed", status: "LIVE", execution: adapter.execution, started, errorCode: "unexpected", note: error instanceof Error ? error.message.slice(0, 160) : "ошибка источника" });
        } finally {
          clearTimeout(soft);
        }
      }
      // A source cut by time — by this deadline or by its own — is LIMITED, whichever fired first.
      if (result.invocation.outcome === "failed" && /^(?:deadline|timeout):/u.test(result.invocation.errorCode ?? "")) result = { ...result, invocation: { ...result.invocation, status: "LIMITED" } };
      const invocation = result.invocation;
      emit({ kind: "done", stepId: step.id, result });
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
