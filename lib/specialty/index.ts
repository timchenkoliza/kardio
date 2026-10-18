import type { SpecialtyId } from "@/lib/domain/types";

export interface SpecialtyAdapter {
  id: SpecialtyId;
  name: string;
  title: string;
  description: string;
  available: boolean;
  dataset: string | null;
  emptyMessage: string;
  ingestion: { requiresSource: true; requiresRightsReview: true; requiresEditorialReview: true };
}

export const specialties: Record<SpecialtyId, SpecialtyAdapter> = {
  cardiology: {
    id: "cardiology", name: "Кардиология", title: "Кардиология",
    description: "Рекомендации, исследования и профессиональные источники по кардиологии.",
    available: true, dataset: "cardio-goldenset-v2",
    emptyMessage: "Подходящих материалов пока нет. Измените запрос или фильтры.",
    ingestion: { requiresSource: true, requiresRightsReview: true, requiresEditorialReview: true },
  },
  oncology: {
    id: "oncology", name: "Онкология", title: "Онкология",
    description: "Раздел готов к подключению проверенного онкологического контента.",
    available: false, dataset: null,
    emptyMessage: "Онкологический набор ещё не подключён. Материалы появятся после проверки источников, редакции и прав.",
    ingestion: { requiresSource: true, requiresRightsReview: true, requiresEditorialReview: true },
  },
};

export function isSpecialty(value: unknown): value is SpecialtyId {
  return value === "cardiology" || value === "oncology";
}

export function getSpecialty(id: SpecialtyId): SpecialtyAdapter { return specialties[id]; }
export const specialtyList = Object.values(specialties);
