import { isSpecialty } from "@/lib/specialty";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { anonymousSessions } from "@/db/schema";
import type { ResearchJob, ResearchJobStatus } from "@/lib/agents/research-jobs";
import { isActiveResearchJob } from "@/lib/agents/research-jobs";
import { normalizeResearchDomains, type ResearchRunOptions } from "@/lib/agents/research-options";
import type { SpecialtyId } from "@/lib/domain/types";
import { checkRisk, type RunOutcome } from "./supervisor";
import { executeResearchRun } from "./research-run";

const MAX_JOBS = 20;
const STALE_AFTER_MS = 15 * 60_000;

type SessionStateWithJobs = { researchJobs?: ResearchJob[] } & Record<string, unknown>;
type ResearchExecutor = (
  sessionId: string,
  specialty: SpecialtyId,
  text: string,
  options: ResearchRunOptions,
) => Promise<RunOutcome>;

const globals = globalThis as unknown as { kardioResearchJobs?: Map<string, ResearchJob[]> };
const fallbackJobs = globals.kardioResearchJobs ?? new Map<string, ResearchJob[]>();
globals.kardioResearchJobs = fallbackJobs;

function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeOptions(options: ResearchRunOptions): ResearchRunOptions {
  const excludeDomains = normalizeResearchDomains(options.excludeDomains ?? []);
  return {
    mode: options.mode,
    sourceScope: options.sourceScope,
    contentScope: options.contentScope,
    includeDomains: normalizeResearchDomains(options.includeDomains ?? []).filter(domain => !excludeDomains.includes(domain)),
    excludeDomains,
  };
}

function normalizeJobs(value: unknown): ResearchJob[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ResearchJob => {
    if (!item || typeof item !== "object") return false;
    const job = item as Partial<ResearchJob>;
    return typeof job.id === "string"
      && isSpecialty(job.specialty)
      && typeof job.question === "string"
      && typeof job.createdAt === "string"
      && typeof job.status === "string"
      && Boolean(job.options);
  }).slice(0, MAX_JOBS).map(job => ({ ...job, options: normalizeOptions(job.options) }));
}

async function readAll(sessionId: string): Promise<ResearchJob[]> {
  if (!databaseConfigured()) return clone(fallbackJobs.get(sessionId) ?? []);
  const [record] = await db.select({ state: anonymousSessions.state }).from(anonymousSessions).where(eq(anonymousSessions.id, sessionId));
  const state = (record?.state ?? {}) as unknown as SessionStateWithJobs;
  return normalizeJobs(state.researchJobs);
}

async function writeAll(sessionId: string, updater: (jobs: ResearchJob[]) => ResearchJob[]): Promise<ResearchJob[]> {
  if (!databaseConfigured()) {
    const next = updater(clone(fallbackJobs.get(sessionId) ?? [])).slice(0, MAX_JOBS);
    fallbackJobs.set(sessionId, clone(next));
    return clone(next);
  }

  return db.transaction(async tx => {
    const [record] = await tx.select({ state: anonymousSessions.state }).from(anonymousSessions).where(eq(anonymousSessions.id, sessionId)).for("update");
    if (!record) throw new Error("research_job_session_missing");
    const state = (record.state ?? {}) as unknown as SessionStateWithJobs;
    const next = updater(normalizeJobs(state.researchJobs)).slice(0, MAX_JOBS);
    const nextState = { ...state, researchJobs: next };
    await tx.update(anonymousSessions).set({ state: nextState as unknown as typeof record.state, updatedAt: new Date() }).where(eq(anonymousSessions.id, sessionId));
    return clone(next);
  });
}

async function saveJob(sessionId: string, job: ResearchJob): Promise<ResearchJob> {
  const jobs = await writeAll(sessionId, current => [clone(job), ...current.filter(item => item.id !== job.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  return jobs.find(item => item.id === job.id) ?? job;
}

export async function queueResearchJob(sessionId: string, specialty: SpecialtyId, text: string, options: ResearchRunOptions): Promise<ResearchJob> {
  const risk = checkRisk(text);
  const now = new Date().toISOString();
  const job: ResearchJob = {
    id: `rjob-${randomUUID()}`,
    specialty,
    question: risk.sanitizedText.slice(0, 1200),
    options: normalizeOptions(options),
    status: risk.allowed ? "queued" : "blocked",
    createdAt: now,
    startedAt: null,
    completedAt: risk.allowed ? null : now,
    runId: null,
    resultCount: 0,
    error: risk.allowed ? null : (risk.blockedReason ?? "Запрос остановлен проверкой безопасности."),
  };
  return saveJob(sessionId, job);
}

export async function getResearchJob(sessionId: string, specialty: SpecialtyId, id: string): Promise<ResearchJob | null> {
  const jobs = await listResearchJobs(sessionId, specialty, MAX_JOBS);
  return jobs.find(job => job.id === id) ?? null;
}

export async function listResearchJobs(sessionId: string, specialty: SpecialtyId, limit = 10): Promise<ResearchJob[]> {
  const now = Date.now();
  const jobs = (await readAll(sessionId)).filter(job => job.specialty === specialty);
  let changed = false;
  const normalized = jobs.map(job => {
    if (!isActiveResearchJob(job)) return job;
    const started = new Date(job.startedAt ?? job.createdAt).getTime();
    if (!Number.isFinite(started) || now - started <= STALE_AFTER_MS) return job;
    changed = true;
    return {
      ...job,
      status: "failed" as const,
      completedAt: new Date().toISOString(),
      error: "Фоновый запуск был прерван. Запустите исследование ещё раз.",
    };
  });
  if (changed) {
    await writeAll(sessionId, current => current.map(item => normalized.find(next => next.id === item.id) ?? item));
  }
  return clone(normalized.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit));
}

function finalStatus(status: RunOutcome["run"]["status"]): ResearchJobStatus {
  if (status === "completed" || status === "partial" || status === "failed" || status === "blocked") return status;
  return "failed";
}

export async function processResearchJob(sessionId: string, jobId: string, execute: ResearchExecutor = executeResearchRun): Promise<ResearchJob | null> {
  const job = (await readAll(sessionId)).find(item => item.id === jobId) ?? null;
  if (!job || job.status !== "queued") return job;

  const running: ResearchJob = { ...job, status: "running", startedAt: new Date().toISOString(), error: null };
  await saveJob(sessionId, running);

  try {
    const outcome = await execute(sessionId, running.specialty, running.question, running.options);
    const completed: ResearchJob = {
      ...running,
      status: finalStatus(outcome.run.status),
      completedAt: outcome.run.completedAt ?? new Date().toISOString(),
      runId: outcome.run.id,
      resultCount: outcome.run.resultIds.length,
      error: outcome.run.error,
    };
    return saveJob(sessionId, completed);
  } catch (error) {
    const failed: ResearchJob = {
      ...running,
      status: "failed",
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message.slice(0, 240) : "Фоновое исследование завершилось с ошибкой.",
    };
    return saveJob(sessionId, failed);
  }
}

export function resetResearchJobsForTest(sessionId: string) {
  fallbackJobs.delete(sessionId);
}
