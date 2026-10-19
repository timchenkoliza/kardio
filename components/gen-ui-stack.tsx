"use client";

import { MoreHorizontal, Pin, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Shell, SpecialtyId, UiPreferenceMode } from "@/lib/domain/types";
import { blockRegion, type ProductBlockKind } from "@/lib/ui/block-taxonomy";
import { composeGenUiBlocks, preferenceForBlock } from "@/lib/ui/gen-ui";
import { useProduct } from "@/components/product-provider";

export interface GenUiBlock {
  id: string;
  label: string;
  kind: ProductBlockKind;
  content: ReactNode;
}

export function GenUiStack({ specialty, shell, blocks }: { specialty: SpecialtyId; shell: Shell; blocks: readonly GenUiBlock[] }) {
  const { state, pending, mutate, track } = useProduct();
  const visible = composeGenUiBlocks(blocks.map(block => ({ id: block.id, label: block.label, kind: block.kind, value: block.content })), state.uiPreferences, specialty, shell);

  async function setPreference(blockId: string, label: string, mode: UiPreferenceMode | "default") {
    if (await mutate({ action: "uiPreference", specialty, shell, blockId, label, mode })) track("gen_ui_preference_changed");
  }

  return <div className="gen-ui-stack" data-shell={shell}>
    {visible.map(block => {
      const preference = preferenceForBlock(state.uiPreferences, specialty, shell, block.id);
      return <div
        className={`gen-ui-block ${preference?.mode ? `is-${preference.mode}` : ""}`}
        data-block-kind={block.kind}
        data-block-region={blockRegion(block.kind)}
        key={block.id}
      >
        <details className="gen-ui-menu">
          <summary aria-label={`Настроить блок: ${block.label}`}><MoreHorizontal size={18} /></summary>
          <div className="gen-ui-menu-popover">
            <strong>{block.label}</strong>
            <button disabled={pending} onClick={() => void setPreference(block.id, block.label, preference?.mode === "pinned" ? "default" : "pinned")}><Pin size={15} />{preference?.mode === "pinned" ? "Открепить" : "Закрепить выше"}</button>
            <button disabled={pending} onClick={() => void setPreference(block.id, block.label, preference?.mode === "less" ? "default" : "less")}><SlidersHorizontal size={15} />{preference?.mode === "less" ? "Вернуть обычный приоритет" : "Показывать реже"}</button>
            <button disabled={pending} onClick={() => void setPreference(block.id, block.label, "hidden")}><X size={15} />Скрыть этот блок</button>
            {preference && <button disabled={pending} onClick={() => void setPreference(block.id, block.label, "default")}><RotateCcw size={15} />Сбросить настройку</button>}
          </div>
        </details>
        {block.value}
      </div>;
    })}
  </div>;
}
