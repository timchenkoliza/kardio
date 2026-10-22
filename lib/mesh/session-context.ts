import type { PortalJob } from "@/lib/portal/jobs";
import { DRUGS, normalizeQuery } from "@/lib/portal/lexicon";
import { nosologyById, subtypeById } from "./domain-graph";
import type { JobType } from "./jobs";

/**
 * SessionContext — bounded memory of the current work session.
 *
 * Built from the physician's own recent runs (never from another session):
 * which topics and drugs were just worked on, which clarification options
 * were chosen, what was saved, and the patch chain of the current result.
 * It lets «этот препарат» resolve to the drug of the last result without a
 * question. It is not a profile: no sensitive traits, no patient data, no
 * free text — only entity ids from validated results, each with a time to
 * live and a confidence that decays with age.
 */

export const SESSION_CONTEXT_SCHEMA = "kardio.session-context/0.1" as const;
export const SESSION_CONTEXT_TTL_MS = 24 * 3_600_000;
const MAX_RECENT = 5;
const MAX_ENTITIES = 8;

export interface SessionEntity {
  id: string;
  kind: "drug" | "nosology" | "subtype";
  label: string;
  lastSeenAt: string;
  /** Decays with recency rank and age; never a statement about medicine. */
  confidence: number;
  runId: string;
}

export interface SessionRunRef {
  runId: string;
  at: string;
  job: JobType | null;
  family: PortalJob;
  nosology: string | null;
  subtype: string | null;
  drugs: string[];
}

export interface SessionContext {
  schema: typeof SESSION_CONTEXT_SCHEMA;
  builtAt: string;
  ttlMs: number;
  currentRunId: string | null;
  recent: SessionRunRef[];
  activeEntities: SessionEntity[];
  /** Clarification choices (ids only, never text). */
  explicitChoices: Array<{ clarificationId: string; optionId: string | null; at: string }>;
  savedItems: number;
  /** Patch chain of the current result. */
  patchChain: Array<{ manifestVersion: number; reason: string }>;
}

/** The minimal run shape the context is built from (so the lib layer stays independent of storage). */
export interface SessionRunInput {
  id: string;
  startedAt: string;
  status: string;
  family: PortalJob;
  job: JobType | null;
  nosology: string | null;
  subtype: string | null;
  drugs: string[];
  clarification?: { id: string; optionId: string | null } | null;
  patches?: Array<{ manifestVersion: number; reason: string }>;
}

export function emptySessionContext(now: Date): SessionContext {
  return { schema: SESSION_CONTEXT_SCHEMA, builtAt: now.toISOString(), ttlMs: SESSION_CONTEXT_TTL_MS, currentRunId: null, recent: [], activeEntities: [], explicitChoices: [], savedItems: 0, patchChain: [] };
}

export function buildSessionContext(runs: readonly SessionRunInput[], args: { now: Date; currentRunId?: string | null; savedItems?: number }): SessionContext {
  const now = args.now.getTime();
  const fresh = runs
    .filter(run => (run.status === "completed" || run.status === "partial") && now - Date.parse(run.startedAt) <= SESSION_CONTEXT_TTL_MS && now >= Date.parse(run.startedAt))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, MAX_RECENT);
  const entities = new Map<string, SessionEntity>();
  fresh.forEach((run, rank) => {
    const ageFactor = 1 - (now - Date.parse(run.startedAt)) / SESSION_CONTEXT_TTL_MS;
    const confidence = Math.round(Math.max(0, (1 - rank * 0.2) * ageFactor) * 100) / 100;
    const add = (entity: Omit<SessionEntity, "lastSeenAt" | "confidence" | "runId">) => {
      if (!entities.has(entity.id)) entities.set(entity.id, { ...entity, lastSeenAt: run.startedAt, confidence, runId: run.id });
    };
    for (const inn of run.drugs) {
      const drug = DRUGS.find(item => item.inn === inn);
      if (drug) add({ id: `drug:${inn}`, kind: "drug", label: drug.ru });
    }
    const nosology = nosologyById(run.nosology);
    if (nosology) add({ id: `nosology:${nosology.id}`, kind: "nosology", label: nosology.label });
    const subtype = subtypeById(run.subtype);
    if (subtype) add({ id: `subtype:${subtype.id}`, kind: "subtype", label: subtype.label });
  });
  const current = args.currentRunId ? runs.find(run => run.id === args.currentRunId) : null;
  return {
    schema: SESSION_CONTEXT_SCHEMA,
    builtAt: args.now.toISOString(),
    ttlMs: SESSION_CONTEXT_TTL_MS,
    currentRunId: args.currentRunId ?? null,
    recent: fresh.map(run => ({ runId: run.id, at: run.startedAt, job: run.job, family: run.family, nosology: run.nosology, subtype: run.subtype, drugs: [...run.drugs] })),
    activeEntities: [...entities.values()].sort((a, b) => b.confidence - a.confidence).slice(0, MAX_ENTITIES),
    explicitChoices: fresh.filter(run => run.clarification).map(run => ({ clarificationId: run.clarification!.id, optionId: run.clarification!.optionId, at: run.startedAt })).slice(0, MAX_RECENT),
    savedItems: args.savedItems ?? 0,
    patchChain: (current?.patches ?? []).slice(-10),
  };
}

