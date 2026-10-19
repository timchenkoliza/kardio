import { NODE_TYPES, type NodeType, type OntologyEdge, type RelationType } from "@/lib/ontology/types";

export interface RelationSignature {
  from: readonly NodeType[];
  to: readonly NodeType[];
  /** When true, the source and target node types must be identical. */
  sameType?: boolean;
}

const worldNodes = NODE_TYPES.filter((type) => type !== "specialty") as NodeType[];

const knowledgeNodes: NodeType[] = [
  "guideline",
  "professional_article",
  "educational_material",
  "professional_event",
  "professional_service",
  "reference_entry",
  "research_study",
  "review",
  "drug_reference",
  "algorithm",
  "tool",
  "calculator",
  "referral_pathway",
  "course",
  "discussion",
  "distribution_post",
];

const versionableNodes: NodeType[] = [
  "guideline",
  "professional_article",
  "educational_material",
  "reference_entry",
  "research_study",
  "review",
  "drug_reference",
  "algorithm",
  "referral_pathway",
];

export const RELATION_SIGNATURES: Readonly<Record<RelationType, RelationSignature>> = {
  applies_to_specialty: { from: worldNodes, to: ["specialty"] },
  concerns: {
    from: knowledgeNodes,
    to: ["topic", "condition", "clinical_concept"],
  },
  useful_for_job: { from: knowledgeNodes, to: ["professional_job"] },
  published_by: {
    from: [
      "guideline",
      "professional_article",
      "educational_material",
      "professional_event",
      "reference_entry",
      "research_study",
      "review",
      "drug_reference",
      "course",
      "discussion",
      "distribution_post",
    ],
    to: ["source", "organization"],
  },
  provided_by: {
    from: ["professional_service", "professional_event", "educational_material", "reference_entry", "professional_article", "course"],
    to: ["organization", "source", "partner"],
  },
  authored_by: {
    from: ["guideline", "professional_article", "educational_material", "reference_entry", "research_study", "review", "drug_reference", "algorithm"],
    to: ["person", "organization"],
  },
  organized_by: { from: ["professional_event", "course"], to: ["organization", "source", "partner"] },
  references: { from: knowledgeNodes, to: worldNodes },
  derived_from: { from: [...knowledgeNodes, "media_asset"], to: [...knowledgeNodes, "external_artifact", "dataset"] },
  version_of: { from: versionableNodes, to: versionableNodes, sameType: true },
  supersedes: { from: versionableNodes, to: versionableNodes, sameType: true },
  related_to: { from: worldNodes, to: worldNodes },
  contains_asset: { from: knowledgeNodes, to: ["media_asset"] },
  depicts: { from: ["media_asset"], to: ["person", "organization", "professional_event", "clinical_concept", "condition"] },
  features_person: { from: knowledgeNodes, to: ["person"] },
  dataset_contains: { from: ["dataset"], to: worldNodes.filter((type) => type !== "dataset" && type !== "external_artifact") },
  originated_from: { from: ["media_asset", "distribution_post"], to: ["external_artifact", "source"] },
};

export function isRelationAllowed(type: RelationType, fromType: NodeType, toType: NodeType): boolean {
  const signature = RELATION_SIGNATURES[type];
  if (!signature.from.includes(fromType) || !signature.to.includes(toType)) return false;
  return !signature.sameType || fromType === toType;
}

export function assertRelationAllowed(type: RelationType, fromType: NodeType, toType: NodeType): void {
  if (!isRelationAllowed(type, fromType, toType)) {
    throw new Error(`Invalid ontology relation ${fromType} -[${type}]-> ${toType}`);
  }
}

export function validateEdgeSignature(edge: OntologyEdge, nodesById: ReadonlyMap<string, { type: NodeType }>): void {
  const from = nodesById.get(edge.fromId);
  const to = nodesById.get(edge.toId);
  if (!from) throw new Error(`Unknown ontology edge source ${edge.fromId}`);
  if (!to) throw new Error(`Unknown ontology edge target ${edge.toId}`);
  assertRelationAllowed(edge.type, from.type, to.type);
}
