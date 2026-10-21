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
}

export interface SourceAdapter extends SourceDescriptor {
  status(): Promise<SourceStatusReport>;
  /** Run one operation for one requirement (search/lookup/discovery). */
  execute(request: SourceRequest): Promise<SourceResult>;
  /** Re-fetch one known document for re-verification and delta detection. */
  fetch?(url: string, ctx: Pick<SourceContext, "now" | "nowIso">): Promise<NormalizedDocument | null>;
}
