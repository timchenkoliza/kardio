import type { SpecialtyId } from "@/lib/domain/types";
import type { NodeType, OntologySpecialty, RelationType } from "@/lib/ontology/types";

function encodePart(value: string): string {
  return encodeURIComponent(value.trim());
}

export function ontologyNodeId(args: {
  type: NodeType;
  specialty: OntologySpecialty;
  namespace: string;
  originalId: string;
}): string {
  const specialty = args.specialty ?? "global";
  return `${args.type}:${specialty}:${encodePart(args.namespace)}:${encodePart(args.originalId)}`;
}

export function specialtyNodeId(specialty: SpecialtyId): string {
  return ontologyNodeId({ type: "specialty", specialty, namespace: "system", originalId: specialty });
}

export function ontologyEdgeId(args: {
  type: RelationType;
  fromId: string;
  toId: string;
  discriminator?: string;
}): string {
  const suffix = args.discriminator ? `:${encodePart(args.discriminator)}` : "";
  return `edge:${args.type}:${encodePart(args.fromId)}:${encodePart(args.toId)}${suffix}`;
}

export function evidenceId(namespace: string, targetId: string, discriminator: string): string {
  return `evidence:${encodePart(namespace)}:${encodePart(targetId)}:${encodePart(discriminator)}`;
}

export function stateFactId(nodeId: string, dimension: string, sourceKey: string): string {
  return `state:${encodePart(nodeId)}:${encodePart(dimension)}:${encodePart(sourceKey)}`;
}
