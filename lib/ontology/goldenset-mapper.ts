import { createHash } from "node:crypto";
import { resolveCurrentness } from "@/lib/currentness";
import { createEvidence } from "@/lib/ontology/evidence";
import { evidenceId, ontologyEdgeId, ontologyNodeId, specialtyNodeId, stateFactId } from "@/lib/ontology/ids";
import { validateEdgeSignature } from "@/lib/ontology/relations";
import type {
  DomainEvent,
  EvidenceRecord,
  NodeType,
  OntologyEdge,
  OntologyGraph,
  OntologyNode,
  StateFact,
  StateValueMap,
} from "@/lib/ontology/types";
import type { CanonicalContent, ImageEnrichment, LoadedGoldenSet } from "@/server/ingestion/goldenset";

const SPECIALTY = "cardiology" as const;
const NAMESPACE = "goldenset";

export interface GoldenSetOntologyMapping {
  graph: OntologyGraph;
  sourceChecksum: string;
  evaluationNodeIds: readonly string[];
  originalContentToNodeId: Readonly<Record<string, string>>;
  originalSourceToNodeId: Readonly<Record<string, string>>;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableTextKey(value: string): string {
  return createHash("sha256").update(value.trim().toLocaleLowerCase("ru-RU")).digest("hex").slice(0, 20);
}

function isoDate(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function contentNodeType(raw: CanonicalContent): NodeType {
  switch (raw.content_type) {
    case "Клинические рекомендации": return "guideline";
    case "Видеолекция":
    case "ТВ-студия": return "educational_material";
    case "Вебинар": return "professional_event";
    case "Сервис членства": return "professional_service";
    case "Клиническая карточка": return "reference_entry";
    case "Новости журнала":
    case "Новости Общества":
    case "Проект": return "professional_article";
  }
}

function rightsFromRenderPolicy(raw: ImageEnrichment["mappings"][string]): StateValueMap["rights"] {
  switch (raw.render_policy) {
    case "publishable": return "approved_product";
    case "prototype_only_until_rights_verified": return "prototype_only";
    case "do_not_render": return "source_reference_only";
  }
}

function currentnessFromCanonical(raw: CanonicalContent): StateValueMap["currentness"] {
  const resolved = resolveCurrentness(raw).currentness;
  return resolved;
}

export function mapGoldenSetToOntology(
  loaded: Pick<LoadedGoldenSet, "dataset" | "evaluation" | "enrichment" | "checksum">,
): GoldenSetOntologyMapping {
  const nodes = new Map<string, OntologyNode>();
  const edges = new Map<string, OntologyEdge>();
  const evidence = new Map<string, EvidenceRecord>();
  const stateFacts = new Map<string, StateFact>();
  const events = new Map<string, DomainEvent>();

  const contentIds: Record<string, string> = {};
  const sourceIds: Record<string, string> = {};

  const specialtyId = specialtyNodeId(SPECIALTY);
  const datasetId = ontologyNodeId({ type: "dataset", specialty: SPECIALTY, namespace: NAMESPACE, originalId: loaded.dataset.meta.name });
  const capturedAt = isoDate(loaded.dataset.meta.last_checked_at);

  const putNode = (node: OntologyNode): string => {
    const existing = nodes.get(node.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(node)) throw new Error(`Conflicting ontology node ${node.id}`);
    nodes.set(node.id, node);
    return node.id;
  };

  const putEvidence = (record: EvidenceRecord): string => {
    const existing = evidence.get(record.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) throw new Error(`Conflicting evidence ${record.id}`);
    evidence.set(record.id, record);
    return record.id;
  };

  const nodeEvidence = (node: OntologyNode, originalId: string, externalUrl: string | null, notes: string | null = null): string => {
    const id = evidenceId(NAMESPACE, node.id, "canonical-node");
    return putEvidence(createEvidence({
      id,
      target: { kind: "node", nodeId: node.id },
      type: "canonical_import",
      externalUrl,
      artifactRef: `${loaded.dataset.meta.name}:${originalId}`,
      capturedAt,
      verifiedAt: capturedAt,
      extractionMethod: "deterministic_golden_set_mapping",
      confidence: 1,
      verification: "verified",
      notes,
    }));
  };

  const putEdge = (edge: Omit<OntologyEdge, "evidenceIds">, evidenceRecord?: EvidenceRecord): string => {
    const ids = evidenceRecord ? [putEvidence(evidenceRecord)] : [];
    const complete: OntologyEdge = { ...edge, evidenceIds: ids };
    const existing = edges.get(complete.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(complete)) throw new Error(`Conflicting ontology edge ${complete.id}`);
    edges.set(complete.id, complete);
    return complete.id;
  };

  const addCanonicalEdge = (args: {
    type: OntologyEdge["type"];
    fromId: string;
    toId: string;
    sourceKey: string;
    externalUrl?: string | null;
    attributes?: Record<string, unknown>;
  }): string => {
    const id = ontologyEdgeId({ type: args.type, fromId: args.fromId, toId: args.toId, discriminator: args.sourceKey });
    const evId = evidenceId(NAMESPACE, id, "canonical-edge");
    const record = createEvidence({
      id: evId,
      target: { kind: "edge", edgeId: id },
      type: "canonical_import",
      externalUrl: args.externalUrl ?? null,
      artifactRef: `${loaded.dataset.meta.name}:${args.sourceKey}`,
      capturedAt,
      verifiedAt: capturedAt,
      extractionMethod: "deterministic_golden_set_mapping",
      confidence: 1,
      verification: "verified",
    });
    return putEdge({ id, type: args.type, fromId: args.fromId, toId: args.toId, reviewState: "approved", confidence: 1, attributes: args.attributes ?? {} }, record);
  };

  const addState = <D extends StateFact["dimension"]>(args: {
    nodeId: string;
    dimension: D;
    value: StateValueMap[D];
    sourceKey: string;
    evidenceId?: string | null;
    validFrom?: string;
  }): void => {
    const id = stateFactId(args.nodeId, args.dimension, args.sourceKey);
    const fact: StateFact<D> = {
      id,
      nodeId: args.nodeId,
      dimension: args.dimension,
      value: args.value,
      evidenceId: args.evidenceId ?? null,
      validFrom: args.validFrom ?? capturedAt,
      validUntil: null,
      recordedAt: capturedAt,
    };
    stateFacts.set(id, fact as StateFact);
  };

  putNode({ id: specialtyId, type: "specialty", specialty: SPECIALTY, label: "Кардиология", originalId: SPECIALTY, namespace: "system", attributes: {}, raw: null });
  putNode({
    id: datasetId,
    type: "dataset",
    specialty: SPECIALTY,
    label: loaded.dataset.meta.name,
    originalId: loaded.dataset.meta.name,
    namespace: NAMESPACE,
    attributes: { checksum: loaded.checksum, contentCount: 54, sourceCount: 18, generatedFrom: loaded.dataset.meta.generated_from },
    raw: loaded.dataset.meta,
  });
  const datasetEvidence = nodeEvidence(nodes.get(datasetId)!, loaded.dataset.meta.name, null, "Canonical Cardiology Golden Set dataset identity");
  addCanonicalEdge({ type: "applies_to_specialty", fromId: datasetId, toId: specialtyId, sourceKey: "dataset-specialty" });
  addState({ nodeId: datasetId, dimension: "editorial", value: "approved", sourceKey: "dataset", evidenceId: datasetEvidence });

  for (const raw of loaded.dataset.sources) {
    const id = ontologyNodeId({ type: "source", specialty: SPECIALTY, namespace: NAMESPACE, originalId: raw.source_id });
    sourceIds[raw.source_id] = id;
    const node: OntologyNode = {
      id,
      type: "source",
      specialty: SPECIALTY,
      label: raw.name,
      originalId: raw.source_id,
      namespace: NAMESPACE,
      attributes: {
        url: raw.url,
        domain: raw.domain,
        language: raw.language,
        category: raw.category,
        subcategory: raw.subcategory,
        commercialStatus: raw.commercial_status,
        sourceRole: raw.source_role,
        qaStatus: raw.qa_status,
        lastCheckedAt: raw.last_checked_at,
        notes: raw.notes,
      },
      raw,
    };
    putNode(node);
    const ev = nodeEvidence(node, raw.source_id, raw.url, raw.notes);
    addState({ nodeId: id, dimension: "source_standing", value: "observed", sourceKey: raw.source_id, evidenceId: ev, validFrom: isoDate(raw.last_checked_at) });
    addState({ nodeId: id, dimension: "availability", value: "unknown", sourceKey: raw.source_id, evidenceId: ev, validFrom: isoDate(raw.last_checked_at) });
    addCanonicalEdge({ type: "applies_to_specialty", fromId: id, toId: specialtyId, sourceKey: raw.source_id, externalUrl: raw.url });
    addCanonicalEdge({ type: "dataset_contains", fromId: datasetId, toId: id, sourceKey: `source:${raw.source_id}` });
  }

  for (const raw of loaded.dataset.content) {
    const type = contentNodeType(raw);
    const id = ontologyNodeId({ type, specialty: SPECIALTY, namespace: NAMESPACE, originalId: raw.golden_id });
    contentIds[raw.golden_id] = id;
    const node: OntologyNode = {
      id,
      type,
      specialty: SPECIALTY,
      label: raw.title,
      originalId: raw.golden_id,
      namespace: NAMESPACE,
      attributes: {
        canonicalTopicId: raw.canonical_topic_id,
        contentType: raw.content_type,
        format: raw.format,
        summary: raw.card_summary,
        topic: raw.topic,
        clinicalTask: raw.clinical_task,
        audience: raw.audience,
        publicationDate: raw.publication_date,
        publicationYear: raw.publication_year,
        canonicalUrl: raw.source_url,
        sourceLocation: raw.source_location,
        provenanceType: raw.provenance_type,
        trustLayer: raw.trust_layer,
        category: raw.category,
        subcategory: raw.subcategory,
        commercialStatus: raw.commercial_status,
        freshnessStatus: raw.freshness_status,
        lastCheckedAt: raw.last_checked_at,
        language: raw.language,
        tags: raw.tags.split(";").map((tag) => tag.trim()).filter(Boolean),
        prototypeSurface: raw.prototype_surface,
        prototypePriority: raw.prototype_priority,
      },
      raw,
    };
    putNode(node);
    const ev = nodeEvidence(node, raw.golden_id, raw.source_url, raw.qa_notes);

    addState({ nodeId: id, dimension: "currentness", value: currentnessFromCanonical(raw), sourceKey: `${raw.golden_id}:currentness`, evidenceId: ev, validFrom: isoDate(raw.last_checked_at) });
    addState({ nodeId: id, dimension: "editorial", value: "candidate", sourceKey: `${raw.golden_id}:editorial`, evidenceId: ev, validFrom: isoDate(raw.last_checked_at) });
    addState({ nodeId: id, dimension: "rights", value: "unknown", sourceKey: `${raw.golden_id}:rights`, evidenceId: ev, validFrom: isoDate(raw.last_checked_at) });
    addState({ nodeId: id, dimension: "availability", value: "unknown", sourceKey: `${raw.golden_id}:availability`, evidenceId: ev, validFrom: isoDate(raw.last_checked_at) });

    addCanonicalEdge({ type: "applies_to_specialty", fromId: id, toId: specialtyId, sourceKey: raw.golden_id, externalUrl: raw.source_url });
    addCanonicalEdge({ type: "dataset_contains", fromId: datasetId, toId: id, sourceKey: `content:${raw.golden_id}` });

    const sourceNodeId = sourceIds[raw.source_id];
    if (!sourceNodeId) throw new Error(`Missing mapped source ${raw.source_id}`);
    addCanonicalEdge({
      type: type === "professional_service" ? "provided_by" : "published_by",
      fromId: id,
      toId: sourceNodeId,
      sourceKey: `${raw.golden_id}:source`,
      externalUrl: raw.source_url,
    });

    const topicId = ontologyNodeId({ type: "topic", specialty: SPECIALTY, namespace: NAMESPACE, originalId: raw.canonical_topic_id });
    if (!nodes.has(topicId)) {
      const topicNode: OntologyNode = { id: topicId, type: "topic", specialty: SPECIALTY, label: raw.topic, originalId: raw.canonical_topic_id, namespace: NAMESPACE, attributes: {}, raw: null };
      putNode(topicNode);
      nodeEvidence(topicNode, raw.canonical_topic_id, null);
      addCanonicalEdge({ type: "applies_to_specialty", fromId: topicId, toId: specialtyId, sourceKey: `topic:${raw.canonical_topic_id}` });
      addCanonicalEdge({ type: "dataset_contains", fromId: datasetId, toId: topicId, sourceKey: `topic:${raw.canonical_topic_id}` });
    }
    addCanonicalEdge({ type: "concerns", fromId: id, toId: topicId, sourceKey: `${raw.golden_id}:topic` });

    const jobKey = stableTextKey(raw.clinical_task);
    const jobId = ontologyNodeId({ type: "professional_job", specialty: SPECIALTY, namespace: NAMESPACE, originalId: jobKey });
    if (!nodes.has(jobId)) {
      const jobNode: OntologyNode = { id: jobId, type: "professional_job", specialty: SPECIALTY, label: raw.clinical_task, originalId: jobKey, namespace: NAMESPACE, attributes: {}, raw: null };
      putNode(jobNode);
      nodeEvidence(jobNode, jobKey, null);
      addCanonicalEdge({ type: "applies_to_specialty", fromId: jobId, toId: specialtyId, sourceKey: `job:${jobKey}` });
      addCanonicalEdge({ type: "dataset_contains", fromId: datasetId, toId: jobId, sourceKey: `job:${jobKey}` });
    }
    addCanonicalEdge({ type: "useful_for_job", fromId: id, toId: jobId, sourceKey: `${raw.golden_id}:job` });

    if (raw.organization.trim()) {
      const orgKey = stableTextKey(raw.organization);
      const orgId = ontologyNodeId({ type: "organization", specialty: SPECIALTY, namespace: NAMESPACE, originalId: orgKey });
      if (!nodes.has(orgId)) {
        const orgNode: OntologyNode = { id: orgId, type: "organization", specialty: SPECIALTY, label: raw.organization, originalId: orgKey, namespace: NAMESPACE, attributes: {}, raw: null };
        putNode(orgNode);
        nodeEvidence(orgNode, orgKey, raw.source_url);
        addCanonicalEdge({ type: "applies_to_specialty", fromId: orgId, toId: specialtyId, sourceKey: `org:${orgKey}` });
        addCanonicalEdge({ type: "dataset_contains", fromId: datasetId, toId: orgId, sourceKey: `org:${orgKey}` });
      }
      if (type === "professional_service" || type === "professional_event") {
        addCanonicalEdge({ type: "provided_by", fromId: id, toId: orgId, sourceKey: `${raw.golden_id}:organization` });
      } else {
        addCanonicalEdge({ type: "published_by", fromId: id, toId: orgId, sourceKey: `${raw.golden_id}:organization` });
      }
    }

    if (raw.author_expert) {
      const personKey = stableTextKey(raw.author_expert);
      const personId = ontologyNodeId({ type: "person", specialty: SPECIALTY, namespace: NAMESPACE, originalId: personKey });
      if (!nodes.has(personId)) {
        const personNode: OntologyNode = { id: personId, type: "person", specialty: SPECIALTY, label: raw.author_expert, originalId: personKey, namespace: NAMESPACE, attributes: {}, raw: null };
        putNode(personNode);
        nodeEvidence(personNode, personKey, raw.source_url);
        addCanonicalEdge({ type: "applies_to_specialty", fromId: personId, toId: specialtyId, sourceKey: `person:${personKey}` });
        addCanonicalEdge({ type: "dataset_contains", fromId: datasetId, toId: personId, sourceKey: `person:${personKey}` });
      }
      if (["guideline", "professional_article", "educational_material", "reference_entry"].includes(type)) {
        addCanonicalEdge({ type: "authored_by", fromId: id, toId: personId, sourceKey: `${raw.golden_id}:author` });
      } else if (type === "professional_event") {
        addCanonicalEdge({ type: "features_person", fromId: id, toId: personId, sourceKey: `${raw.golden_id}:expert` });
      }
    }

    const image = loaded.enrichment.mappings[raw.golden_id];
    if (image) {
      const assetOriginalId = image.asset_filename ?? image.image_url ?? `asset-${raw.golden_id}`;
      const assetId = ontologyNodeId({ type: "media_asset", specialty: SPECIALTY, namespace: NAMESPACE, originalId: assetOriginalId });
      const assetNode: OntologyNode = {
        id: assetId,
        type: "media_asset",
        specialty: SPECIALTY,
        label: image.image_credit ?? image.asset_filename ?? `Media for ${raw.title}`,
        originalId: assetOriginalId,
        namespace: NAMESPACE,
        attributes: {
          assetFilename: image.asset_filename ?? null,
          imageUrl: image.image_url ?? null,
          imageOrigin: image.image_origin,
          imageSourceName: image.image_source_name,
          imageSourceUrl: image.image_source_url,
          imageCredit: image.image_credit,
          semanticRole: image.image_semantic_role,
          usageNote: image.image_usage_note,
          renderPolicy: image.render_policy,
        },
        raw: image,
      };
      putNode(assetNode);
      const assetEvidence = nodeEvidence(assetNode, assetOriginalId, image.image_source_url, image.image_usage_note);
      addState({ nodeId: assetId, dimension: "rights", value: rightsFromRenderPolicy(image), sourceKey: `${raw.golden_id}:asset-rights`, evidenceId: assetEvidence });
      addState({ nodeId: assetId, dimension: "editorial", value: image.image_status === "verified" ? "approved" : "needs_review", sourceKey: `${raw.golden_id}:asset-editorial`, evidenceId: assetEvidence });
      addState({ nodeId: assetId, dimension: "semantic_media_match", value: image.image_status === "verified" ? "strong" : "candidate", sourceKey: `${raw.golden_id}:asset-match`, evidenceId: assetEvidence });
      addState({ nodeId: assetId, dimension: "availability", value: image.asset_filename || image.image_url ? "available" : "unknown", sourceKey: `${raw.golden_id}:asset-availability`, evidenceId: assetEvidence });
      addCanonicalEdge({ type: "applies_to_specialty", fromId: assetId, toId: specialtyId, sourceKey: `${raw.golden_id}:asset-specialty` });
      addCanonicalEdge({ type: "dataset_contains", fromId: datasetId, toId: assetId, sourceKey: `${raw.golden_id}:asset-dataset` });
      addCanonicalEdge({ type: "contains_asset", fromId: id, toId: assetId, sourceKey: `${raw.golden_id}:asset` });
    }
  }

  for (const raw of loaded.dataset.content) {
    const nodeId = contentIds[raw.golden_id];
    if (!nodeId) throw new Error(`Missing mapped content ${raw.golden_id}`);
    if (raw.parent_document_id) {
      const parentId = contentIds[raw.parent_document_id];
      if (!parentId) throw new Error(`Missing parent mapping ${raw.parent_document_id}`);
      addCanonicalEdge({ type: "related_to", fromId: nodeId, toId: parentId, sourceKey: `${raw.golden_id}:parent`, attributes: { originalField: "parent_document_id" } });
    }
    if (raw.supersedes_id) {
      const olderId = contentIds[raw.supersedes_id];
      if (!olderId) throw new Error(`Missing supersedes mapping ${raw.supersedes_id}`);
      addCanonicalEdge({ type: "supersedes", fromId: nodeId, toId: olderId, sourceKey: `${raw.golden_id}:supersedes` });
    }
  }

  const nodesById = new Map([...nodes.values()].map((node) => [node.id, node]));
  for (const edge of edges.values()) validateEdgeSignature(edge, nodesById);

  const evaluationNodeIds = loaded.evaluation.golden_ids.map((id) => {
    const mapped = contentIds[id];
    if (!mapped) throw new Error(`Evaluation object was not mapped: ${id}`);
    return mapped;
  });

  const sourceChecksum = hashJson(loaded.dataset.content);

  return {
    graph: {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      evidence: [...evidence.values()],
      stateFacts: [...stateFacts.values()],
      events: [...events.values()],
    },
    sourceChecksum,
    evaluationNodeIds,
    originalContentToNodeId: Object.freeze({ ...contentIds }),
    originalSourceToNodeId: Object.freeze({ ...sourceIds }),
  };
}
