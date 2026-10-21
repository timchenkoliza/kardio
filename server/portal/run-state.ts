import type { AgentRun, RunProgress } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import type { ExperiencePatch } from "@/lib/mesh/patch";
import { workspaceStore } from "@/server/agents/store";
import { settleExpiredRun } from "./manager";

/**
 * What the result page and the status endpoint may say about a run id.
 * Every state is backed by evidence from durable storage:
 *
 *   available         the run exists in this session (any lifecycle state)
 *   run_not_found     no run with this id exists (in any session)
 *   session_mismatch  the run exists, but in another session
 *
 * «Another session or device» is said only for session_mismatch.
 */
export type RunAvailability = "available" | "run_not_found" | "session_mismatch";

/** Lifecycle as the physician sees it; `expired` = the execution was lost before it finished. */
export type RunPhase = AgentRun["status"] | "expired";

export interface RunLookup {
  availability: RunAvailability;
  run: AgentRun | null;
}

const RUN_ID = /^run-[0-9a-f-]{36}$/u;

export function isRunId(value: string | null | undefined): value is string {
  return typeof value === "string" && RUN_ID.test(value);
}

export async function lookupRun(sessionId: string | null, specialty: SpecialtyId, runId: string): Promise<RunLookup> {
  if (!isRunId(runId)) return { availability: "run_not_found", run: null };
  const store = workspaceStore();
  if (sessionId) {
    const run = await store.getRun(sessionId, runId);
    if (run && run.specialty === specialty) return { availability: "available", run: await settleExpiredRun(sessionId, run) };
    if (run) return { availability: "run_not_found", run: null };
  }
  const owner = await store.findRunSession(runId);
  return { availability: owner && owner !== sessionId ? "session_mismatch" : "run_not_found", run: null };
}

export function runPhase(run: AgentRun): RunPhase {
  return run.error === "execution_expired" ? "expired" : run.status;
}

export function isFinished(run: AgentRun): boolean {
  return Boolean(run.completedAt) || run.status === "failed" || run.status === "blocked" || run.status === "completed";
}

export interface RunStatusView {
  availability: RunAvailability;
  runId: string;
  phase: RunPhase | null;
  finished: boolean;
  manifestVersion: number;
  patch: ExperiencePatch | null;
  progress: Pick<RunProgress, "stepsDone" | "stepsTotal" | "pending" | "firstModuleMs"> | null;
  updatedAt: string | null;
  /** How the run was executed (ids and verdicts only — diagnostics, never rendered). */
  execution?: {
    class: string;
    skill: { id: string; version: string; mode: string; confidence: number } | null;
    branches: string[];
    fallback: string | null;
    shadow: { verdict: string; reasons: string[]; lostModules: string[]; addedModules: string[]; addedSources: string[]; genericMs: number; skillMs: number } | null;
    timings: { totalMs: number; firstModuleMs: number | null };
    patches: number;
  } | null;
}

export function runStatusView(runId: string, lookup: RunLookup): RunStatusView {
  const run = lookup.run;
  if (!run) return { availability: lookup.availability, runId, phase: null, finished: true, manifestVersion: 0, patch: null, progress: null, updatedAt: null };
  return {
    availability: "available",
    runId,
    phase: runPhase(run),
    finished: isFinished(run),
    manifestVersion: run.progress?.manifestVersion ?? 0,
    patch: run.progress?.patch ?? null,
    progress: run.progress ? { stepsDone: run.progress.stepsDone, stepsTotal: run.progress.stepsTotal, pending: run.progress.pending, firstModuleMs: run.progress.firstModuleMs } : null,
    updatedAt: run.progress?.updatedAt ?? run.completedAt ?? run.startedAt,
    execution: run.execution ? {
      class: run.execution.class,
      skill: run.execution.skill ? { id: run.execution.skill.id, version: run.execution.skill.version, mode: run.execution.skill.mode, confidence: run.execution.skill.confidence } : null,
      branches: run.execution.flow?.branches ?? [],
      fallback: run.execution.fallback?.reason ?? null,
      shadow: run.execution.shadow ? { verdict: run.execution.shadow.verdict, reasons: run.execution.shadow.reasons, lostModules: run.execution.shadow.lostModules, addedModules: run.execution.shadow.addedModules, addedSources: run.execution.shadow.addedSources, genericMs: run.execution.shadow.generic.durationMs, skillMs: run.execution.shadow.skill.durationMs } : null,
      timings: run.execution.timings,
      patches: run.patches?.length ?? 0,
    } : null,
  };
}
