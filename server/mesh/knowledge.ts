import type { CompileInput } from "@/lib/mesh/compiler";
import { compileExperience } from "@/lib/mesh/compiler";
import type { DocumentVersion, EvidenceGraph, NormalizedDocument, SourceResult } from "@/lib/mesh/evidence";
import { buildEvidenceGraph } from "@/lib/mesh/evidence-graph";
import type { NormalizedIntent } from "@/lib/mesh/intent";
import type { ExperienceManifest } from "@/lib/mesh/manifest";
import type { ExecutionPlan } from "@/lib/mesh/planner";
import type { SourceDescriptor, SourceId, SourceStatusReport } from "@/lib/mesh/sources";
import type { SourceRegistry } from "./sources/registry";
import type { SourceContext } from "./sources/types";
import { recordMeshEvent } from "./telemetry";

/**
 * Versioned knowledge with incremental invalidation.
 *
 *   Source → Document → Version → SemanticChunk → Entity → Claim → Scenario → Experience
 *
 * Nothing is recomputed on a schedule. A re-verification re-reads one
 * document; if its fingerprint is unchanged nothing else happens (TTL expiry
 * is «re-check», never «changed»). If it changed, only the changed chunks
 * are identified, only scenarios that depend on that document re-extract
 * their claims, and only scenarios whose claims actually moved are marked
 * stale and recompiled. Everything else is untouched.
 */

export interface DocumentRecord {
  id: string;
  sourceId: SourceId;
  url: string;
  version: DocumentVersion;
  chunks: Map<string, { fingerprint: string; path: string[] }>;
  verifiedAt: string;
  history: Array<DocumentVersion & { observedAt: string }>;
}

export interface ExperienceRecord {
  /** Scenario key: the deterministic intent id (+ the physician's source exclusions). */
  key: string;
  scenario: string | null;
  intent: NormalizedIntent;
  plan: ExecutionPlan;
  results: SourceResult[];
  statuses: Partial<Record<SourceId, SourceStatusReport>>;
  descriptors: SourceDescriptor[];
  compile: Omit<CompileInput, "graph">;
  graph: EvidenceGraph;
  manifest: ExperienceManifest;
  compiledAt: string;
  generation: number;
  stale: boolean;
  staleReason: string | null;
  /** Re-extracted documents waiting for regeneration. */
  pending: Map<string, NormalizedDocument>;
}

export interface DeltaReport {
  documentId: string;
  url: string;
  status: "new" | "unchanged" | "changed";
  fromVersion: string | null;
  toVersion: string;
  chunksTotal: number;
  chunksChanged: string[];
  chunksAdded: string[];
  chunksRemoved: string[];
  claimsAdded: string[];
  claimsRemoved: string[];
  claimKinds: string[];
  entities: string[];
  scenariosChecked: string[];
  scenariosStale: string[];
  scenariosUntouched: string[];
  experiencesInvalidated: string[];
}

export interface RegenerationReport {
  regenerated: Array<{ key: string; before: ExperienceManifest; after: ExperienceManifest; fallback: boolean }>;
}

export interface KnowledgeCounters {
  documentsFetched: number;
  chunkComparisons: number;
  claimExtractions: number;
  experiencesCompiled: number;
}

function documentsOf(results: readonly SourceResult[]): NormalizedDocument[] {
  return results.flatMap(result => result.documents);
}

export class KnowledgeStore {
  readonly documents = new Map<string, DocumentRecord>();
  readonly experiences = new Map<string, ExperienceRecord>();
  readonly counters: KnowledgeCounters = { documentsFetched: 0, chunkComparisons: 0, claimExtractions: 0, experiencesCompiled: 0 };

  private remember(document: NormalizedDocument, observedAt: string): DocumentRecord {
    const existing = this.documents.get(document.id);
    const record: DocumentRecord = existing ?? { id: document.id, sourceId: document.sourceId, url: document.url, version: document.version, chunks: new Map(), verifiedAt: observedAt, history: [] };
    if (!existing || existing.version.fingerprint !== document.version.fingerprint) record.history.push({ ...document.version, observedAt });
    record.version = document.version;
    record.verifiedAt = observedAt;
    record.chunks = new Map(document.chunks.map(chunk => [chunk.id, { fingerprint: chunk.fingerprint, path: chunk.path }]));
    this.documents.set(document.id, record);
    return record;
  }

