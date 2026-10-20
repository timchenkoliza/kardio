import type { AgentResultView } from "@/lib/agents/types";
import { matchCardioIllustration } from "@/lib/ui/approved-medical-media";

export interface AgentResultMedia {
  src: string;
  alt: string;
  credit: string;
  sourceUrl: string;
  label: string;
}

const ARTICLE_KINDS: ReadonlySet<AgentResultView["kind"]> = new Set(["update", "guideline_change", "drug_change", "research_finding", "learning_module"]);

/** Result cards that read as articles in the feed (events, partner blocks and your own files are not). */
export function isArticleResult(result: AgentResultView): boolean {
  return !result.partner && ARTICLE_KINDS.has(result.kind);
}

/**
 * UI-only illustration. The image is never evidence and is labelled as an illustration.
 * Only STRONG or MEDIUM article ↔ image matches are shown; weak proxies are dropped.
 */
export function agentResultMedia(result: AgentResultView): AgentResultMedia | null {
  if (result.specialty !== "cardiology" || !isArticleResult(result)) return null;
  const text = [result.title, result.summary, result.category ?? "", ...result.reasonShown].join(" ");
  const match = matchCardioIllustration({ text, kind: result.kind });
  if (!match) return null;
  return { src: match.asset.src, alt: match.asset.alt, credit: match.asset.credit, sourceUrl: match.asset.sourceUrl, label: match.asset.compactLabel };
}

/**
 * Feed rhythm: four of every five article cards carry an illustration, the fifth
 * stays text-only so the feed does not turn into a gallery.
 */
export function visualResultIds(results: readonly AgentResultView[]): Set<string> {
  const ids = new Set<string>();
  let articleIndex = 0;
  for (const result of results) {
    if (!isArticleResult(result)) continue;
    if (articleIndex % 5 !== 4 && agentResultMedia(result)) ids.add(result.id);
    articleIndex += 1;
  }
  return ids;
}
