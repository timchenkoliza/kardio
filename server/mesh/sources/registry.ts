import type { SourceDescriptor, SourceId } from "@/lib/mesh/sources";
import type { BrowserDriver } from "../browser/drivers";
import type { SiteProfile } from "../browser/tool";
import { createGrlsAdapter, createRubricatorAdapter } from "./handoffs";
import { createMediAdapter } from "./medi";
import { createOpenfdaAdapter } from "./openfda";
import { createPubmedAdapter } from "./pubmed";
import { createCatalogAdapter, createEscAdapter, createRegulatoryAdapter } from "./snapshots";
import type { SourceAdapter } from "./types";

/**
 * Typed source registry. Adding a source is adding an adapter here; the
 * planner, evidence graph, compiler and renderer do not change.
 */
export type SourceRegistry = Record<SourceId, SourceAdapter>;

export function createSourceRegistry(options: { browserDriver?: BrowserDriver | null; site?: Partial<SiteProfile> } = {}): SourceRegistry {
  return {
    pubmed: createPubmedAdapter(),
    openfda: createOpenfdaAdapter(),
    medi: createMediAdapter({ ...(options.browserDriver !== undefined ? { driver: options.browserDriver } : {}), ...(options.site ? { site: options.site } : {}) }),
    goldenset_catalog: createCatalogAdapter(),
    esc_guidelines_snapshot: createEscAdapter(),
    regulatory_snapshot: createRegulatoryAdapter(),
    minzdrav_rubricator: createRubricatorAdapter(),
    grls: createGrlsAdapter(),
  };
}

export function descriptors(registry: SourceRegistry): SourceDescriptor[] {
  return Object.values(registry).map(({ id, name, connectorId, domains, specialties, jobs, provides, operations, authority, execution, freshnessPolicy, cachePolicy, usagePolicy, cost, handoffUrl }) => ({ id, name, connectorId, domains, specialties, jobs, provides, operations, authority, execution, freshnessPolicy, cachePolicy, usagePolicy, cost, handoffUrl }));
}
