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

export function catalogSourceRegion(content: ContentObject): "russia" | "international" | "unknown" {
  const haystack = [
    content.source.name,
    content.source.publisher ?? "",
    content.source.url ?? "",
    content.canonicalUrl ?? "",
  ].join(" ").toLocaleLowerCase("ru-RU");

  if (/\b(?:рко|ркж|минздрав|российск)\b|scardio\.ru|cardio-journal\.ru|\.ru(?:\/|$)/iu.test(haystack)) return "russia";
  if (/escardio\.org|pubmed|ncbi\.nlm\.nih\.gov|nejm\.org|thelancet\.com|bmj\.com|jamanetwork\.com|nature\.com|heart\.bmj\.com|ahajournals\.org/iu.test(haystack)) return "international";

  try {
    const raw = content.canonicalUrl ?? content.source.url;
    if (!raw) return "unknown";
    const host = new URL(raw).hostname.toLocaleLowerCase("en-US");
    if (host.endsWith(".ru")) return "russia";
    if (host.includes(".")) return "international";
  } catch {
    return "unknown";
  }
  return "unknown";
}

export function filterCatalogForResearch(content: readonly ContentObject[], options: ResearchRunOptions): ContentObject[] {
  return content.filter(item => {
    if (options.sourceScope !== "all" && catalogSourceRegion(item) !== options.sourceScope) return false;
    if (options.contentScope === "guidelines" && item.kind !== "guideline" && item.kind !== "clinical") return false;
    if (options.contentScope === "research" && item.kind !== "article") return false;
    if (options.contentScope === "all" && !["article", "guideline", "clinical"].includes(item.kind)) return false;
    return true;
  });
}
