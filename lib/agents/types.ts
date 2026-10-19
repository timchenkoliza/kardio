/**
 * Agent-first workspace domain model.
 *
 * Hierarchy (non-negotiable):
 *   USER sees JOBS → AGENTS own GOALS → TOOLS own CAPABILITIES → CONNECTORS own ACCESS.
 *
 * These types are shared by server services and client components. They contain
 * no runtime dependencies so they can be imported anywhere.
 */
import type { SpecialtyId } from "@/lib/domain/types";

export type AgentId = "whats_new" | "guidelines" | "drugs" | "research" | "events" | "learning" | "materials";
export const AGENT_IDS: readonly AgentId[] = ["whats_new", "guidelines", "drugs", "research", "events", "learning", "materials"];

/** Integration honesty: every adapter declares exactly one of these. */
export type IntegrationMode = "LIVE" | "MOCK" | "UNAVAILABLE";

/** Where the data behind an adapter actually comes from. */
export type DataOrigin =
  | "runtime_api"        // real external API called at request time
  | "catalog_snapshot"   // canonical Golden Set imported into the product
  | "curated_snapshot"   // real public records collected by the team with URL + retrieval date
  | "user_content"       // material the user added
  | "synthetic_fixture"  // labelled demo data
  | "none";

export type VerificationStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED" | "UNKNOWN";
export type SourceOwnership = "USER_UPLOADED" | "PUBLIC_SOURCE" | "PARTNER_SOURCE" | "GENERATED";

export type EvidenceLevel =
  | "guideline"
  | "regulatory"
  | "peer_reviewed"
  | "professional_news"
  | "secondary_news"
  | "event_listing"
  | "catalog_metadata"
  | "user_material"
  | "unknown";

export type TriggerMode = "on_demand" | "scheduled";
export type Frequency = "important_only" | "daily" | "weekly";
export type DeliveryChannel = "home" | "save" | "notification" | "calendar";
export type ContentTypePref = "research" | "guidelines" | "drugs" | "events" | "learning";
export type EventFormatPref = "moscow" | "spb" | "regions" | "online" | "international";
export type LearningGoal = "nmo_points" | "guideline_refresh" | "new_topic" | "exam_prep";

export type DrugChangeType =
  | "NEW_REGISTRATION"
  | "WITHDRAWAL"
  | "NEW_RESTRICTION"
  | "GUIDELINE_CHANGE"
  | "LABEL_CHANGE"
  | "IMPORTANT_NEW_STUDY";
export const DRUG_CHANGE_TYPES: readonly DrugChangeType[] = ["NEW_REGISTRATION", "WITHDRAWAL", "NEW_RESTRICTION", "GUIDELINE_CHANGE", "LABEL_CHANGE", "IMPORTANT_NEW_STUDY"];

export type ToolName =
  | "searchMedical"
  | "searchPubmed"
  | "searchSources"
  | "retrieveDocument"
  | "rankEvidence"
  | "factCheck"
  | "riskCheck"
  | "guidelineDiff"
  | "findDrugChanges"
  | "searchEvents"
  | "saveMaterial"
  | "indexUserMaterial"
  | "searchUserMaterials"
  | "generateLearningPlan"
  | "matchPartnerContent";

export interface Provenance {
  connectorId: string;
  source: string;
  sourceUrl: string | null;
  publisher: string | null;
  retrievedAt: string;
  publishedAt: string | null;
  version: string | null;
  ownership: SourceOwnership;
  dataOrigin: DataOrigin;
}

export interface Evidence {
  id: string;
  claim: string;
  sourceId: string;
  sourceUrl: string | null;
  sourceType: EvidenceLevel;
  publicationDate: string | null;
  retrievedAt: string;
  evidenceLevel: EvidenceLevel;
  /** Extraction/matching confidence in [0,1]. Never a probability that a medical statement is true. */
  confidence: number;
  verificationStatus: VerificationStatus;
  verificationNote: string | null;
  /** Text from the source that the claim is checked against. */
  supportText: string | null;
  provenance: Provenance;
}

export type ResultKind =
  | "update"
  | "guideline_change"
  | "drug_change"
  | "event"
  | "research_finding"
  | "learning_module"
  | "material_hit"
  | "partner";

export type ResultActionKind = "open_internal" | "open_source" | "save" | "calendar" | "registration" | "email";
export interface ResultAction {
  kind: ResultActionKind;
  label: string;
  href: string | null;
  /** Anything that leaves the product goes through ActionConfirmationService. */
  requiresConfirmation: boolean;
}

export interface SponsorDisclosure {
  sponsor: string;
  label: string;
  disclosure: string;
  synthetic: boolean;
}

export type ResultAttributeValue = string | number | boolean | null;

export interface AgentResult {
  id: string;
  /** Stable identity of the finding. Re-running an agent never duplicates a key. */
  key: string;
  agentId: AgentId;
  specialty: SpecialtyId;
  runId: string;
  kind: ResultKind;
  category: string | null;
  title: string;
  summary: string;
  reasonShown: string[];
  /** When this user first received the finding. Drives "since last visit". */
  createdAt: string;
  /** When the underlying change happened in the source, if known. */
  observedAt: string | null;
  evidence: Evidence[];
  source: Provenance;
  actions: ResultAction[];
  attributes: Record<string, ResultAttributeValue>;
  partner: SponsorDisclosure | null;
  dismissed: boolean;
  savedMaterialId: string | null;
  rank: number;
}

export interface AgentResultView extends AgentResult {
  newSinceLastSeen: boolean;
}

export type RunStatus = "running" | "completed" | "partial" | "failed" | "blocked";
export type RunTrigger = "manual" | "composer" | "schedule_catchup" | "configuration";

