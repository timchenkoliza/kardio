import { beforeAll, describe, expect, it } from "vitest";
import { resolveCurrentness } from "@/lib/currentness";
import { mapGoldenSetToOntology, type GoldenSetOntologyMapping } from "@/lib/ontology/goldenset-mapper";
import { isProductEligible } from "@/lib/ontology/media-policy";
import { assertRelationAllowed, validateEdgeSignature } from "@/lib/ontology/relations";
import { effectiveEvidenceVerification } from "@/lib/ontology/states";
import type { LoadedGoldenSet } from "@/server/ingestion/goldenset";
import { loadGoldenSet } from "@/server/ingestion/goldenset";

let loaded: LoadedGoldenSet;
let mapped: GoldenSetOntologyMapping;

beforeAll(async () => {
  loaded = await loadGoldenSet();
  mapped = mapGoldenSetToOntology(loaded);
});

describe("Golden Set ontology mapping", () => {
  it("maps all canonical Cardiology identities and the fixed evaluation slice", () => {
    expect(Object.keys(mapped.originalContentToNodeId)).toHaveLength(54);
    expect(Object.keys(mapped.originalSourceToNodeId)).toHaveLength(18);
    expect(mapped.evaluationNodeIds).toHaveLength(24);
    expect(new Set(mapped.evaluationNodeIds).size).toBe(24);
  });

  it("is deterministic and does not mutate canonical input", () => {
    const before = JSON.stringify(loaded.dataset.content);
    const second = mapGoldenSetToOntology(loaded);
    expect(second).toEqual(mapped);
    expect(JSON.stringify(loaded.dataset.content)).toBe(before);
    expect(second.sourceChecksum).toBe(mapped.sourceChecksum);
  });

  it("produces only valid typed relation signatures", () => {
    const nodesById = new Map(mapped.graph.nodes.map((node) => [node.id, node]));
    for (const edge of mapped.graph.edges) expect(() => validateEdgeSignature(edge, nodesById)).not.toThrow();
    expect(() => assertRelationAllowed("authored_by", "media_asset", "topic")).toThrow();
  });

  it("preserves explicit supersession edge count without inventing extra version edges", () => {
    const canonicalSupersedes = loaded.dataset.content.filter((item) => item.supersedes_id).length;
    const mappedSupersedes = mapped.graph.edges.filter((edge) => edge.type === "supersedes").length;
    expect(mappedSupersedes).toBe(canonicalSupersedes);
  });

  it("does not create Oncology fallback data", () => {
    expect(mapped.graph.nodes.filter((node) => node.specialty === "oncology")).toHaveLength(0);
  });

  it("keeps archive distinct from supersession", () => {
    expect(resolveCurrentness({ freshness_status: "archive", is_current: "no", superseded_by_id: null }).currentness).toBe("archived");
    expect(resolveCurrentness({ freshness_status: "superseded", is_current: "no", superseded_by_id: "newer" }).currentness).toBe("superseded");
  });
});

describe("media eligibility", () => {
  it.each([
    [{ rights: "approved_product", editorial: "approved", availability: "available", semanticMatch: "exact" } as const, true],
    [{ rights: "licensed", editorial: "approved", availability: "available", semanticMatch: "strong" } as const, true],
    [{ rights: "public_domain", editorial: "approved", availability: "available", semanticMatch: "exact" } as const, true],
    [{ rights: "unknown", editorial: "approved", availability: "available", semanticMatch: "exact" } as const, false],
    [{ rights: "prototype_only", editorial: "approved", availability: "available", semanticMatch: "exact" } as const, false],
    [{ rights: "approved_product", editorial: "needs_review", availability: "available", semanticMatch: "exact" } as const, false],
    [{ rights: "approved_product", editorial: "approved", availability: "broken", semanticMatch: "exact" } as const, false],
    [{ rights: "approved_product", editorial: "approved", availability: "available", semanticMatch: "candidate" } as const, false],
  ])("applies independent rights/editorial/availability/match gates", (input, expected) => {
    expect(isProductEligible(input)).toBe(expected);
  });
});

describe("TTL semantics", () => {
  it("requires reverification without turning verified evidence false", () => {
    expect(effectiveEvidenceVerification({ verification: "verified", expiresAt: "2026-10-17T00:00:00.000Z", now: new Date("2026-10-18T00:00:00.000Z") })).toBe("needs_reverification");
    expect(effectiveEvidenceVerification({ verification: "verified", expiresAt: "2026-10-19T00:00:00.000Z", now: new Date("2026-10-18T00:00:00.000Z") })).toBe("verified");
  });
});
