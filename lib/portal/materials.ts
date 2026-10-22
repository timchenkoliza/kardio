import type { Material, MaterialFormat, SourceOwnership } from "@/lib/agents/types";

/**
 * «Мои материалы»: format, sorting, filtering and the «Пример» showcase.
 * Pure functions shared by the page and tests; nothing here fetches.
 */

export const MATERIAL_FORMAT_LABEL: Record<MaterialFormat, string> = {
  guideline: "Рекомендации",
  review: "Обзор",
  study: "Исследование",
  article: "Статья",
  drug_label: "Инструкция",
  video: "Видео",
  website: "Сайт",
  file: "Файл",
  note: "Заметка",
  result: "Сохранённый ответ",
};

export const MATERIAL_FORMAT_ORDER: readonly MaterialFormat[] = ["guideline", "review", "study", "article", "drug_label", "video", "website", "file", "note", "result"];

export const OWNERSHIP_LABEL: Record<SourceOwnership, string> = {
  USER_UPLOADED: "Ваш файл или заметка",
  PUBLIC_SOURCE: "Публичный источник",
  PARTNER_SOURCE: "Партнёрский материал",
  GENERATED: "Сохранённый ответ",
};

export type MaterialSort = "newest" | "added" | "published" | "format";

export const MATERIAL_SORT_LABEL: Record<MaterialSort, string> = {
  newest: "Сначала новые",
  added: "По дате добавления",
  published: "По дате публикации",
  format: "По формату",
};

/** Older materials have no stored format: derive it from what they are. */
const RU_MONTHS = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];

/** ISO date at its own precision → Russian («12 окт. 2026 г.», «окт. 2026 г.», «2026 г.»). */
export function russianIsoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !/^\d{4}$/u.test(year)) return null;
  const name = month ? RU_MONTHS[Number(month) - 1] : undefined;
  if (!name) return `${year} г.`;
  return day ? `${Number(day)} ${name} ${year} г.` : `${name} ${year} г.`;
}

export function materialFormat(material: Pick<Material, "kind" | "format">): MaterialFormat {
  if (material.format) return material.format;
  if (material.kind === "file") return "file";
  if (material.kind === "note") return "note";
  if (material.kind === "agent_result") return "result";
  return "website";
}

export function publishedAt(material: Pick<Material, "provenance">): string | null {
  return material.provenance?.publishedAt ?? null;
}

export function sortMaterials<T extends Pick<Material, "kind" | "format" | "createdAt" | "provenance" | "title">>(materials: readonly T[], sort: MaterialSort): T[] {
  const list = [...materials];
  const newest = (a: T, b: T) => b.createdAt.localeCompare(a.createdAt);
  switch (sort) {
    case "added": return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "published": return list.sort((a, b) => {
      const left = publishedAt(a);
      const right = publishedAt(b);
      if (left && right) return right.localeCompare(left) || newest(a, b);
      if (left) return -1;
      if (right) return 1;
      return newest(a, b);
    });
    case "format": return list.sort((a, b) => MATERIAL_FORMAT_ORDER.indexOf(materialFormat(a)) - MATERIAL_FORMAT_ORDER.indexOf(materialFormat(b)) || newest(a, b));
    default: return list.sort(newest);
  }
}

export interface MaterialFilter {
  format: MaterialFormat | "all";
  ownership: SourceOwnership | "all";
  collection: string | "all";
}

export function filterMaterials<T extends Pick<Material, "kind" | "format" | "ownership" | "collectionIds">>(materials: readonly T[], filter: MaterialFilter): T[] {
  return materials.filter(material => (filter.format === "all" || materialFormat(material) === filter.format)
    && (filter.ownership === "all" || material.ownership === filter.ownership)
    && (filter.collection === "all" || material.collectionIds.includes(filter.collection)));
}
