import type { MaterialFormat } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { showcaseFor } from "./showcase";

export interface MaterialExample {
  id: string;
  title: string;
  typeLabel: string;
  format: MaterialFormat;
  publisher: string;
  date: string;
  url: string;
  summary: string;
}

/**
 * Cardiology examples: published ESC documents with their DOI links. Other
 * specialties take theirs from the editorial selection of the same specialty —
 * never from cardiology.
 */
const CARDIOLOGY_EXAMPLES: readonly MaterialExample[] = [
  { id: "ex-esc-af-2024", title: "Рекомендации ESC 2024 по ведению фибрилляции предсердий", typeLabel: "Клинические рекомендации", format: "guideline", publisher: "European Heart Journal", date: "2024", url: "https://doi.org/10.1093/eurheartj/ehae176", summary: "Полный текст рекомендаций Европейского общества кардиологов по фибрилляции предсердий." },
  { id: "ex-esc-hf-2023", title: "Обновление рекомендаций ESC 2023 по сердечной недостаточности", typeLabel: "Клинические рекомендации", format: "guideline", publisher: "European Heart Journal", date: "2023", url: "https://doi.org/10.1093/eurheartj/ehad195", summary: "Фокусное обновление рекомендаций 2021 года по острой и хронической сердечной недостаточности." },
];

export function materialExamples(specialty: SpecialtyId, limit = 2): MaterialExample[] {
  if (specialty === "cardiology") return CARDIOLOGY_EXAMPLES.slice(0, limit);
  return showcaseFor(specialty).slice(0, limit).map(item => ({
    id: `ex-${item.id}`,
    title: item.title,
    typeLabel: item.typeLabel,
    format: item.kind === "review" ? "review" : "guideline",
    publisher: item.publisher,
    date: item.date.slice(0, 4),
    url: item.url,
    summary: item.summary,
  }));
}
