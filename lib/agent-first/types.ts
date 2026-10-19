import type { SpecialtyId } from "@/lib/domain/types";

export type IntentKind = "research" | "prepare" | "simulate" | "act";
export type AgentId =
  | "whats-new"
  | "guideline-change"
  | "drug-change"
  | "research"
  | "events"
  | "learning"
  | "materials";
export type ConnectorMode = "LIVE" | "MOCK" | "UNAVAILABLE";
export type VerificationStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED" | "UNKNOWN";
export type AgentStatus = "ready" | "needs_configuration" | "unavailable";

export interface Evidence {
  claim: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string | null;
  sourceType: string;
  publisher: string | null;
  publicationDate: string | null;
  retrievedAt: string;
  evidenceLevel: string;
  confidence: number | null;
  verificationStatus: VerificationStatus;
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  job: string;
  description: string;
  supportedTools: string[];
  triggerMode: "manual" | "manual_or_scheduled";
  safetyPolicy: string;
  status: AgentStatus;
  exampleTask: string;
  primaryAction: string;
}

export interface AgentPreference {
  topics: string[];
  contentTypes: string[];
  trustedSources: string[];
  excludedSources: string[];
  frequency: "important" | "daily" | "weekly";
  delivery: Array<"home" | "save" | "notification" | "calendar">;
}

export interface AgentPlan {
  intent: IntentKind;
  agentId: AgentId;
  steps: string[];
  requiresApproval: boolean;
}

export interface AgentAction {
  id: string;
  label: string;
  kind: "open_source" | "save_material" | "open_registration" | "calendar_write" | "email_send";
  availability: ConnectorMode;
  requiresConfirmation: boolean;
  url?: string;
  unavailableReason?: string;
}

export interface AgentResultItem {
  id: string;
  title: string;
  summary: string;
  reasonShown: string;
  createdAt: string | null;
  newSinceLastSeen: boolean;
  verificationStatus: VerificationStatus;
  evidence: Evidence[];
  actions: AgentAction[];
}

export interface AgentResult {
  id: string;
  agentId: AgentId;
  title: string;
  summary: string;
  reasonShown: string;
  createdAt: string;
  newSinceLastSeen: number;
  items: AgentResultItem[];
}

export interface AgentRun {
  id: string;
  agentId: AgentId;
  specialty: SpecialtyId;
  startedAt: string;
  completedAt: string;
  status: "completed" | "failed";
  input: string;
  toolsUsed: string[];
  resultIds: string[];
  error: string | null;
  durationMs: number;
}

export interface RunAgentResponse {
  run: AgentRun;
  result: AgentResult;
  connectorModes: Record<string, ConnectorMode>;
}

export type MaterialOwnership = "USER_UPLOADED" | "PUBLIC_SOURCE" | "PARTNER_SOURCE" | "GENERATED";

export interface PersonalMaterial {
  id: string;
  title: string;
  kind: "link" | "note" | "file" | "agent_result";
  ownership: MaterialOwnership;
  createdAt: string;
  sourceUrl?: string;
  content?: string;
  indexingStatus: "INDEXED_LOCAL" | "METADATA_ONLY" | "UNAVAILABLE";
  indexingNote?: string;
}