const L = "(?<![\\p{L}])";
/** «этот препарат», «этому лекарству», «этим средством», «с ним» after a drug result. */
const DRUG_REFERENCE = new RegExp(`${L}(?:эт(?:от|ого|ому|им|ом)\\s+(?:препарат|лекарств|средств)\\p{L}*|(?:этот|эта|это)\\s+(?:молекул|действующ)\\p{L}*)`, "u");
/** «по этой теме», «это заболевание», «эти рекомендации». */
const TOPIC_REFERENCE = new RegExp(`${L}(?:по\\s+этой\\s+теме|эт(?:о|ого|ому|им)\\s+(?:заболевани|диагноз)\\p{L}*|эт(?:и|их|им)\\s+рекомендаци\\p{L}*)`, "u");

export interface ReferenceResolution {
  /** What the text refers to without naming it. */
  refers: Array<"drug" | "nosology">;
  /** Entities resolved from the session (most recent, confident, unambiguous). */
  resolved: SessionEntity[];
  /** Candidates when the reference is ambiguous (several recent drugs of similar confidence). */
  candidates: SessionEntity[];
}

/**
 * Resolve «этот препарат» against the session. A reference resolves only to a
 * clearly most recent entity; two recent drugs of similar confidence are
 * ambiguous and return candidates for one question instead of a guess.
 */
export function resolveReferences(text: string, session: SessionContext | null, named: { drugs: number; nosology: boolean }): ReferenceResolution {
  const value = normalizeQuery(text);
  const refers: ReferenceResolution["refers"] = [];
  if (!named.drugs && DRUG_REFERENCE.test(value)) refers.push("drug");
  if (!named.nosology && TOPIC_REFERENCE.test(value)) refers.push("nosology");
  const resolved: SessionEntity[] = [];
  const candidates: SessionEntity[] = [];
  for (const kind of refers) {
    const pool = (session?.activeEntities ?? []).filter(entity => entity.kind === kind && entity.confidence >= 0.3);
    if (!pool.length) continue;
    if (pool.length === 1 || pool[0].confidence - pool[1].confidence >= 0.2) resolved.push(pool[0]);
    else candidates.push(...pool.slice(0, 4));
  }
  return { refers, resolved, candidates };
}

/**
 * The session as the run was decided: only the entities resolved when the run
 * was created (persisted as ids). Execution re-decides the strategy from it,
 * so a run executes exactly what was decided — whatever happened since.
 */
export function pinnedSession(entityIds: readonly string[], now: Date): SessionContext {
  const context = emptySessionContext(now);
  for (const id of entityIds) {
    const [kind, value] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
    const label = kind === "drug" ? DRUGS.find(item => item.inn === value)?.ru : kind === "nosology" ? nosologyById(value)?.label : kind === "subtype" ? subtypeById(value)?.label : undefined;
    if (label && (kind === "drug" || kind === "nosology" || kind === "subtype")) context.activeEntities.push({ id, kind, label, lastSeenAt: now.toISOString(), confidence: 1, runId: "pinned" });
  }
  return context;
}
