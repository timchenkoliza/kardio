import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  evidenceRecords,
  nodeStateFacts,
  ontologyEdges,
  ontologyNodes,
} from "@/db/ontology-schema";
import type { SpecialtyId } from "@/lib/domain/types";
import { assertRelationAllowed } from "@/lib/ontology/relations";
import type {
  EvidenceRecord,
  NodeType,
  OntologyEdge,
  OntologyNode,
  RelationType,
  StateDimension,
  StateFact,
} from "@/lib/ontology/types";
import { isSpecialty } from "@/lib/specialty";

function requireSpecialty(specialty: SpecialtyId): void {
  if (!isSpecialty(specialty)) throw new Error("Unknown specialty");
}

function nodeRecord(row: typeof ontologyNodes.$inferSelect): OntologyNode {
  return {
    id: row.id,
    type: row.type,
    specialty: row.specialty,
    label: row.label,
    originalId: row.originalId,
    namespace: row.namespace,
    attributes: row.attributes,
    raw: row.raw,
  };
}

function edgeRecord(row: typeof ontologyEdges.$inferSelect): OntologyEdge {
  return {
    id: row.id,
    type: row.type,
    fromId: row.fromId,
    toId: row.toId,
    reviewState: row.reviewState,
    confidence: row.confidence,
    evidenceIds: [],
    attributes: row.attributes,
  };
}

function evidenceRecord(row: typeof evidenceRecords.$inferSelect): EvidenceRecord {
  const target = row.targetKind === "node"
    ? { kind: "node" as const, nodeId: row.targetId }
    : row.targetKind === "node_property"
      ? { kind: "node_property" as const, nodeId: row.targetId, property: row.targetProperty ?? "" }
      : row.targetKind === "edge"
        ? { kind: "edge" as const, edgeId: row.targetId }
        : { kind: "state_fact" as const, stateFactId: row.targetId };
  return {
    id: row.id,
    target,
    type: row.type,
    sourceNodeId: row.sourceNodeId,
    externalUrl: row.externalUrl,
    artifactRef: row.artifactRef,
    capturedAt: row.capturedAt,
    verifiedAt: row.verifiedAt,
    extractionMethod: row.extractionMethod,
    confidence: row.confidence,
    verification: row.verification,
    reviewer: row.reviewer,
    rightsState: row.rightsState as EvidenceRecord["rightsState"],
    validFrom: row.validFrom,
    expiresAt: row.expiresAt,
    notes: row.notes,
  };
}

export async function getNode(id: string): Promise<OntologyNode | null> {
  const row = (await db.select().from(ontologyNodes).where(eq(ontologyNodes.id, id)).limit(1))[0];
  return row ? nodeRecord(row) : null;
}

export async function queryBySpecialty(
  specialty: SpecialtyId,
  options: { types?: readonly NodeType[]; includeGlobal?: boolean } = {},
): Promise<OntologyNode[]> {
  requireSpecialty(specialty);
  const specialtyPredicate = options.includeGlobal
    ? or(eq(ontologyNodes.specialty, specialty), isNull(ontologyNodes.specialty))
    : eq(ontologyNodes.specialty, specialty);
  const typePredicate = options.types?.length ? inArray(ontologyNodes.type, [...options.types]) : undefined;
  const rows = await db.select().from(ontologyNodes)
    .where(and(specialtyPredicate, typePredicate))
    .orderBy(asc(ontologyNodes.type), asc(ontologyNodes.label));
  return rows.map(nodeRecord);
}

export async function getRelations(
  nodeId: string,
  options: { direction?: "outgoing" | "incoming" | "both"; types?: readonly RelationType[]; approvedOnly?: boolean } = {},
): Promise<OntologyEdge[]> {
  const direction = options.direction ?? "both";
  const nodePredicate = direction === "outgoing"
    ? eq(ontologyEdges.fromId, nodeId)
    : direction === "incoming"
      ? eq(ontologyEdges.toId, nodeId)
      : or(eq(ontologyEdges.fromId, nodeId), eq(ontologyEdges.toId, nodeId));
  const typePredicate = options.types?.length ? inArray(ontologyEdges.type, [...options.types]) : undefined;
  const reviewPredicate = options.approvedOnly === false ? undefined : eq(ontologyEdges.reviewState, "approved");
  const rows = await db.select().from(ontologyEdges)
    .where(and(nodePredicate, typePredicate, reviewPredicate))
    .orderBy(asc(ontologyEdges.type), asc(ontologyEdges.id));
  return rows.map(edgeRecord);
}

