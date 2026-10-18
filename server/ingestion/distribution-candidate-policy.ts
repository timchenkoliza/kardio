import type { TelegramPostCandidate } from "@/server/ingestion/telegram-html";

export type DistributionCandidateReviewState =
  | "parsed"
  | "needs_review"
  | "approved_for_promotion"
  | "rejected"
  | "promoted";

export function candidateTimestampColumns(
  post: Pick<TelegramPostCandidate, "publishedAt" | "publishedAtBasis">,
): { publishedAtInstant: string | null; publishedAtLocal: string | null } {
  if (post.publishedAtBasis === "offset_explicit") {
    return { publishedAtInstant: post.publishedAt, publishedAtLocal: null };
  }
  if (post.publishedAtBasis === "source_local") {
    return { publishedAtInstant: null, publishedAtLocal: post.publishedAt };
  }
  return { publishedAtInstant: null, publishedAtLocal: null };
}

export function reviewStateAfterSourceChange(args: {
  previous: DistributionCandidateReviewState | null;
  sourceChanged: boolean;
}): DistributionCandidateReviewState | null {
  if (!args.previous) return null;
  if (!args.sourceChanged) return args.previous;
  return args.previous === "parsed" ? "parsed" : "needs_review";
}