export interface PlanStep {
  id: string;
  label: string;
  tool: ToolName | null;
  status: "done" | "skipped" | "failed" | "blocked";
  detail: string | null;
  connectorIds: string[];
}

export interface ToolUse {
  tool: ToolName;
  connectorIds: string[];
  modes: IntegrationMode[];
  status: "ok" | "partial" | "unavailable" | "failed" | "blocked";
  itemCount: number;
  durationMs: number;
  note: string | null;
}

export interface AgentRun {
  id: string;
  agentId: AgentId;
  specialty: SpecialtyId;
  trigger: RunTrigger;
  startedAt: string;
  completedAt: string | null;
  status: RunStatus;
  input: { text: string | null; preferenceDigest: string };
  intent: string | null;
  plan: PlanStep[];
  toolsUsed: ToolUse[];
  resultIds: string[];
  newResultCount: number;
  error: string | null;
  durationMs: number | null;
  riskNotices: string[];
  synthesis: string | null;
}

export interface AgentPreference {
  topics: string[] | null;
  contentTypes: ContentTypePref[];
  frequency: Frequency;
  delivery: DeliveryChannel[];
  formats: EventFormatPref[];
  horizonDays: number;
  goals: LearningGoal[];
}

export interface AgentSubscription {
  agentId: AgentId;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastRunId: string | null;
  lastSeenAt: string | null;
}

export interface UserInterests {
  topics: string[];
  trustedSources: string[];
  excludedSources: string[];
}

export interface UserProfile {
  version: 1;
  specialty: SpecialtyId;
  interests: UserInterests;
  subscriptions: Record<AgentId, AgentSubscription>;
  preferences: Record<AgentId, AgentPreference>;
  partnerContent: boolean;
  learningProgress: Record<string, "done">;
  configuredAt: string | null;
  lastVisitAt: string | null;
  previousVisitAt: string | null;
  updatedAt: string;
}

export type MaterialKind = "link" | "file" | "note" | "agent_result";
export type MaterialParseStatus = "indexed" | "metadata_only" | "parser_unavailable" | "rejected";

export interface Material {
  id: string;
  specialty: SpecialtyId;
  kind: MaterialKind;
  ownership: SourceOwnership;
  title: string;
  url: string | null;
  note: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  text: string | null;
  textChars: number;
  parseStatus: MaterialParseStatus;
  parseNote: string | null;
  redactions: string[];
  sourceResultId: string | null;
  sourceAgentId: AgentId | null;
  provenance: Provenance | null;
  collectionIds: string[];
  createdAt: string;
}

export interface MaterialCollection {
  id: string;
  specialty: SpecialtyId;
  name: string;
  createdAt: string;
}

export type ActionKind = "calendar_write" | "email" | "registration" | "purchase" | "publishing" | "external_link";
export type ActionStatus = "pending_confirmation" | "completed" | "handed_off" | "cancelled" | "unavailable" | "failed";

export interface ActionRequest {
  id: string;
  specialty: SpecialtyId;
  kind: ActionKind;
  status: ActionStatus;
  title: string;
  description: string;
  agentId: AgentId | null;
  resultIds: string[];
  /** What will happen, in plain language, before confirmation. */
  effect: string;
  /** Honest description of what the product can and cannot do for this action. */
  integration: { connectorId: string; mode: IntegrationMode; note: string };
  payload: Record<string, ResultAttributeValue | string[]>;
  artifactUrl: string | null;
  createdAt: string;
  decidedAt: string | null;
  completedAt: string | null;
}

export interface ConnectorDescriptor {
  id: string;
  name: string;
  kind: "catalog" | "literature" | "guidelines" | "regulatory" | "events" | "society" | "messenger" | "web" | "user_documents" | "calendar" | "email" | "partner";
  mode: IntegrationMode;
  dataOrigin: DataOrigin;
  snapshotAt: string | null;
  description: string;
  limitations: string;
}

export interface AgentInputSpec {
  id: "text" | "file" | "topics" | "sources" | "formats" | "horizon" | "goals";
  label: string;
  required: boolean;
}

export interface AgentSafetyPolicy {
  prescribing: "forbidden";
  patientIdentifiers: "redact_and_warn";
  imageInterpretation: "forbidden";
  externalActions: "confirmation_required";
  partnerContent: "separate_labelled_slot" | "not_applicable";
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  job: string;
  description: string;
  icon: "sparkles" | "scale" | "pill" | "search" | "calendar" | "graduation" | "folder";
  inputs: AgentInputSpec[];
  preferenceGroups: Array<"topics" | "contentTypes" | "sources" | "frequency" | "delivery" | "formats" | "horizon" | "goals">;
  supportedTools: ToolName[];
  triggerMode: TriggerMode;
  outputSchema: ResultKind[];
  safetyPolicy: AgentSafetyPolicy;
  status: "active" | "experimental";
  defaultPreference: AgentPreference;
}

/** Aggregated, UI-ready card state. Computed on the server from persisted state. */
export interface AgentCardState {
  agentId: AgentId;
  enabled: boolean;
  state: "needs_setup" | "ready" | "fresh" | "stale" | "failed" | "disabled";
  lastRunAt: string | null;
  lastRunStatus: RunStatus | null;
  totalResults: number;
  newResults: number;
  headline: string;
  breakdown: Array<{ label: string; count: number }>;
  reasons: string[];
  primaryAction: { label: string; href: string };
}

export interface WorkspaceView {
  specialty: SpecialtyId;
  profile: UserProfile;
  cards: AgentCardState[];
  recentResults: AgentResultView[];
  materialsCount: number;
  pendingActions: number;
  configured: boolean;
}
