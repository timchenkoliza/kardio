import type { ActionKind } from "@/lib/agents/types";
import type { EvidenceRequirement } from "./jobs";
import type { SourceId } from "./sources";

/**
 * Connector = SourceConnector | ActionConnector.
 *
 *   SourceConnector  reads evidence (MEDI, PubMed, openFDA, snapshots, hand-offs);
 *                    never changes anything outside the product.
 *   ActionConnector  acts outside the product on the physician's behalf; every
 *                    external mutation is prepared first and executed only after
 *                    explicit confirmation (ActionConfirmationService).
 *
 * This phase adds no external action: the action set is exactly the one the
 * confirmation service already prepares.
 */

export interface SourceConnector {
  kind: "source";
  sourceId: SourceId;
  /** Requirements this connector can satisfy (from its descriptor). */
  provides: readonly EvidenceRequirement[];
  mutatesExternalState: false;
}

export interface ActionConnector {
  kind: "action";
  action: ActionKind;
  /** Does executing it change something outside the product (a calendar, an account, a message)? */
  mutatesExternalState: boolean;
  /** Always true: nothing outside the product happens without the physician's confirmation. */
  requiresConfirmation: true;
  /** Available now, or only a hand-off (download, draft, open a page). */
  execution: "handoff" | "unavailable";
}

export type Connector = SourceConnector | ActionConnector;

/** The external actions the product can prepare today — none of them executes without confirmation. */
export const ACTION_CONNECTORS: readonly ActionConnector[] = [
  { kind: "action", action: "calendar_write", mutatesExternalState: true, requiresConfirmation: true, execution: "handoff" },
  { kind: "action", action: "email", mutatesExternalState: true, requiresConfirmation: true, execution: "handoff" },
  { kind: "action", action: "registration", mutatesExternalState: true, requiresConfirmation: true, execution: "handoff" },
  { kind: "action", action: "external_link", mutatesExternalState: false, requiresConfirmation: true, execution: "handoff" },
  { kind: "action", action: "purchase", mutatesExternalState: true, requiresConfirmation: true, execution: "unavailable" },
  { kind: "action", action: "publishing", mutatesExternalState: true, requiresConfirmation: true, execution: "unavailable" },
];

export function sourceConnector(descriptor: { id: SourceId; provides: readonly EvidenceRequirement[] }): SourceConnector {
  return { kind: "source", sourceId: descriptor.id, provides: descriptor.provides, mutatesExternalState: false };
}

export function needsConfirmation(connector: Connector): boolean {
  return connector.kind === "action";
}
