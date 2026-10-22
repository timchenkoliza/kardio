/**
 * Physician source validation — client-safe types and labels.
 * The resolver that reads data/source-validation-b2d.json lives in
 * server/agents/services/source-policy.ts (server-only).
 */
export type SourceStanding = "approved" | "conditional" | "reviewed_not_whitelisted" | "rejected" | "unreviewed";
export type SourceDecision = "confirmed" | "partial" | "refuted";
export type SourceWhitelist = "yes" | "no" | "conditional" | "unspecified";

export const SOURCE_STANDINGS: readonly SourceStanding[] = [
  "approved",
  "conditional",
  "reviewed_not_whitelisted",
  "rejected",
  "unreviewed",
];

export const STANDING_LABEL: Record<SourceStanding, string> = {
  approved: "Источник одобрен врачами",
  conditional: "Одобрен врачами с условием",
  reviewed_not_whitelisted: "Проверен врачами, требует сверки",
  rejected: "Источник отклонён врачами",
  unreviewed: "Не проверен врачами",
};
