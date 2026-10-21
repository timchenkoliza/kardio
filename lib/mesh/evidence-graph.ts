import type { ClaimKind, CoverageState, EvidenceGraph, GraphConflict, GraphDocument, GraphFreshness, GraphRelation, GraphSource, NormalizedClaim, NormalizedDocument, SourceResult } from "./evidence";
import type { NormalizedIntent } from "./intent";
import { REQUIREMENT_LABEL, type EvidenceRequirement } from "./jobs";
import type { ExecutionPlan } from "./planner";
import type { SourceDescriptor, SourceId, SourceStatusReport } from "./sources";

/**
 * Evidence Graph v0.1 — the only input of the Experience layer.
 *
 * Built deterministically from normalized source results: every claim is
 * traceable to a document, chunk and source; conflicts between sources are
 * preserved (never resolved here); freshness and coverage are explicit.
 */

const SUBSTANTIVE: ReadonlySet<ClaimKind> = new Set(["indication", "guideline_statement", "review_conclusion", "society_assertion", "contraindication"]);

function hashId(prefix: string, parts: readonly string[]): string {
  let hash = 2166136261;
  for (const char of parts.join("|")) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return `${prefix}-${hash.toString(36)}`;
}

function year(value: string | null | undefined): number | null {
  const match = value?.match(/(19|20)\d{2}/u);
  return match ? Number(match[0]) : null;
}

/** Do two claims speak about the same scope (nosology and, when asked, subtype)? */
function sameScope(a: NormalizedClaim, b: NormalizedClaim, intent: NormalizedIntent): boolean {
  const nosology = intent.context.nosology ? `nosology:${intent.context.nosology.id}` : null;
  if (!nosology || !a.entityIds.includes(nosology) || !b.entityIds.includes(nosology)) return false;
  const subtype = intent.context.subtype?.id;
  if (!subtype) return true;
  const covers = (claim: NormalizedClaim) => claim.covers.includes(subtype) || claim.entityIds.includes(`subtype:${subtype}`);
  return covers(a) && covers(b);
}

