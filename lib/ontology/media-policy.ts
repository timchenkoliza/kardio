import type { StateValueMap } from "@/lib/ontology/types";

export interface MediaEligibilityInput {
  rights: StateValueMap["rights"];
  editorial: StateValueMap["editorial"];
  availability: StateValueMap["availability"];
  semanticMatch: StateValueMap["semantic_media_match"];
}

const productRights = new Set<StateValueMap["rights"]>(["approved_product", "licensed", "public_domain"]);
const acceptableSemanticMatch = new Set<StateValueMap["semantic_media_match"]>(["strong", "exact"]);

/**
 * Single domain policy for product-eligible editorial media.
 * UI components must not recreate or weaken this decision independently.
 */
export function isProductEligible(asset: MediaEligibilityInput): boolean {
  return (
    productRights.has(asset.rights)
    && asset.editorial === "approved"
    && asset.availability === "available"
    && acceptableSemanticMatch.has(asset.semanticMatch)
  );
}