  /** Index a compiled experience and the documents it depends on. */
  registerExperience(args: Omit<ExperienceRecord, "generation" | "stale" | "staleReason" | "pending" | "compiledAt"> & { compiledAt?: string }): ExperienceRecord {
    for (const document of documentsOf(args.results)) if (!this.documents.has(document.id)) this.remember(document, args.graph.createdAt);
    const record: ExperienceRecord = { ...args, compiledAt: args.compiledAt ?? args.graph.createdAt, generation: (this.experiences.get(args.key)?.generation ?? 0) + 1, stale: false, staleReason: null, pending: new Map() };
    this.experiences.set(args.key, record);
    return record;
  }

  /** A fresh, non-stale experience for the same scenario, if one exists. */
  fresh(key: string, now: Date, maxAgeMs: number): ExperienceRecord | null {
    const record = this.experiences.get(key);
    if (!record || record.stale) return null;
    return now.getTime() - new Date(record.compiledAt).getTime() <= maxAgeMs ? record : null;
  }

  dependents(documentId: string): ExperienceRecord[] {
    return [...this.experiences.values()].filter(record => record.results.some(result => result.documents.some(document => document.id === documentId)));
  }

  /** Documents whose re-verification interval has passed (TTL): they need a re-check, not an invalidation. */
  dueForReverification(now: Date, descriptors: readonly SourceDescriptor[]): DocumentRecord[] {
    const interval = new Map(descriptors.map(descriptor => [descriptor.id, descriptor.freshnessPolicy.reverifyAfterHours]));
    return [...this.documents.values()].filter(record => {
      const hours = interval.get(record.sourceId);
      return hours !== null && hours !== undefined && now.getTime() - new Date(record.verifiedAt).getTime() > hours * 3_600_000;
    });
  }

  /**
   * Re-verify one document through its source and propagate a delta.
   * `extract` re-derives the document for one scenario (claims depend on the
   * question); it runs only for scenarios that depend on the document.
   */
  async refresh(args: { url: string; documentId: string; neutral: NormalizedDocument | null; extract: (intent: NormalizedIntent) => Promise<NormalizedDocument | null>; observedAt: string; sessionId?: string | null }): Promise<DeltaReport> {
    const previous = this.documents.get(args.documentId);
    const others = [...this.experiences.keys()];
    const base: DeltaReport = { documentId: args.documentId, url: args.url, status: "unchanged", fromVersion: previous?.version.fingerprint ?? null, toVersion: previous?.version.fingerprint ?? "", chunksTotal: previous?.chunks.size ?? 0, chunksChanged: [], chunksAdded: [], chunksRemoved: [], claimsAdded: [], claimsRemoved: [], claimKinds: [], entities: [], scenariosChecked: [], scenariosStale: [], scenariosUntouched: others, experiencesInvalidated: [] };
    if (!args.neutral) return base;
    this.counters.documentsFetched += 1;
    if (!previous) { this.remember(args.neutral, args.observedAt); return { ...base, status: "new", toVersion: args.neutral.version.fingerprint, chunksTotal: args.neutral.chunks.length }; }

    const next = new Map(args.neutral.chunks.map(chunk => [chunk.id, chunk.fingerprint]));
    this.counters.chunkComparisons += next.size;
    if (previous.version.fingerprint === args.neutral.version.fingerprint) {
      previous.verifiedAt = args.observedAt;
      return { ...base, status: "unchanged" };
    }
    const chunksChanged = [...next.entries()].filter(([id, value]) => previous.chunks.has(id) && previous.chunks.get(id)!.fingerprint !== value).map(([id]) => id);
    const chunksAdded = [...next.keys()].filter(id => !previous.chunks.has(id));
    const chunksRemoved = [...previous.chunks.keys()].filter(id => !next.has(id));
    const fromVersion = previous.version.fingerprint;
    this.remember(args.neutral, args.observedAt);

    const dependents = this.dependents(args.documentId);
    const report: DeltaReport = { ...base, status: "changed", fromVersion, toVersion: args.neutral.version.fingerprint, chunksTotal: next.size, chunksChanged, chunksAdded, chunksRemoved, scenariosChecked: dependents.map(record => record.key), scenariosUntouched: others.filter(key => !dependents.some(record => record.key === key)) };
    const added = new Set<string>();
    const removed = new Set<string>();
    const kinds = new Set<string>();
    const entities = new Set<string>();
    for (const record of dependents) {
      const old = documentsOf(record.results).find(document => document.id === args.documentId)!;
      const fresh = await args.extract(record.intent);
      this.counters.claimExtractions += 1;
      if (!fresh) continue;
      const before = new Map(old.claims.map(claim => [claim.id, claim]));
      const after = new Map(fresh.claims.map(claim => [claim.id, claim]));
      const gone = [...before.keys()].filter(id => !after.has(id));
      const born = [...after.keys()].filter(id => !before.has(id));
      if (!gone.length && !born.length) {
        // Words changed where this scenario does not look: keep the experience, record the new version.
        record.results = record.results.map(result => ({ ...result, documents: result.documents.map(document => (document.id === args.documentId ? { ...document, version: fresh.version, chunks: fresh.chunks } : document)) }));
        continue;
      }
      for (const id of gone) { removed.add(id); kinds.add(before.get(id)!.kind); before.get(id)!.entityIds.forEach(entity => entities.add(entity)); }
      for (const id of born) { added.add(id); kinds.add(after.get(id)!.kind); after.get(id)!.entityIds.forEach(entity => entities.add(entity)); }
      record.stale = true;
      record.staleReason = `source_delta:${args.documentId}`;
      record.pending.set(args.documentId, fresh);
      report.scenariosStale.push(record.key);
      report.experiencesInvalidated.push(record.manifest.id);
    }
    report.claimsAdded = [...added];
    report.claimsRemoved = [...removed];
    report.claimKinds = [...kinds];
    report.entities = [...entities];
    report.scenariosUntouched = others.filter(key => !report.scenariosStale.includes(key));
    await recordMeshEvent(args.sessionId ?? null, "source_delta_detected", { sourceId: previous.sourceId, documentId: args.documentId, chunksChanged: chunksChanged.length + chunksAdded.length + chunksRemoved.length, claimsAffected: added.size + removed.size, scenariosStale: report.scenariosStale.length, experiencesInvalidated: report.experiencesInvalidated.length });
    return report;
  }

