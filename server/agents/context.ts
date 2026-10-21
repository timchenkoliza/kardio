import type { EffectivePreference } from "@/lib/agents/profile";
import type { AgentId, AgentRun, Material, UserProfile } from "@/lib/agents/types";
import type { ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import type { PortalJob } from "@/lib/portal/jobs";
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
  /** This physician's earlier runs in this specialty (newest first): real behaviour signals, never invented. */
  history: AgentRun[];
}
