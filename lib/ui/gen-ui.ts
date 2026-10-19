import type { Shell, SpecialtyId, UiBlockPreference } from "@/lib/domain/types";
import type { ProductBlockKind } from "@/lib/ui/block-taxonomy";

export interface GenUiBlockDescriptor<T = unknown> {
  id: string;
  label: string;
  kind: ProductBlockKind;
  value: T;
}

export function preferenceForBlock(
  preferences: readonly UiBlockPreference[],
  specialty: SpecialtyId,
  shell: Shell,
  blockId: string,
): UiBlockPreference | null {
  return preferences.find(preference => (
    preference.specialty === specialty
    && preference.shell === shell
    && preference.blockId === blockId
  )) ?? null;
}

export function composeGenUiBlocks<T>(
  blocks: readonly GenUiBlockDescriptor<T>[],
  preferences: readonly UiBlockPreference[],
  specialty: SpecialtyId,
  shell: Shell,
): GenUiBlockDescriptor<T>[] {
  const weight = (block: GenUiBlockDescriptor<T>): number => {
    const mode = preferenceForBlock(preferences, specialty, shell, block.id)?.mode;
    if (mode === "pinned") return 0;
    if (mode === "less") return 2;
    return 1;
  };

  return blocks
    .filter(block => preferenceForBlock(preferences, specialty, shell, block.id)?.mode !== "hidden")
    .map((block, index) => ({ block, index, weight: weight(block) }))
    .sort((a, b) => a.weight - b.weight || a.index - b.index)
    .map(item => item.block);
}
