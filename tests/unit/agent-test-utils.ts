import { defaultProfile, effectivePreference } from "@/lib/agents/profile";
import type { AgentId, AgentPreference, UserProfile } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import type { DrugLabelResult } from "@/server/agents/adapters/openfda";
import type { PubmedArticle, PubmedQuery, PubmedSearchResult } from "@/server/agents/adapters/pubmed";
import type { PubmedAbstract, PubmedAbstractsResult } from "@/server/agents/adapters/pubmed-abstracts";
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

export function fakeAbstracts(abstracts: PubmedAbstract[] = [], status: PubmedAbstractsResult["status"] = "ok") {
  const calls: string[][] = [];
  const fn = async (pmids: readonly string[]): Promise<PubmedAbstractsResult> => {
    calls.push([...pmids]);
    return { status, abstracts: status === "ok" ? abstracts.filter(item => pmids.includes(item.pmid)) : [], error: status === "ok" ? null : "PubMed сейчас недоступен", durationMs: 1 };
  };
  return Object.assign(fn, { calls });
}

export function fakeDrugLabel(result: Partial<DrugLabelResult> | null = null) {
  const calls: string[] = [];
  const fn = async (name: string): Promise<DrugLabelResult> => {
    calls.push(name);
    return { status: "not_found", query: name, label: null, total: 0, error: null, durationMs: 1, retrievedAt: FIXED_NOW.toISOString(), ...(result ?? {}) };
  };
  return Object.assign(fn, { calls });
}

export function profileWith(specialty: SpecialtyId, topics: string[], overrides: Partial<Record<AgentId, Partial<AgentPreference>>> = {}): UserProfile {
  const profile = defaultProfile(specialty, FIXED_NOW.toISOString());
  profile.interests.topics = topics;
  for (const [agentId, patch] of Object.entries(overrides) as Array<[AgentId, Partial<AgentPreference>]>) profile.preferences[agentId] = { ...profile.preferences[agentId], ...patch };
  return profile;
}

export async function testContext(args: { agentId: AgentId; topics: string[]; specialty?: SpecialtyId; lastSeenAt?: string | null; text?: string | null; profile?: UserProfile; pubmed?: AgentContext["pubmed"]; abstracts?: AgentContext["abstracts"]; drugLabel?: AgentContext["drugLabel"]; job?: AgentContext["job"]; history?: AgentContext["history"]; materials?: AgentContext["materials"]; browserDriver?: AgentContext["browserDriver"] }): Promise<AgentContext> {
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
    materials: args.materials ?? [],
    pubmed: args.pubmed ?? fakePubmed([]),
    abstracts: args.abstracts ?? fakeAbstracts(),
    drugLabel: args.drugLabel ?? fakeDrugLabel(),
    inputText: args.text ?? null,
    job: args.job ?? null,
    history: args.history ?? [],
    // Unit tests never open real websites: browser-capable sources are off unless a fixture driver is given.
    browserDriver: args.browserDriver === undefined ? null : args.browserDriver,
    sessionId: "unit-test",
  };
}
