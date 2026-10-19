import type { Currentness } from "@/lib/domain/types";

/** Archive is independent of replacement and review uncertainty. */
export function resolveCurrentness(record: {
  freshness_status: string;
  is_current: string;
  superseded_by_id: string | null;
}): { currentness: Currentness; requiresReview: boolean } {
  const requiresReview = record.is_current === "review" || record.freshness_status.startsWith("needs_");
  if (record.freshness_status === "superseded" || record.superseded_by_id) {
    return { currentness: "superseded", requiresReview };
  }
  if (["archive", "legacy"].includes(record.freshness_status)) {
    return { currentness: "archived", requiresReview };
  }
  if (record.is_current === "yes" && record.freshness_status === "current") {
    return { currentness: "current", requiresReview: false };
  }
  return { currentness: "review", requiresReview: true };
}

export const currentnessLabels: Record<Currentness, string> = {
  current: "Актуально по данным источника",
  review: "Требует проверки",
  superseded: "Есть более новая версия",
  archived: "Архивный материал",
};
