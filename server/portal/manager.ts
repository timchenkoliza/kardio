import type { ActionRequest, AgentId, AgentResult, AgentRun, UserProfile } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { askHref, isPortalJob, JOBS, jobForRun, type PortalJob } from "@/lib/portal/jobs";
import { lengthBucket } from "@/lib/portal/metrics";
import { capabilityForJob } from "@/lib/mesh/capabilities";
import { compileIntent } from "@/lib/mesh/intent";
import type { PortalRoute } from "@/lib/portal/router";
import { workspaceStore } from "@/server/agents/store";
import { createRun, RUN_EXECUTION_DEADLINE_MS } from "@/server/agents/supervisor";
import type { RunOutcome } from "@/server/agents/supervisor";
import { executeRun, loadProfile } from "@/server/agents/workspace";
import { recordPortalEvent } from "./telemetry";

/**
 * Portal Manager: owns the physician's request and its final result.
 *
 *   intent (compiled) → capability → source plan → evidence graph
 *          → experience manifest → result → next action / return loop
 *
 * The physician owns the intent; the system owns execution. Capabilities and
 * sources stay implementation units; this layer speaks in jobs.
 */

export interface AskOutcome {
  runId: string;
  job: PortalJob;
  agentId: AgentId;
  href: string;
  actions: ActionRequest[];
  notices: string[];
  route: Pick<PortalRoute, "job" | "confidence" | "reasons" | "vague">;
}

/** Runs the work of a durable run after the response; tests run it inline. */
export type Scheduler = (task: () => Promise<void>) => void;

/**
 * Accept the intent and create the durable run — nothing executes yet.
 *
 *   accept intent → compile route → CREATE durable run (queued) → return runId
 *
 * The id returned to the browser already exists in storage, so the result
 * page can be opened (and refreshed, and reopened) from any server instance
 * while the work runs. Unsafe input becomes a terminal blocked run.
 */
export async function createAskRun(sessionId: string, specialty: SpecialtyId, text: string, options: { job?: PortalJob | null; followup?: boolean } = {}): Promise<{ run: AgentRun; job: PortalJob; agentId: AgentId; route: AskOutcome["route"] }> {
  const intent = compileIntent(text, specialty, { job: options.job ?? null });
  const route = intent.route;
  const capability = capabilityForJob(intent.job.primary);
  await recordPortalEvent(sessionId, "primary_intent_submitted", { specialty, lengthBucket: lengthBucket(text), explicitJob: Boolean(options.job) });
  await recordPortalEvent(sessionId, "intent_routed", { specialty, job: route.job, capability: capability.id, confidence: route.confidence, explicitJob: Boolean(options.job), jobType: intent.job.primary });
  if (options.followup) await recordPortalEvent(sessionId, "followup_started", { specialty, job: route.job });

  const store = workspaceStore();
  const previous = await store.listRuns(sessionId, specialty, capability.host, 30);
  if (previous.some(run => run.input.text && jobForRun(run) === route.job)) await recordPortalEvent(sessionId, "repeat_job", { specialty, job: route.job });

  const profile = await loadProfile(sessionId, specialty);
  const run = await createRun(store, sessionId, { agentId: capability.host, specialty, profile, trigger: "composer", text, job: route.job, explicitJob: Boolean(options.job), followup: options.followup });
  return { run, job: route.job, agentId: capability.host, route: { job: route.job, confidence: route.confidence, reasons: route.reasons, vague: route.vague } };
}

/**
 * Execute a queued run (after the response, or inline in tests). The intent
 * is recompiled deterministically from the stored, risk-sanitized text: the
 * same route and job as at creation, and nothing redacted reaches a source.
 */
export async function executeAskRun(sessionId: string, specialty: SpecialtyId, runId: string): Promise<RunOutcome | null> {
  const store = workspaceStore();
  const run = await store.getRun(sessionId, runId);
  if (!run || run.status !== "queued" || !run.input.text) return null;
  const job = isPortalJob(run.intent) ? run.intent : null;
  const intent = compileIntent(run.input.text, specialty, { job: run.input.explicitJob ? job : null });
  const outcome = await executeRun(sessionId, specialty, run.agentId, { trigger: "composer", text: run.input.text, routed: intent.route.routed, job: intent.route.job, intent, run });
  if (intent.route.job === "research" && outcome.run.status !== "blocked" && outcome.run.resultIds.length) {
    await recordPortalEvent(sessionId, "research_result_completed", { specialty, job: intent.route.job, runId: outcome.run.id, count: outcome.run.resultIds.length });
  }
  return outcome;
}

/**
 * One question → one durable run. With a scheduler (the HTTP route passes
 * `after()`), the run id is returned immediately and the work continues after
 * the response; without one (tests, scripts) the work runs inline first.
 */
export async function handleAsk(sessionId: string, specialty: SpecialtyId, text: string, options: { job?: PortalJob | null; followup?: boolean; schedule?: Scheduler } = {}): Promise<AskOutcome> {
  const created = await createAskRun(sessionId, specialty, text, options);
  let actions: ActionRequest[] = [];
  if (created.run.status === "queued") {
    if (options.schedule) {
      options.schedule(async () => { await executeAskRun(sessionId, specialty, created.run.id).catch(() => null); });
    } else {
      const outcome = await executeAskRun(sessionId, specialty, created.run.id);
      actions = outcome?.actions ?? [];
    }
  }
  return {
    runId: created.run.id,
    job: created.job,
    agentId: created.agentId,
    href: askHref(specialty, { run: created.run.id }),
    actions,
    notices: created.run.riskNotices,
    route: created.route,
  };
}

