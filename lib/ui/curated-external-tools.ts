import type { SpecialtyId } from "@/lib/domain/types";

export interface CuratedExternalSource {
  id: string;
  specialty: SpecialtyId | "shared";
  name: string;
  category: string;
  url: string;
  note: string;
}

export const curatedExternalSources: readonly CuratedExternalSource[] = [
  {
    id: "rko",
    specialty: "cardiology",
    name: "Российское кардиологическое общество",
    category: "Профобщество",
    url: "https://scardio.ru/",
    note: "Кардиология",
  },
  {
    id: "bikbov",
    specialty: "cardiology",
    name: "Сайт Бориса Бикбова",
    category: "Калькуляторы",
    url: "https://boris.bikbov.ru/2013/07/21/kalkulyator-skf-rascheta-skorosti-klubochkovoy-filtratsii",
    note: "Расчёт СКФ",
  },
  {
    id: "1med",
    specialty: "cardiology",
    name: "1Med.TV",
    category: "Образование",
    url: "https://1med.tv/",
    note: "Курсы и конференции",
  },
  {
    id: "medi",
    specialty: "cardiology",
    name: "МЕДИ РУ",
    category: "Профисточник",
    url: "https://medi.ru/",
    note: "Профессиональный портал",
  },
  {
    id: "medvestnik",
    specialty: "cardiology",
    name: "МедВестник",
    category: "Профисточник",
    url: "https://medvestnik.ru/",
    note: "Профессиональное издание",
  },
  {
    id: "vidal",
    specialty: "shared",
    name: "Видаль",
    category: "Справочник",
    url: "https://vidal.ru/",
    note: "Лекарственные препараты в России",
  },
  {
    id: "drugs-interactions",
    specialty: "shared",
    name: "Drugs.com Drug Interaction Checker",
    category: "Лекарства",
    url: "https://www.drugs.com/drug_interactions.html",
    note: "Проверка лекарственных взаимодействий",
  },
  {
    id: "medscape-interactions",
    specialty: "shared",
    name: "Medscape Drug Interaction Checker",
    category: "Лекарства",
    url: "https://reference.medscape.com/drug-interactionchecker",
    note: "Проверка лекарственных взаимодействий",
  },
  {
    id: "inobitec",
    specialty: "shared",
    name: "Inobitec DICOM Viewer",
    category: "Медсистема",
    url: "https://inobitec.com/downloads/dicomviewer/",
    note: "Просмотр медицинских изображений",
  },
  {
    id: "cancer-risk-calculators",
    specialty: "oncology",
    name: "Cancer Risk Calculators",
    category: "Калькуляторы",
    url: "https://cancer-risk-calculator.org/",
    note: "Онкологические риск-калькуляторы",
  },
  {
    id: "cancer-survival-rates",
    specialty: "oncology",
    name: "CancerSurvivalRates",
    category: "Калькуляторы",
    url: "https://cancersurvivalrates.com/calculator.html",
    note: "Калькулятор прогноза выживаемости",
  },
];

export function curatedSourcesForSpecialty(specialty: SpecialtyId): CuratedExternalSource[] {
  return curatedExternalSources.filter(source => source.specialty === "shared" || source.specialty === specialty);
}
