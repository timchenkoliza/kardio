import type { SpecialtyId } from "@/lib/domain/types";

export type CuratedSurface = "sources" | "reference" | "education" | "tools" | "imaging";
export type CuratedProvenance = "source_research" | "user_provided";

export interface CuratedExternalSource {
  id: string;
  registryId: string | null;
  specialty: SpecialtyId | "shared";
  name: string;
  category: string;
  url: string;
  note: string;
  language: "ru" | "en";
  surfaces: readonly CuratedSurface[];
  provenance: CuratedProvenance;
}

/**
 * Product-facing external resources observed in the source registry or supplied
 * explicitly for the prototype. These records are navigation aids, not
 * canonical ontology promotion and not clinical endorsement.
 */
export const curatedExternalSources: readonly CuratedExternalSource[] = [
  {
    id: "rko",
    registryId: "S0109",
    specialty: "cardiology",
    name: "Российское кардиологическое общество",
    category: "Профобщество",
    url: "https://scardio.ru/",
    note: "Профессиональное общество по кардиологии",
    language: "ru",
    surfaces: ["sources"],
    provenance: "source_research",
  },
  {
    id: "bikbov",
    registryId: "S0521",
    specialty: "cardiology",
    name: "Сайт Бориса Бикбова",
    category: "Калькуляторы",
    url: "https://boris.bikbov.ru/2013/07/21/kalkulyator-skf-rascheta-skorosti-klubochkovoy-filtratsii",
    note: "Расчёт СКФ",
    language: "ru",
    surfaces: ["sources", "reference", "tools"],
    provenance: "source_research",
  },
  {
    id: "1med",
    registryId: "S0008",
    specialty: "cardiology",
    name: "1Med.TV",
    category: "Образование",
    url: "https://1med.tv/",
    note: "Курсы и конференции для врачей",
    language: "ru",
    surfaces: ["sources", "education"],
    provenance: "source_research",
  },
  {
    id: "medi",
    registryId: "S0085",
    specialty: "cardiology",
    name: "МЕДИ РУ",
    category: "Профисточник",
    url: "https://medi.ru/",
    note: "Профессиональный медицинский портал",
    language: "ru",
    surfaces: ["sources"],
    provenance: "source_research",
  },
  {
    id: "medvestnik",
    registryId: "S0441",
    specialty: "cardiology",
    name: "МедВестник",
    category: "Профисточник",
    url: "https://medvestnik.ru/",
    note: "Профессиональное медицинское издание",
    language: "ru",
    surfaces: ["sources"],
    provenance: "source_research",
  },
  {
    id: "vidal",
    registryId: "S0158",
    specialty: "shared",
    name: "Видаль",
    category: "Лекарства",
    url: "https://vidal.ru/",
    note: "Справочник лекарственных препаратов",
    language: "ru",
    surfaces: ["sources", "reference"],
    provenance: "user_provided",
  },
  {
    id: "drugs-interactions",
    registryId: "S0157",
    specialty: "shared",
    name: "Drugs.com Drug Interaction Checker",
    category: "Взаимодействия",
    url: "https://www.drugs.com/drug_interactions.html",
    note: "Проверка лекарственных взаимодействий",
    language: "en",
    surfaces: ["sources", "reference"],
    provenance: "user_provided",
  },
  {
    id: "medscape-interactions",
    registryId: null,
    specialty: "shared",
    name: "Medscape Drug Interaction Checker",
    category: "Взаимодействия",
    url: "https://reference.medscape.com/drug-interactionchecker",
    note: "Проверка лекарственных взаимодействий",
    language: "en",
    surfaces: ["sources", "reference"],
    provenance: "user_provided",
  },
  {
    id: "inobitec",
    registryId: "S0571",
    specialty: "shared",
    name: "Inobitec DICOM Viewer",
    category: "Визуализация",
    url: "https://inobitec.com/downloads/dicomviewer/",
    note: "Просмотр медицинских изображений",
    language: "en",
    surfaces: ["sources", "reference", "imaging"],
    provenance: "user_provided",
  },
  {
    id: "cancer-risk-calculators",
    registryId: "S0042",
    specialty: "oncology",
    name: "Cancer Risk Calculators",
    category: "Калькуляторы",
    url: "https://cancer-risk-calculator.org/",
    note: "Онкологические риск-калькуляторы",
    language: "en",
    surfaces: ["sources", "tools"],
    provenance: "user_provided",
  },
  {
    id: "cancer-survival-rates",
    registryId: "S0219",
    specialty: "oncology",
    name: "CancerSurvivalRates",
    category: "Калькуляторы",
    url: "https://cancersurvivalrates.com/calculator.html",
    note: "Калькулятор прогноза выживаемости",
    language: "en",
    surfaces: ["sources", "tools"],
    provenance: "user_provided",
  },
];

export function curatedSourcesForSpecialty(specialty: SpecialtyId): CuratedExternalSource[] {
  return curatedExternalSources.filter(source => source.specialty === "shared" || source.specialty === specialty);
}

export function curatedSourcesForSurface(specialty: SpecialtyId, surface: CuratedSurface): CuratedExternalSource[] {
  return curatedSourcesForSpecialty(specialty).filter(source => source.surfaces.includes(surface));
}
