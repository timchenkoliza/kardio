import type { ResearchRunOptions } from "@/lib/agents/research-options";
import { DEFAULT_RESEARCH_RUN_OPTIONS } from "@/lib/agents/research-options";
import type { UserProfile } from "@/lib/agents/types";
import type { ContentObject } from "@/lib/domain/types";

const runtimeOptions = new WeakMap<UserProfile, ResearchRunOptions>();

export function bindResearchRunOptions(profile: UserProfile, options: ResearchRunOptions): UserProfile {
  runtimeOptions.set(profile, options);
  return profile;
}

export function researchRunOptionsFor(profile: UserProfile): ResearchRunOptions {
  return runtimeOptions.get(profile) ?? DEFAULT_RESEARCH_RUN_OPTIONS;
}

function hostname(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLocaleLowerCase("en-US").replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return null;
  }
}

export function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function researchDomainAllowsHost(options: Pick<ResearchRunOptions, "includeDomains" | "excludeDomains">, host: string | null): boolean {
  if (!host) return options.includeDomains.length === 0;
  if (options.excludeDomains.some(domain => domainMatches(host, domain))) return false;
  if (options.includeDomains.length && !options.includeDomains.some(domain => domainMatches(host, domain))) return false;
  return true;
}

export function catalogSourceDomain(content: ContentObject): string | null {
  return hostname(content.canonicalUrl ?? content.source.url);
}

export function pubmedAllowedForResearch(options: ResearchRunOptions): boolean {
  return researchDomainAllowsHost(options, "pubmed.ncbi.nlm.nih.gov");
}

export function catalogSourceRegion(content: ContentObject): "russia" | "international" | "unknown" {
  const haystack = [
    content.source.name,
    content.source.publisher ?? "",
    content.source.url ?? "",
    content.canonicalUrl ?? "",
  ].join(" ").toLocaleLowerCase("ru-RU");

  if (/\b(?:рко|ркж|минздрав|российск)\b|scardio\.ru|cardio-journal\.ru|\.ru(?:\/|$)/iu.test(haystack)) return "russia";
  if (/escardio\.org|pubmed|ncbi\.nlm\.nih\.gov|nejm\.org|thelancet\.com|bmj\.com|jamanetwork\.com|nature\.com|heart\.bmj\.com|ahajournals\.org/iu.test(haystack)) return "international";

  const host = catalogSourceDomain(content);
  if (!host) return "unknown";
  if (host.endsWith(".ru")) return "russia";
  if (host.includes(".")) return "international";
  return "unknown";
}

export function filterCatalogForResearch(content: readonly ContentObject[], options: ResearchRunOptions): ContentObject[] {
  return content.filter(item => {
    if (!researchDomainAllowsHost(options, catalogSourceDomain(item))) return false;
    if (options.sourceScope !== "all" && catalogSourceRegion(item) !== options.sourceScope) return false;
    if (options.contentScope === "guidelines" && item.kind !== "guideline" && item.kind !== "clinical") return false;
    if (options.contentScope === "research" && item.kind !== "article") return false;
    if (options.contentScope === "all" && !["article", "guideline", "clinical"].includes(item.kind)) return false;
    return true;
  });
}
