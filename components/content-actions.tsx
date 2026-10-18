"use client";

import { Bookmark } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { useProduct } from "./product-provider";

export function ContentSaveButton({ contentId, specialty, compact = false }: { contentId: string; specialty: SpecialtyId; compact?: boolean }) {
  const { state, pending, mutate, track } = useProduct();
  const saved = state.savedIds.includes(contentId);

  async function toggle() {
    const enabled = !saved;
    if (await mutate({ action: "save", id: contentId, enabled, specialty })) {
      track(enabled ? "content_saved" : "content_unsaved", { contentId });
    }
  }

  return (
    <button
      type="button"
      className={compact ? `save-button compact ${saved ? "saved" : ""}` : `save-button ${saved ? "saved" : ""}`}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? "Убрать из сохранённых" : "Сохранить материал"}
      onClick={() => void toggle()}
    >
      <Bookmark size={compact ? 17 : 18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
      {!compact && <span>{saved ? "Сохранено" : "Сохранить"}</span>}
    </button>
  );
}
