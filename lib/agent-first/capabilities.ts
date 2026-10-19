import type { ConnectorMode } from "@/lib/agent-first/types";

export type CapabilityId =
  | "SearchService"
  | "EvidenceService"
  | "SourceService"
  | "FactCheckService"
  | "RiskCheckService"
  | "GuidelineDiffService"
  | "DrugChangeService"
  | "EventService"
  | "LearningService"
  | "MaterialService"
  | "DeidentificationService"
  | "ActionConfirmationService";

export interface CapabilityDescriptor {
  id: CapabilityId;
  mode: ConnectorMode;
  implementation: string;
  userFacing: false;
}

export const capabilityRegistry: Record<CapabilityId, CapabilityDescriptor> = {
  SearchService: { id: "SearchService", mode: "LIVE", implementation: "Golden Set catalog retrieval", userFacing: false },
  EvidenceService: { id: "EvidenceService", mode: "LIVE", implementation: "Catalog provenance projection", userFacing: false },
  SourceService: { id: "SourceService", mode: "LIVE", implementation: "Existing Source model", userFacing: false },
  FactCheckService: { id: "FactCheckService", mode: "MOCK", implementation: "Conservative rules-only gate", userFacing: false },
  RiskCheckService: { id: "RiskCheckService", mode: "MOCK", implementation: "Conservative rules-only gate", userFacing: false },
  GuidelineDiffService: { id: "GuidelineDiffService", mode: "MOCK", implementation: "Retrieval filter only; semantic diff pending", userFacing: false },
  DrugChangeService: { id: "DrugChangeService", mode: "MOCK", implementation: "Timestamp and topic change detection over available catalog", userFacing: false },
  EventService: { id: "EventService", mode: "LIVE", implementation: "Existing event content in catalog", userFacing: false },
  LearningService: { id: "LearningService", mode: "MOCK", implementation: "Education-content selection; curriculum generation pending", userFacing: false },
  MaterialService: { id: "MaterialService", mode: "MOCK", implementation: "Browser-local persistence in preview", userFacing: false },
  DeidentificationService: { id: "DeidentificationService", mode: "UNAVAILABLE", implementation: "No patient-data workflow enabled", userFacing: false },
  ActionConfirmationService: { id: "ActionConfirmationService", mode: "LIVE", implementation: "Explicit confirmation gate for external navigation/action", userFacing: false },
};
