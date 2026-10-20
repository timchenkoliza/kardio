import type { EffectivePreference } from "@/lib/agents/profile";
import type { AgentId, Material, UserProfile } from "@/lib/agents/types";
import type { ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import type { PubmedQuery, PubmedSearchResult } from "./adapters/pubmed";

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
  inputText: string | null;
}