export async function relatedObjects(
  nodeId: string,
  specialty: SpecialtyId,
  options: { relationTypes?: readonly RelationType[]; limit?: number } = {},
): Promise<OntologyNode[]> {
  requireSpecialty(specialty);
  const relations = await getRelations(nodeId, { direction: "both", types: options.relationTypes, approvedOnly: true });
  const ids = [...new Set(relations.map((edge) => edge.fromId === nodeId ? edge.toId : edge.fromId).filter((id) => id !== nodeId))];
  if (!ids.length) return [];
  const rows = await db.select().from(ontologyNodes)
    .where(and(inArray(ontologyNodes.id, ids), eq(ontologyNodes.specialty, specialty)))
    .orderBy(asc(ontologyNodes.type), asc(ontologyNodes.label));
  return rows.slice(0, options.limit ?? 20).map(nodeRecord);
}

export async function getEvidence(targetKind: "node" | "node_property" | "edge" | "state_fact", targetId: string): Promise<EvidenceRecord[]> {
  return (await db.select().from(evidenceRecords)
    .where(and(eq(evidenceRecords.targetKind, targetKind), eq(evidenceRecords.targetId, targetId)))
    .orderBy(asc(evidenceRecords.capturedAt)))
    .map(evidenceRecord);
}

export async function getStateHistory(nodeId: string, dimension?: StateDimension): Promise<StateFact[]> {
  const rows = await db.select().from(nodeStateFacts)
    .where(and(eq(nodeStateFacts.nodeId, nodeId), dimension ? eq(nodeStateFacts.dimension, dimension) : undefined))
    .orderBy(asc(nodeStateFacts.recordedAt));
  return rows.map((row) => ({
    id: row.id,
    nodeId: row.nodeId,
    dimension: row.dimension,
    value: row.value as StateFact["value"],
    evidenceId: row.evidenceId,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    recordedAt: row.recordedAt,
  }));
}

export async function getVersionChain(nodeId: string, specialty: SpecialtyId): Promise<OntologyNode[]> {
  requireSpecialty(specialty);
  const seed = await getNode(nodeId);
  if (!seed || seed.specialty !== specialty) return [];
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const versionEdges = await getRelations(current, { direction: "both", types: ["supersedes", "version_of"], approvedOnly: true });
    for (const edge of versionEdges) {
      const next = edge.fromId === current ? edge.toId : edge.fromId;
      if (!visited.has(next)) queue.push(next);
    }
  }
  const ids = [...visited];
  const rows = await db.select().from(ontologyNodes)
    .where(and(inArray(ontologyNodes.id, ids), eq(ontologyNodes.specialty, specialty)))
    .orderBy(asc(ontologyNodes.label));
  return rows.map(nodeRecord);
}

/** Write boundary for non-importer callers: validate signatures before persistence. */
export async function upsertOntologyEdge(edge: OntologyEdge): Promise<void> {
  const [from, to] = await Promise.all([getNode(edge.fromId), getNode(edge.toId)]);
  if (!from) throw new Error(`Unknown ontology edge source ${edge.fromId}`);
  if (!to) throw new Error(`Unknown ontology edge target ${edge.toId}`);
  assertRelationAllowed(edge.type, from.type, to.type);
  await db.insert(ontologyEdges).values({
    id: edge.id,
    type: edge.type,
    fromId: edge.fromId,
    toId: edge.toId,
    reviewState: edge.reviewState,
    confidence: edge.confidence,
    attributes: { ...edge.attributes },
  }).onConflictDoUpdate({
    target: ontologyEdges.id,
    set: {
      type: edge.type,
      fromId: edge.fromId,
      toId: edge.toId,
      reviewState: edge.reviewState,
      confidence: edge.confidence,
      attributes: { ...edge.attributes },
    },
  });
}
