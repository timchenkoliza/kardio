import type { EffectivePreference } from "@/lib/agents/profile";
import type { AgentId, AgentRun, Material, RunExperience, UserProfile } from "@/lib/agents/types";
import type { ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import type { NormalizedIntent } from "@/lib/mesh/intent";
import type { Strategy } from "@/lib/mesh/strategy";
import type { AnswerMode } from "@/lib/portal/answer-mode";
import type { PortalJob } from "@/lib/portal/jobs";
import type { BrowserDriver } from "@/server/mesh/browser/drivers";
import type { DrugLabelResult } from "./adapters/openfda";
import type { PubmedQuery, PubmedSearchResult } from "./adapters/pubmed";
import type { PubmedAbstractsResult } from "./adapters/pubmed-abstracts";

/** Everything a tool may read during one agent run. Built once per run. */
export interface AgentContext {
  agentId: AgentId;
  specialty: SpecialtyId;
  now: Date;
  nowIso: string;
  profile: UserProfile;
  preference: EffectivePreference;
  lastSeenAt: string | null;
  catalog: { content: ContentObject[]; sources: Source[] };
  materials: Material[];
  pubmed: (query: PubmedQuery) => Promise<PubmedSearchResult>;
  /** Batch abstract reader (NCBI efetch). */
  abstracts: (pmids: readonly string[]) => Promise<PubmedAbstractsResult>;
  /** Drug label lookup (openFDA). */
  drugLabel: (genericName: string) => Promise<DrugLabelResult>;
  inputText: string | null;
  /** Physician job when the run was started from the portal. */
  job: PortalJob | null;
  /** Depth asked for with the request (run metadata); null for background runs. */
  answerMode?: AnswerMode | null;
  /** This physician's earlier runs in this specialty (newest first): real behaviour signals, never invented. */
  history: AgentRun[];
  /** Compiled intent when the run came from the portal input (mesh-executed jobs). */
  intent?: NormalizedIntent | null;
  /** Execution strategy (Skill fast path, dynamic plan) decided for this run. */
  strategy?: Strategy | null;
  /** Browser driver for browser-capable sources; undefined = select automatically, null = none. */
  browserDriver?: BrowserDriver | null;
  /** Session for internal observability (ids only). */
  sessionId?: string | null;
  /** Durable progress of a run created before execution (progressive result page). */
  progress?: RunProgressSink | null;
}

/** Progress of a running job: validated partial experiences and which sources are still being checked. */
export interface RunProgressSink {
  publish(update: { experience: RunExperience | null; pending: Array<{ name: string; slow: boolean }>; stepsDone: number; stepsTotal: number }): void;
}
