import type { AgentResultView } from "@/lib/agents/types";
import { matchCardioIllustration, type ApprovedMedicalMediaAsset } from "@/lib/ui/approved-medical-media";

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

function toMedia(asset: ApprovedMedicalMediaAsset): AgentResultMedia {
  return { src: asset.src, alt: asset.alt, credit: asset.credit, sourceUrl: asset.sourceUrl, label: asset.compactLabel };
}

function matchFor(result: AgentResultView) {
  if (result.specialty !== "cardiology" || !isArticleResult(result)) return null;
  // Title and summary only: reasons list the user's topics and would bias the match.
  return matchCardioIllustration({ text: [result.title, result.summary].join(" "), kind: result.kind });
}

/**
 * UI-only illustration. The image is never evidence and is labelled as an illustration.
 * Only STRONG or MEDIUM article ↔ image matches are shown; weak proxies are dropped.
 */
export function agentResultMedia(result: AgentResultView): AgentResultMedia | null {
  const match = matchFor(result);
  return match ? toMedia(match.asset) : null;
}

/**
 * Feed rhythm: four of every five article cards carry an illustration, the fifth
 * stays text-only so the feed does not turn into a gallery. Neighbouring cards
 * use an equally valid alternative instead of repeating the same picture.
 */
export function feedIllustrations(results: readonly AgentResultView[]): Map<string, AgentResultMedia> {
  const chosen = new Map<string, AgentResultMedia>();
  let articleIndex = 0;
  let previous: string | null = null;
  for (const result of results) {
    if (!isArticleResult(result)) continue;
    const match = articleIndex % 5 !== 4 ? matchFor(result) : null;
    articleIndex += 1;
    if (!match) { previous = null; continue; }
    const asset: ApprovedMedicalMediaAsset = match.asset.id === previous ? match.alternatives.find(item => item.id !== previous) ?? match.asset : match.asset;
    chosen.set(result.id, toMedia(asset));
    previous = asset.id;
  }
  return chosen;
}
