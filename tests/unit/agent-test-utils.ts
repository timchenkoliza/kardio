import { defaultProfile, effectivePreference } from "@/lib/agents/profile";
import type { AgentId, AgentPreference, UserProfile } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import type { PubmedArticle, PubmedQuery, PubmedSearchResult } from "@/server/agents/adapters/pubmed";
import type { AgentContext } from "@/server/agents/context";
import { listContent, listSources } from "@/server/repositories/catalog";

export const FIXED_NOW = new Date("2026-10-19T10:00:00.000Z");

export function fakeArticle(pmid: string, title: string): PubmedArticle {
  return { pmid, title, journal: "N Engl J Med", journalFull: "The New England journal of medicine", pubDate: "2026 Oct 15", sortDate: "2026-10-15", authors: ["Ivanov I"], doi: `10.1056/test.${pmid}`, publicationTypes: ["Randomized Controlled Trial"], url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` };
}

export function fakePubmed(articles: PubmedArticle[], status: PubmedSearchResult["status"] = "ok") {
  const calls: PubmedQuery[] = [];
  const fn = async (query: PubmedQuery): Promise<PubmedSearchResult> => {
    calls.push(query);
    return { status, query: query.term, total: articles.length, articles: status === "ok" ? articles : [], error: status === "ok" ? null : "PubMed сейчас недоступен", durationMs: 1 };
  };
  return Object.assign(fn, { calls });
}

export function profileWith(specialty: SpecialtyId, topics: string[], overrides: Partial<Record<AgentId, Partial<AgentPreference>>> = {}): UserProfile {
  const profile = defaultProfile(specialty, FIXED_NOW.toISOString());
  profile.interests.topics = topics;
  for (const [agentId, patch] of Object.entries(overrides) as Array<[AgentId, Partial<AgentPreference>]>) profile.preferences[agentId] = { ...profile.preferences[agentId], ...patch };
  return profile;
}

export async function testContext(args: { agentId: AgentId; topics: string[]; specialty?: SpecialtyId; lastSeenAt?: string | null; text?: string | null; profile?: UserProfile; pubmed?: AgentContext["pubmed"] }): Promise<AgentContext> {
  const specialty = args.specialty ?? "cardiology";
  const profile = args.profile ?? profileWith(specialty, args.topics);
  const [content, sources] = await Promise.all([listContent(specialty), listSources(specialty)]);
  return {
    agentId: args.agentId,
    specialty,
    now: FIXED_NOW,
    nowIso: FIXED_NOW.toISOString(),
    profile,
    preference: effectivePreference(profile, args.agentId),
    lastSeenAt: args.lastSeenAt ?? null,
    catalog: { content, sources },
    materials: [],
    pubmed: args.pubmed ?? fakePubmed([]),
    inputText: args.text ?? null,
  };
}
