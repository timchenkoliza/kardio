import type { PageSnapshot, TextItem } from "../types";

export const quote = (text: string, max = 80) => `«${text.length > max ? `${text.slice(0, max - 1)}…` : text}»`;

/** Text that a person can read on screen: own text nodes, placeholders, selected options. */
export function readableTexts(snapshot: PageSnapshot, kinds: ReadonlyArray<TextItem["kind"]> = ["text", "placeholder", "select"]): TextItem[] {
  return snapshot.texts.filter(item => !item.excluded && kinds.includes(item.kind));
}

export const px = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100) / 100} px`);
