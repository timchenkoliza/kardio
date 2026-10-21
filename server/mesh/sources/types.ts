import type { EvidenceRequirement } from "@/lib/mesh/jobs";
import type { NormalizedDocument, SourceResult } from "@/lib/mesh/evidence";
import type { NormalizedIntent } from "@/lib/mesh/intent";
import type { SourceDescriptor, SourceOperation, SourceStatusReport } from "@/lib/mesh/sources";
import type { AgentContext } from "@/server/agents/context";

/**
 * Runtime SourceAdapter: a descriptor plus execution. Adapters return only
 * normalized documents (with versions, chunks, claims and entities) and an
 * invocation record; they never build UI, persist results or rank across
 * sources. Source-specific business logic lives here and nowhere else.
 */

/** The run context sources may read (shared with the existing tool layer). */
export type SourceContext = AgentContext;

export interface SourceRequest {
  stepId: string;
  operation: SourceOperation;
  requirement: EvidenceRequirement;
  intent: NormalizedIntent;
  ctx: SourceContext;
  /** Epoch ms after which the adapter must not start new network work (hard source deadline). */
  deadlineAt?: number;
  /** Only evidence from this year on (a refinement «данные после 2025»); adapters that can filter by date honour it. */
  since?: number;
}

export interface SourceAdapter extends SourceDescriptor {
  status(): Promise<SourceStatusReport>;
  /** Run one operation for one requirement (search/lookup/discovery). */
  execute(request: SourceRequest): Promise<SourceResult>;
  /**
   * Re-fetch one known document for re-verification and delta detection.
   * Without an intent the document is normalized neutrally (fingerprints for
   * every section); with an intent, claims are extracted for that scenario.
   */
  fetch?(url: string, ctx: Pick<SourceContext, "now" | "nowIso">, intent?: NormalizedIntent | null): Promise<NormalizedDocument | null>;
}
