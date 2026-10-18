import { db } from "@/db/client";
import {
  evidenceRecords,
  nodeStateFacts,
  ontologyDomainEvents,
  ontologyEdgeEvidence,
  ontologyEdges,
  ontologyNodes,
} from "@/db/ontology-schema";
import { mapGoldenSetToOntology } from "@/lib/ontology/goldenset-mapper";
import type { EvidenceRecord } from "@/lib/ontology/types";
import { loadGoldenSet } from "@/server/ingestion/goldenset";

function evidenceTarget(record: EvidenceRecord): { targetKind: string; targetId: string; targetProperty: string | null } {
  switch (record.target.kind) {
    case "node": return { targetKind: "node", targetId: record.target.nodeId, targetProperty: null };
    case "node_property": return { targetKind: "node_property", targetId: record.target.nodeId, targetProperty: record.target.property };
    case "edge": return { targetKind: "edge", targetId: record.target.edgeId, targetProperty: null };
    case "state_fact": return { targetKind: "state_fact", targetId: record.target.stateFactId, targetProperty: null };
  }
}

export async function importGoldenSetOntology(root = process.cwd()) {
  const loaded = await loadGoldenSet(root);
  const mapped = mapGoldenSetToOntology(loaded);

  await db.transaction(async (tx) => {
    for (const node of mapped.graph.nodes) {
      await tx.insert(ontologyNodes).values({
        id: node.id,
        type: node.type,
        specialty: node.specialty,
        label: node.label,
        originalId: node.originalId,
        namespace: node.namespace,
        attributes: { ...node.attributes },
        raw: node.raw ? { ...node.raw } : null,
      }).onConflictDoUpdate({
        target: ontologyNodes.id,
        set: {
          type: node.type,
          specialty: node.specialty,
          label: node.label,
          originalId: node.originalId,
          namespace: node.namespace,
          attributes: { ...node.attributes },
          raw: node.raw ? { ...node.raw } : null,
        },
      });
    }

    for (const edge of mapped.graph.edges) {
      await tx.insert(ontologyEdges).values({
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

    for (const record of mapped.graph.evidence) {
      const target = evidenceTarget(record);
      await tx.insert(evidenceRecords).values({
        id: record.id,
        ...target,
        type: record.type,
        sourceNodeId: record.sourceNodeId,
        externalUrl: record.externalUrl,
        artifactRef: record.artifactRef,
        capturedAt: record.capturedAt,
        verifiedAt: record.verifiedAt,
        extractionMethod: record.extractionMethod,
        confidence: record.confidence,
        verification: record.verification,
        reviewer: record.reviewer,
        rightsState: record.rightsState,
        validFrom: record.validFrom,
        expiresAt: record.expiresAt,
        notes: record.notes,
      }).onConflictDoUpdate({
        target: evidenceRecords.id,
        set: {
          ...target,
          type: record.type,
          sourceNodeId: record.sourceNodeId,
          externalUrl: record.externalUrl,
          artifactRef: record.artifactRef,
          capturedAt: record.capturedAt,
          verifiedAt: record.verifiedAt,
          extractionMethod: record.extractionMethod,
          confidence: record.confidence,
          verification: record.verification,
          reviewer: record.reviewer,
          rightsState: record.rightsState,
          validFrom: record.validFrom,
          expiresAt: record.expiresAt,
          notes: record.notes,
        },
      });
    }

    for (const edge of mapped.graph.edges) {
      for (const recordId of edge.evidenceIds) {
        await tx.insert(ontologyEdgeEvidence).values({ edgeId: edge.id, evidenceId: recordId }).onConflictDoNothing();
      }
    }

    for (const fact of mapped.graph.stateFacts) {
      await tx.insert(nodeStateFacts).values({
        id: fact.id,
        nodeId: fact.nodeId,
        dimension: fact.dimension,
        value: String(fact.value),
        evidenceId: fact.evidenceId,
        validFrom: fact.validFrom,
        validUntil: fact.validUntil,
        recordedAt: fact.recordedAt,
      }).onConflictDoUpdate({
        target: nodeStateFacts.id,
        set: {
          nodeId: fact.nodeId,
          dimension: fact.dimension,
          value: String(fact.value),
          evidenceId: fact.evidenceId,
          validFrom: fact.validFrom,
          validUntil: fact.validUntil,
          recordedAt: fact.recordedAt,
        },
      });
    }

    for (const event of mapped.graph.events) {
      await tx.insert(ontologyDomainEvents).values({
        id: event.id,
        type: event.type,
        subjectNodeId: event.subjectNodeId,
        occurredAt: event.occurredAt,
        evidenceId: event.evidenceId,
        payload: { ...event.payload },
      }).onConflictDoUpdate({
        target: ontologyDomainEvents.id,
        set: {
          type: event.type,
          subjectNodeId: event.subjectNodeId,
          occurredAt: event.occurredAt,
          evidenceId: event.evidenceId,
          payload: { ...event.payload },
        },
      });
    }
  });

  return {
    sourceChecksum: mapped.sourceChecksum,
    canonicalChecksum: loaded.checksum,
    nodes: mapped.graph.nodes.length,
    edges: mapped.graph.edges.length,
    evidence: mapped.graph.evidence.length,
    stateFacts: mapped.graph.stateFacts.length,
    evaluation: mapped.evaluationNodeIds.length,
    canonicalContent: Object.keys(mapped.originalContentToNodeId).length,
    canonicalSources: Object.keys(mapped.originalSourceToNodeId).length,
  };
}
