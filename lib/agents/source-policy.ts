export type SourceStanding = "approved" | "conditional" | "reviewed_not_whitelisted" | "rejected" | "unreviewed";

export const SOURCE_STANDINGS: readonly SourceStanding[] = [
  "approved",
  "conditional",
  "reviewed_not_whitelisted",
  "rejected",
  "unreviewed",
];