/**
 * A run that should have finished by its deadline but did not lost its
 * execution (instance stopped, function timed out). It is reported as
 * expired — never left spinning, never described as another session's.
 */
export async function settleExpiredRun(sessionId: string, run: AgentRun, now = new Date()): Promise<AgentRun> {
  if (run.completedAt || (run.status !== "queued" && run.status !== "running" && run.status !== "partial")) return run;
  const deadline = Date.parse(run.progress?.deadlineAt ?? "") || Date.parse(run.startedAt) + RUN_EXECUTION_DEADLINE_MS;
  if (now.getTime() <= deadline) return run;
  const expired: AgentRun = { ...run, status: run.experience ? "partial" : "failed", error: "execution_expired", completedAt: now.toISOString(), durationMs: now.getTime() - Date.parse(run.startedAt), progress: run.progress ? { ...run.progress, pending: [], updatedAt: now.toISOString() } : null };
  await workspaceStore().saveRun(sessionId, expired);
  return expired;
}

/** A result counts as useful when at least one finding is supported by its source. */
export function isUseful(results: readonly AgentResult[]): boolean {
  return results.some(result => !result.partner && result.evidence.some(item => item.verificationStatus === "SUPPORTED" || item.verificationStatus === "PARTIALLY_SUPPORTED"));
}

/**
 * Called when a job result is rendered. Records utility and — once per
 * specialty profile — activation with time to first value.
 */
export async function recordResultRendered(sessionId: string, specialty: SpecialtyId, run: AgentRun, results: readonly AgentResult[]): Promise<void> {
  const job = jobForRun(run);
  const useful = isUseful(results);
  if (job === "drug") await recordPortalEvent(sessionId, "drug_result_opened", { specialty, job, runId: run.id, state: useful ? "useful" : "empty" });
  if (job === "guidelines") await recordPortalEvent(sessionId, "guideline_result_opened", { specialty, job, runId: run.id, state: useful ? "useful" : "empty" });
  if (job === "learning") {
    const signal = results.find(result => typeof result.attributes.signal === "string")?.attributes.signal;
    if (typeof signal === "string") await recordPortalEvent(sessionId, "recommendation_reason_shown", { specialty, job, runId: run.id, signal });
    if (signal === "specialty") await recordPortalEvent(sessionId, "specialty_signal_used", { specialty, job, runId: run.id });
  }
  if (!useful) return;
  await recordPortalEvent(sessionId, "useful_result_rendered", { specialty, job, runId: run.id, count: results.length });
  const profile = await loadProfile(sessionId, specialty);
  if (profile.firstValueAt) return;
  const now = new Date();
  const ttfvMs = profile.firstSeenAt ? Math.max(0, now.getTime() - new Date(profile.firstSeenAt).getTime()) : undefined;
  profile.firstValueAt = now.toISOString();
  profile.updatedAt = now.toISOString();
  await workspaceStore().saveProfile(sessionId, profile);
  await recordPortalEvent(sessionId, "first_value_delivered", { specialty, job, runId: run.id, ...(ttfvMs !== undefined ? { ttfvMs } : {}) });
}

/**
 * Called on every portal open. Anchors the retention cohort and reports a
 * return session (a visit more than 30 minutes after the previous one).
 */
export async function recordPortalOpen(sessionId: string, specialty: SpecialtyId): Promise<{ profile: UserProfile; returning: boolean }> {
  const profile = await loadProfile(sessionId, specialty);
  const now = new Date();
  let changed = false;
  if (!profile.firstSeenAt) { profile.firstSeenAt = now.toISOString(); changed = true; }
  const last = profile.lastVisitAt ? new Date(profile.lastVisitAt).getTime() : 0;
  const returning = Boolean(profile.lastVisitAt) && now.getTime() - last > 30 * 60_000;
  if (!profile.lastVisitAt || returning) {
    profile.previousVisitAt = profile.lastVisitAt;
    profile.lastVisitAt = now.toISOString();
    changed = true;
  }
  if (changed) { profile.updatedAt = now.toISOString(); await workspaceStore().saveProfile(sessionId, profile); }
  await recordPortalEvent(sessionId, "portal_opened", { specialty });
  if (returning) {
    const daysSinceFirst = profile.firstSeenAt ? Math.floor((now.getTime() - new Date(profile.firstSeenAt).getTime()) / 86_400_000) : 0;
    await recordPortalEvent(sessionId, "return_session", { specialty, daysSinceFirst });
  }
  return { profile, returning };
}

/** «Для вас» rendered: every card carries a reason; a feed without topics runs on the specialty signal. */
export async function recordForYouRendered(sessionId: string, specialty: SpecialtyId, view: { cards: unknown[]; personalised: boolean }): Promise<void> {
  if (!view.cards.length) return;
  await recordPortalEvent(sessionId, "recommendation_reason_shown", { specialty, job: "updates", count: view.cards.length });
  if (!view.personalised) await recordPortalEvent(sessionId, "specialty_signal_used", { specialty, job: "updates" });
}

export function jobLabel(job: PortalJob): string {
  return JOBS[job].label;
}
