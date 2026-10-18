import { mapGoldenSetToOntology } from "@/lib/ontology/goldenset-mapper";
import { validateEdgeSignature } from "@/lib/ontology/relations";
import { loadGoldenSet } from "@/server/ingestion/goldenset";

const loaded = await loadGoldenSet();
const first = mapGoldenSetToOntology(loaded);
const second = mapGoldenSetToOntology(loaded);

if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("Ontology mapping is not deterministic");
if (Object.keys(first.originalContentToNodeId).length !== 54) throw new Error("Expected 54 canonical content mappings");
if (Object.keys(first.originalSourceToNodeId).length !== 18) throw new Error("Expected 18 canonical source mappings");
if (first.evaluationNodeIds.length !== 24 || new Set(first.evaluationNodeIds).size !== 24) throw new Error("Expected 24 unique evaluation mappings");

const nodesById = new Map(first.graph.nodes.map((node) => [node.id, node]));
for (const edge of first.graph.edges) validateEdgeSignature(edge, nodesById);

const report = {
  canonicalChecksum: loaded.checksum,
  mappingChecksum: first.sourceChecksum,
  canonicalContent: Object.keys(first.originalContentToNodeId).length,
  canonicalSources: Object.keys(first.originalSourceToNodeId).length,
  evaluation: first.evaluationNodeIds.length,
  ontologyNodes: first.graph.nodes.length,
  ontologyEdges: first.graph.edges.length,
  evidenceRecords: first.graph.evidence.length,
  stateFacts: first.graph.stateFacts.length,
  invalidRelations: 0,
  oncologyFallbackNodes: first.graph.nodes.filter((node) => node.specialty === "oncology").length,
  deterministic: true,
};

console.log(JSON.stringify(report, null, 2));