export function detectConflicts(claims: readonly NormalizedClaim[], documents: ReadonlyMap<string, NormalizedDocument>, intent: NormalizedIntent): GraphConflict[] {
  const conflicts: GraphConflict[] = [];
  const pool = claims.filter(claim => SUBSTANTIVE.has(claim.kind) && claim.polarity !== "neutral");
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const a = pool[i];
      const b = pool[j];
      if (a.documentId === b.documentId || a.polarity === b.polarity || !sameScope(a, b, intent)) continue;
      const da = documents.get(a.documentId)!;
      const db = documents.get(b.documentId)!;
      const ya = year(da.version.date ?? da.publishedAt);
      const yb = year(db.version.date ?? db.publishedAt);
      const kind: GraphConflict["kind"] = ya && yb && Math.abs(ya - yb) >= 2 ? "temporal_divergence" : da.jurisdiction !== db.jurisdiction ? "jurisdiction" : "polarity";
      const explanation = kind === "temporal_divergence"
        ? `Документы разных лет: ${Math.min(ya!, yb!)} и ${Math.max(ya!, yb!)}`
        : kind === "jurisdiction" ? `Разные юрисдикции: ${da.jurisdiction} и ${db.jurisdiction}` : "Источники формулируют противоположно";
      const [first, second] = (ya ?? 0) <= (yb ?? 0) ? [a, b] : [b, a];
      conflicts.push({ id: hashId("conflict", [first.id, second.id]), claimIds: [first.id, second.id], kind, explanation, resolution: "unresolved" });
    }
  }
  // Keep the most informative few: one conflict per (older claim, newer document source).
  const seen = new Set<string>();
  return conflicts.filter(conflict => {
    const key = `${conflict.claimIds[0]}|${documents.get(claims.find(claim => claim.id === conflict.claimIds[1])!.documentId)!.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

function freshnessFor(document: NormalizedDocument, now: string): GraphFreshness {
  const currentness = document.claims.find(claim => claim.kind === "currentness");
  if (currentness?.method === "rule_derived") return { documentId: document.id, state: "revision_overdue", reason: currentness.statement, checkedAt: now };
  if (document.attributes.currentness === "review" || document.attributes.currentness === "superseded") return { documentId: document.id, state: "needs_reverification", reason: currentness?.statement ?? "Актуальность версии требует проверки", checkedAt: now };
  if (document.state === "SNAPSHOT") return { documentId: document.id, state: "snapshot", reason: `Снимок от ${document.retrievedAt.slice(0, 10)}`, checkedAt: now };
  if (document.state === "LIVE") return { documentId: document.id, state: "live", reason: `Получено ${document.retrievedAt.slice(0, 10)}`, checkedAt: now };
  return { documentId: document.id, state: "unknown", reason: "Дата проверки неизвестна", checkedAt: now };
}

export function buildEvidenceGraph(args: {
  id: string;
  intent: NormalizedIntent;
  plan: ExecutionPlan;
  results: readonly SourceResult[];
  descriptors: readonly SourceDescriptor[];
  statuses: Partial<Record<SourceId, SourceStatusReport>>;
  now: string;
}): EvidenceGraph {
  const { intent, plan } = args;
  const documents = new Map<string, NormalizedDocument>();
  for (const result of args.results) for (const document of result.documents) if (!documents.has(document.id)) documents.set(document.id, document);

  const claims = new Map<string, NormalizedClaim>();
  const chunks = new Map<string, NormalizedDocument["chunks"][number]>();
  const entities = new Map<string, NormalizedDocument["entities"][number]>();
  for (const document of documents.values()) {
    for (const chunk of document.chunks) chunks.set(chunk.id, chunk);
    for (const entity of document.entities) if (!entities.has(entity.id)) entities.set(entity.id, entity);
    for (const claim of document.claims) claims.set(claim.id, claim);
  }

  const relations: GraphRelation[] = [];
  for (const claim of claims.values()) {
    relations.push({ id: hashId("rel", ["supported_by", claim.id, claim.documentId]), type: "supported_by", from: claim.id, to: claim.chunkId ?? claim.documentId, status: "asserted", method: claim.method, note: null });
    for (const entityId of claim.entityIds) relations.push({ id: hashId("rel", ["about", claim.id, entityId]), type: "about", from: claim.id, to: entityId, status: claim.method === "verbatim" || claim.method === "metadata" ? "asserted" : "candidate", method: claim.method, note: null });
    if (claim.kind === "drug_not_mentioned") for (const entityId of claim.entityIds.filter(id => id.startsWith("drug:"))) relations.push({ id: hashId("rel", ["not_mentioned_in", entityId, claim.documentId]), type: "not_mentioned_in", from: entityId, to: claim.documentId, status: "candidate", method: "absence_check", note: claim.verificationNote });
  }
  for (const document of documents.values()) {
    if (document.kind !== "inn_listing") continue;
    for (const entity of document.entities.filter(item => item.kind === "product")) relations.push({ id: hashId("rel", ["listed_in", entity.id, document.id]), type: "listed_in", from: entity.id, to: document.id, status: "asserted", method: "metadata", note: null });
  }

  const conflicts = detectConflicts([...claims.values()], documents, intent);
  for (const conflict of conflicts) relations.push({ id: hashId("rel", ["conflicts_with", ...conflict.claimIds]), type: "conflicts_with", from: conflict.claimIds[0], to: conflict.claimIds[1], status: "candidate", method: "rule:polarity+scope", note: conflict.explanation });

  const invocations = args.results.map(result => result.invocation);
  const descriptorById = new Map(args.descriptors.map(descriptor => [descriptor.id, descriptor]));
  const sources: GraphSource[] = [];
  for (const step of plan.steps) {
    if (sources.some(source => source.id === step.sourceId && source.requirement === step.requirement)) continue;
    const descriptor = descriptorById.get(step.sourceId)!;
    const invocation = invocations.find(item => item.stepId === step.id);
    const status = args.statuses[step.sourceId];
    sources.push({ id: step.sourceId, name: descriptor.name, authority: descriptor.authority, status: invocation?.status ?? status?.status ?? "UNAVAILABLE", execution: invocation?.execution ?? status?.execution ?? descriptor.execution, invoked: Boolean(invocation) && invocation!.outcome !== "handoff", outcome: invocation?.outcome ?? "not_invoked", handoffUrl: descriptor.handoffUrl, requirement: step.requirement });
  }

  const coverage: Partial<Record<EvidenceRequirement, CoverageState>> = {};
  for (const requirement of [...intent.requirements, ...intent.optional]) {
    const steps = plan.steps.filter(step => step.requirement === requirement || step.alsoCovers.includes(requirement));
    if (!steps.length) continue;
    const served = steps.flatMap(step => invocations.filter(item => item.stepId === step.id));
    const docs = served.flatMap(item => item.documentIds).map(id => documents.get(id)).filter((document): document is NormalizedDocument => Boolean(document));
    coverage[requirement] = docs.some(document => document.claims.length) ? "met" : docs.length ? "partial" : steps.every(step => step.role === "handoff") ? "handoff" : "missing";
  }

  const gaps: string[] = [];
  for (const item of plan.unmet) gaps.push(`${REQUIREMENT_LABEL[item.requirement]} — ${item.reason}`);
  for (const requirement of intent.requirements) {
    if (coverage[requirement] !== "missing") continue;
    const notes = plan.steps.filter(step => step.requirement === requirement).map(step => invocations.find(item => item.stepId === step.id)?.note).filter(Boolean);
    gaps.push(`${REQUIREMENT_LABEL[requirement]} — ${notes[0] ?? "источники ничего не нашли"}`);
  }

  const extraction = [...claims.values()].map(claim => claim.confidence);
  const graphDocuments: GraphDocument[] = [...documents.values()].map(document => {
    const { chunks: docChunks, ...rest } = document;
    const summary: Partial<NormalizedDocument> = { ...rest };
    delete summary.claims;
    delete summary.entities;
    return { ...(summary as Omit<NormalizedDocument, "chunks" | "claims" | "entities">), chunkIds: docChunks.map(chunk => chunk.id) };
  });
  return {
    schema: "kardio.evidence-graph/0.1",
    id: args.id,
    createdAt: args.now,
    job: intent.job.primary,
    family: intent.job.family,
    specialty: intent.context.specialty,
    context: { nosology: intent.context.nosology?.id ?? null, subtype: intent.context.subtype?.id ?? null, drugs: intent.entities.drugs.map(drug => drug.inn) },
    sources,
    documents: graphDocuments,
    versions: [...documents.values()].map(document => ({ documentId: document.id, ...document.version })),
    // Only chunks that keep text or back a claim are carried forward; the rest stay as fingerprints in the knowledge store.
    chunks: [...chunks.values()].filter(chunk => chunk.text || [...claims.values()].some(claim => claim.chunkId === chunk.id)),
    entities: [...entities.values()],
    claims: [...claims.values()],
    relations,
    conflicts,
    freshness: [...documents.values()].map(document => freshnessFor(document, args.now)),
    confidence: {
      extractionMin: extraction.length ? Math.min(...extraction) : 0,
      extractionMean: extraction.length ? Math.round((extraction.reduce((sum, value) => sum + value, 0) / extraction.length) * 100) / 100 : 0,
      coverage,
    },
    gaps: [...new Set(gaps)],
  };
}

/** Index helpers for the compiler and renderer. */
export function graphIndex(graph: EvidenceGraph) {
  return {
    claim: new Map(graph.claims.map(claim => [claim.id, claim])),
    document: new Map(graph.documents.map(document => [document.id, document])),
    chunk: new Map(graph.chunks.map(chunk => [chunk.id, chunk])),
    freshness: new Map(graph.freshness.map(item => [item.documentId, item])),
    source: new Map(graph.sources.map(source => [source.id, source])),
  };
}