  /** Recompile only stale experiences, from their stored plan and results with the re-extracted documents. */
  regenerateStale(now: string): RegenerationReport {
    const regenerated: RegenerationReport["regenerated"] = [];
    for (const record of this.experiences.values()) {
      if (!record.stale) continue;
      const results = record.results.map(result => ({ ...result, documents: result.documents.map(document => record.pending.get(document.id) ?? document) }));
      const graph = buildEvidenceGraph({ id: `${record.graph.id}-g${record.generation + 1}`, intent: record.intent, plan: record.plan, results, descriptors: record.descriptors, statuses: record.statuses, now });
      const output = compileExperience({ ...record.compile, graph });
      this.counters.experiencesCompiled += 1;
      const before = record.manifest;
      Object.assign(record, { results, graph, manifest: output.manifest, compiledAt: now, generation: record.generation + 1, stale: false, staleReason: null, pending: new Map() });
      regenerated.push({ key: record.key, before, after: output.manifest, fallback: output.fallback });
    }
    return { regenerated };
  }
}

const globals = globalThis as unknown as { kardioKnowledge?: KnowledgeStore };

/** Process-level knowledge store (a cache over sources, never the source of truth). */
export function knowledgeStore(): KnowledgeStore {
  if (!globals.kardioKnowledge) globals.kardioKnowledge = new KnowledgeStore();
  return globals.kardioKnowledge;
}

/** Re-verify a document through its adapter (neutral read once, scenario extraction from the same fresh page). */
export async function refreshDocument(args: { store: KnowledgeStore; registry: SourceRegistry; documentId: string; ctx: Pick<SourceContext, "now" | "nowIso">; sessionId?: string | null }): Promise<DeltaReport | null> {
  const record = args.store.documents.get(args.documentId);
  if (!record) return null;
  const adapter = args.registry[record.sourceId];
  if (!adapter.fetch) return null;
  const neutral = await adapter.fetch(record.url, args.ctx, null);
  return args.store.refresh({ url: record.url, documentId: args.documentId, neutral, extract: intent => adapter.fetch!(record.url, args.ctx, intent), observedAt: args.ctx.nowIso, sessionId: args.sessionId });
}
