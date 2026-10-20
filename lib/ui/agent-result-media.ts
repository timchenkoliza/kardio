import type { AgentResultView } from "@/lib/agents/types";
import { ANIMATED_ART, ART_ALT, ART_BY_MODALITY, type FeedArtKey } from "@/lib/ui/feed-art";
import { matchCardioIllustration, type ApprovedMedicalMediaAsset, type ApprovedMedicalModality, type IllustrationMatch } from "@/lib/ui/approved-medical-media";

/** In-house line art chosen by the article's clinical subject (no attribution caption needed). */
export interface AgentResultMedia {
  art: FeedArtKey;
  alt: string;
  modality: ApprovedMedicalModality;
  animated: boolean;
}

const ARTICLE_KINDS: ReadonlySet<AgentResultView["kind"]> = new Set(["update", "guideline_change", "drug_change", "research_finding", "learning_module"]);

/** Result cards that read as articles in the feed (events, partner blocks and your own files are not). */
export function isArticleResult(result: AgentResultView): boolean {
  return !result.partner && ARTICLE_KINDS.has(result.kind);
}

export function toMedia(asset: ApprovedMedicalMediaAsset): AgentResultMedia {
  const art = ART_BY_MODALITY[asset.modality];
  return { art, alt: ART_ALT[art], modality: asset.modality, animated: ANIMATED_ART.has(art) };
}

export function matchFor(result: AgentResultView): IllustrationMatch | null {
  if (result.specialty !== "cardiology" || !isArticleResult(result)) return null;
  // Title and summary only: reasons list the user's topics and would bias the match.
  return matchCardioIllustration({ text: [result.title, result.summary].join(" "), kind: result.kind });
}

/**
 * UI-only illustration. The picture is never evidence: a schematic of the article's subject.
 * Only STRONG or MEDIUM article ↔ image matches are shown; weak proxies are dropped.
 */
export function agentResultMedia(result: AgentResultView): AgentResultMedia | null {
  const match = matchFor(result);
  return match ? toMedia(match.asset) : null;
}

/** One feed entry as seen by the illustration rhythm: `match` is null for entries that are not articles. */
export interface IllustrationCandidate {
  id: string;
  article: boolean;
  match: IllustrationMatch | null;
}

/**
 * Feed rhythm: four of every five article cards carry an illustration, the fifth
 * stays text-only so the feed does not turn into a gallery (`textOnlyEvery: 0`
 * when the feed already has text-only cards of its own). Neighbouring cards
 * use an equally valid alternative instead of repeating the same picture.
 */
export function illustrateFeed(candidates: readonly IllustrationCandidate[], options: { textOnlyEvery?: number } = {}): Map<string, AgentResultMedia> {
  const every = options.textOnlyEvery ?? 5;
  const chosen = new Map<string, AgentResultMedia>();
  let articleIndex = 0;
  let previous: string | null = null;
  for (const candidate of candidates) {
    if (!candidate.article) continue;
    const match = every > 0 && articleIndex % every === every - 1 ? null : candidate.match;
    articleIndex += 1;
    if (!match) { previous = null; continue; }
    const artOf = (asset: ApprovedMedicalMediaAsset) => ART_BY_MODALITY[asset.modality];
    const asset: ApprovedMedicalMediaAsset = artOf(match.asset) === previous ? match.alternatives.find(item => artOf(item) !== previous) ?? match.asset : match.asset;
    chosen.set(candidate.id, toMedia(asset));
    previous = artOf(asset);
  }
  return chosen;
}

export function feedIllustrations(results: readonly AgentResultView[]): Map<string, AgentResultMedia> {
  return illustrateFeed(results.map(result => ({ id: result.id, article: isArticleResult(result), match: matchFor(result) })));
}
