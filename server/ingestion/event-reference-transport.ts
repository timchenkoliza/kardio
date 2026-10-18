import { createHash } from "node:crypto";
import { transportNormalizedEventReferenceKey } from "@/server/ingestion/event-identity-shape";

export const EVENT_REFERENCE_TRANSPORT_NORMALIZATION_BASIS = "scardio_transport_v1" as const;

export interface EventReferenceTransportIdentity {
  id: string;
  canonicalReferenceUrl: string;
  basis: typeof EVENT_REFERENCE_TRANSPORT_NORMALIZATION_BASIS;
}

export function resolveEventReferenceTransportIdentity(value: string): EventReferenceTransportIdentity | null {
  const canonicalReferenceUrl = transportNormalizedEventReferenceKey(value);
  if (!canonicalReferenceUrl) return null;
  const digest = createHash("sha256").update(canonicalReferenceUrl).digest("hex");
  return {
    id: `event-ref-transport:${digest}`,
    canonicalReferenceUrl,
    basis: EVENT_REFERENCE_TRANSPORT_NORMALIZATION_BASIS,
  };
}
