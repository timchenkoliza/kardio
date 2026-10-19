import type { SpecialtyId } from "@/lib/domain/types";

export type ProcedureBenchmarkScope = "international" | "russia";
export type ProcedureBenchmarkEvidence = "observed" | "modelled" | "trend" | "treatment_mix";

export interface ProcedureBenchmark {
  id: string;
  specialty: SpecialtyId;
  scope: ProcedureBenchmarkScope;
  evidence: ProcedureBenchmarkEvidence;
  label: string;
  value: string;
  period: string;
  context: string;
  source: string;
  sourceUrl: string;
}

/**
 * Curated public benchmarks for professional orientation only.
 * Values are snapshots from the cited source, not live clinical guidance and
 * not patient-level recommendations. Keep period/unit semantics visible.
 */
export const procedureBenchmarks: readonly ProcedureBenchmark[] = [
  {
    id: "cardio-europe-pci-2024",
    specialty: "cardiology",
    scope: "international",
    evidence: "observed",
    label: "ЧКВ · Европа",
    value: "2 152,8 / млн",
    period: "2024",
    context: "Чрескожные коронарные вмешательства на 1 млн населения; агрегат Europe в ESC Atlas.",
    source: "ESC Atlas of Cardiology",
    sourceUrl: "https://eatlas.escardio.org/Atlas/ESC-Atlas-in-Interventional-Cardiology/Interventional-cardiology-procedures/sipcp_pci_1m_r-percutaneous-coronary-interventions-pci-per-million-people",
  },
  {
    id: "cardio-europe-cabg-2024",
    specialty: "cardiology",
    scope: "international",
    evidence: "observed",
    label: "АКШ · Европа",
    value: "257,6 / млн",
    period: "2024",
    context: "Все виды хирургической коронарной реваскуляризации на 1 млн населения; агрегат Europe в ESC Atlas.",
    source: "ESC Atlas of Cardiology",
    sourceUrl: "https://eatlas.escardio.org/Atlas/ESC-Atlas-of-Cardiology/Cardiovascular-healthcare-delivery/Cardiac-surgery/sipcp_cabg_1m_r-coronary-artery-bypass-graft-surgery-cabg-per-million-people",
  },
  {
    id: "cardio-europe-tavi-2024",
    specialty: "cardiology",
    scope: "international",
    evidence: "observed",
    label: "TAVI · Европа",
    value: "189,5 / млн",
    period: "2024",
    context: "TAVI на 1 млн населения; агрегат Europe в ESC Atlas.",
    source: "ESC Atlas of Cardiology",
    sourceUrl: "https://eatlas.escardio.org/Atlas/ESC-Atlas-in-Interventional-Cardiology/Interventional-cardiology-procedures/sipcp_ptavi_1m_r-percutaneous-aortic-valve-implantation-tavi-per-million-pe",
  },
  {
    id: "cardio-russia-aorta-peripheral-2024",
    specialty: "cardiology",
    scope: "russia",
    evidence: "observed",
    label: "Аорта и периферические артерии · РФ",
    value: "54 269 / 72 015",
    period: "2024",
    context: "Открытые операции / рентгенэндоваскулярные вмешательства. В приведённом срезе эндоваскулярные вмешательства составляли 57%.",
    source: "Национальная медицинская палата · аппаратное совещание 13.05.2026",
    sourceUrl: "https://nacmedpalata.ru/?action=show&id=39980",
  },
  {
    id: "cardio-russia-growth-2024",
    specialty: "cardiology",
    scope: "russia",
    evidence: "trend",
    label: "Операции на сердце · РФ",
    value: "+32% за 5 лет",
    period: "сообщено в 2024",
    context: "Министр здравоохранения РФ также сообщал почти о 50%-ном росте числа ангиопластик коронарных артерий за тот же пятилетний период. Это тренд, не абсолютный объём.",
    source: "Минздрав России · заявление Михаила Мурашко, опубликованное Интерфаксом",
    sourceUrl: "https://www.interfax.ru/russia/962431",
  },
  {
    id: "oncology-global-surgical-demand-2040",
    specialty: "oncology",
    scope: "international",
    evidence: "modelled",
    label: "Потребность в онкохирургии · мир",
    value: "13,821 млн",
    period: "прогноз на 2040",
    context: "Модельная оценка числа случаев рака с показанием к операции; 9,065 млн в 2018 → 13,821 млн в 2040 (+52%). Это потребность, а не фактически выполненные операции.",
    source: "The Lancet Oncology · Perera et al., 2021",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/33485458/",
  },
  {
    id: "oncology-global-procedures-2030",
    specialty: "oncology",
    scope: "international",
    evidence: "modelled",
    label: "Онкохирургические процедуры · мир",
    value: "45 млн / год",
    period: "модельная потребность к 2030",
    context: "Оценка Lancet Oncology Commission: к 2030 году ежегодно может требоваться около 45 млн хирургических процедур для онкологических заболеваний. Это модель 2015 года, а не текущий реестр операций.",
    source: "Lancet Oncology Commission · Global cancer surgery",
    sourceUrl: "https://www.sciencedirect.com/science/article/pii/S1470204515002235",
  },
  {
    id: "oncology-russia-surgery-alone-2024",
    specialty: "oncology",
    scope: "russia",
    evidence: "treatment_mix",
    label: "Хирургический метод · РФ",
    value: "60,7%",
    period: "2024",
    context: "Удельный вес хирургического метода как самостоятельного вида радикального лечения. Это структура лечения, а не число операций.",
    source: "НМИЦ радиологии · Состояние онкологической помощи населению России в 2024 году",
    sourceUrl: "https://glavonco.ru/upload/onco2024.pdf",
  },
  {
    id: "oncology-russia-combined-2024",
    specialty: "oncology",
    scope: "russia",
    evidence: "treatment_mix",
    label: "Комбинированное лечение · РФ",
    value: "28,6%",
    period: "2024",
    context: "Доля комбинированного метода радикального лечения в общероссийском статистическом сборнике. Не интерпретируется как отдельное число хирургических вмешательств.",
    source: "НМИЦ радиологии · Состояние онкологической помощи населению России в 2024 году",
    sourceUrl: "https://glavonco.ru/upload/onco2024.pdf",
  },
];

export function procedureBenchmarksForSpecialty(specialty: SpecialtyId): ProcedureBenchmark[] {
  return procedureBenchmarks.filter(item => item.specialty === specialty);
}
