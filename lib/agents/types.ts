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
import type { AnswerMode } from "@/lib/portal/answer-mode";
import type { SourceStanding } from "./source-policy";

export type AgentId = "reference" | "whats_new" | "guidelines" | "drugs" | "research" | "events" | "learning" | "materials";
export const AGENT_IDS: readonly AgentId[] = ["reference", "whats_new", "guidelines", "drugs", "research", "events", "learning", "materials"];

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
  | "matchPartnerContent"
  | "lookupDrugLabel"
  | "readAbstracts"
  /** One planned source invocation of the source mesh (any source, any execution mode). */
  | "readSource";

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
  /** ISO journal abbreviation for literature (e.g. "Nat Med"). */
  journal?: string | null;
  /** Physician source validation (data/source-validation-b2d.json). */
  standing?: SourceStanding;
  standingNote?: string | null;
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
  | "reference_answer"
  | "drug_label"
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

/**
 * Run lifecycle. A run is durable from the moment its id is returned:
 *   queued → running → partial (validated modules shown, evidence still arriving or limited) → completed
 * failed / blocked are terminal. A run is finished when `completedAt` is set; `partial` with
 * `completedAt` means it finished with limited evidence.
 */
export type RunStatus = "queued" | "running" | "partial" | "completed" | "failed" | "blocked";
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
  input: {
    text: string | null;
    preferenceDigest: string;
    explicitJob?: boolean;
    followup?: boolean;
    /**
     * Execution context decided when the run was created (ids only, never text):
     * entities resolved from the session, the clarification answered, a confirmed plan.
     * Execution re-decides the strategy from these, deterministically.
     */
    context?: { entities: string[]; answered: { id: string; optionId: string | null } | null; planConfirmed: string | null } | null;
    /** How deep the physician asked to go (request override or profile default); shapes execution. */
    answerMode?: AnswerMode;
    /**
     * A follow-up typed on a result that continues its question («А если течение нетяжёлое?»):
     * `text` above is the question with the follow-up added; this keeps what the physician typed
     * and the question it continues, for the result header and the way back.
     */
    continuation?: {
      /** The result the follow-up was typed under (the previous step). */
      runId: string;
      followup: string;
      /** The physician's original question and its result. */
      question: string;
      rootRunId?: string;
      /** Earlier follow-ups between the original question and this one. */
      steps?: string[];
      /** A condition the follow-up replaced («взрослые → дети»), never silently. */
      replaced?: string | null;
    } | null;
    /** The material a new search on its topic was started from (internal path and title): the way back. */
    origin?: { href: string; label: string } | null;
  };
  intent: string | null;
  plan: PlanStep[];
  toolsUsed: ToolUse[];
  resultIds: string[];
  newResultCount: number;
  error: string | null;
  durationMs: number | null;
  riskNotices: string[];
  synthesis: string | null;
  /** Compiled experience of mesh-executed jobs: the manifest and the evidence graph it points at. */
  experience?: RunExperience | null;
  /** Durable progress of a run that has not finished (and the record of how it got there). */
  progress?: RunProgress | null;
  /** How the run was executed: Skill fast path or dynamic plan, flow branches, shadow comparison. */
  execution?: import("@/lib/mesh/execution").RunExecution | null;
  /** Refinements applied to this result in place (result as context), oldest first, bounded. */
  patches?: Array<import("@/lib/mesh/patch").ExperiencePatch>;
}

/** Physician-facing progress of a run; no implementation detail beyond source names. */
export interface RunProgress {
  /** 0 until the first validated module is published; +1 for every published ExperiencePatch. */
  manifestVersion: number;
  stepsTotal: number;
  stepsDone: number;
  /** Sources still being checked; `slow` once a source passed its soft deadline. */
  pending: Array<{ name: string; slow: boolean }>;
  /** Milliseconds from run creation to the first validated useful module. */
  firstModuleMs: number | null;
  /** Execution must finish by this time; a run still open after it is reported as expired. */
  deadlineAt: string;
  updatedAt: string;
  patch: import("@/lib/mesh/patch").ExperiencePatch | null;
}

/**
 * Stored with the run so the result page renders exactly what was compiled.
 * Types live in lib/mesh; kept structural here to avoid a dependency cycle.
 */
export interface RunExperience {
  intentId: string;
  manifest: import("@/lib/mesh/manifest").ExperienceManifest;
  graph: import("@/lib/mesh/evidence").EvidenceGraph;
  plan: { id: string; steps: number; invocations: number; reused: boolean };
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

/** The physician's own identity for the profile surface: optional, never patient data. */
export interface ProfileIdentity {
  name: string | null;
  workplace: string | null;
  experienceYears: number | null;
}

export interface UserProfile {
  version: 1;
  specialty: SpecialtyId;
  interests: UserInterests;
  /** When the topics last changed: the feed's checks rerun on the next visit, wherever the topics were edited. */
  topicsChangedAt?: string | null;
  /** Default depth of an answer; a request may override it. */
  answerMode: AnswerMode;
  identity: ProfileIdentity;
  subscriptions: Record<AgentId, AgentSubscription>;
  preferences: Record<AgentId, AgentPreference>;
  partnerContent: boolean;
  learningProgress: Record<string, "done">;
  configuredAt: string | null;
  lastVisitAt: string | null;
  previousVisitAt: string | null;
  /** First portal open for this specialty (retention cohort anchor). */
  firstSeenAt: string | null;
  /** First result page with at least one source-supported finding (activation). */
  firstValueAt: string | null;
  updatedAt: string;
}

export type MaterialKind = "link" | "file" | "note" | "agent_result";
export type MaterialParseStatus = "indexed" | "metadata_only" | "parser_unavailable" | "rejected";
/** What a material is, for sorting and filtering in «Мои материалы». Older materials have none and are derived from kind. */
export type MaterialFormat = "guideline" | "review" | "study" | "article" | "drug_label" | "video" | "website" | "file" | "note" | "result";

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
  /** Format, document type and a short line (journal · date · authors) when the link was recognised. */
  format?: MaterialFormat | null;
  typeLabel?: string | null;
  summary?: string | null;
  /** The question a saved result came from: the way back to it from «Мои материалы». */
  origin?: { runId: string; question: string } | null;
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
  kind: "catalog" | "literature" | "guidelines" | "regulatory" | "drug_labels" | "professional_reference" | "events" | "society" | "messenger" | "web" | "user_documents" | "calendar" | "email" | "partner";
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
  icon: "sparkles" | "scale" | "pill" | "search" | "calendar" | "graduation" | "folder" | "answer";
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
  highlights: string[];
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
