import type { SpecialtyId } from "@/lib/domain/types";

/**
 * Which calculators each specialty sees, and what every calculator states
 * about itself: purpose, formula, where it applies, the primary source.
 * The formulas live in lib/calculators/formulas.ts; scores with checkboxes
 * (CHA₂DS₂-VA, HAS-BLED) in lib/ui/clinical-calculators.ts.
 */

export type CalculatorId = "cha2ds2va" | "hasbled" | "ckd_epi_2021" | "cockcroft_gault" | "schwartz_bedside" | "bmi" | "bsa_mosteller" | "gcs" | "homa_ir" | "gestation_lmp";

export interface CalculatorSource {
  citation: string;
  url: string;
}

export interface CalculatorDefinition {
  id: CalculatorId;
  title: string;
  group: string;
  purpose: string;
  formula: string;
  applicability: string;
  sources: CalculatorSource[];
}

const pubmed = (title: string) => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(title)}`;
const ESC_AF: CalculatorSource = { citation: "Van Gelder IC et al. 2024 ESC Guidelines for the management of atrial fibrillation. Eur Heart J 2024", url: "https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/atrial-fibrillation" };
const KDIGO: CalculatorSource = { citation: "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD — категории СКФ G1–G5", url: "https://kdigo.org/guidelines/ckd-evaluation-and-management/" };

export const CALCULATORS: Record<CalculatorId, CalculatorDefinition> = {
  cha2ds2va: { id: "cha2ds2va", title: "CHA₂DS₂-VA", group: "Фибрилляция предсердий", purpose: "Риск инсульта и тромбоэмболии при ФП", formula: "Сумма баллов: ХСН, АГ, СД, сосудистое заболевание — по 1; возраст 65–74 — 1, ≥75 — 2; инсульт/ТИА/эмболия — 2", applicability: "Взрослые с ФП без механического клапана и умеренного–тяжёлого митрального стеноза", sources: [ESC_AF] },
  hasbled: { id: "hasbled", title: "HAS-BLED", group: "Антикоагуляция", purpose: "Модифицируемые и немодифицируемые факторы риска кровотечения", formula: "По 1 баллу за каждый фактор", applicability: "Взрослые с ФП на антикоагулянтах; высокий балл — повод корректировать факторы, а не отменять антикоагуляцию", sources: [ESC_AF] },
  ckd_epi_2021: { id: "ckd_epi_2021", title: "СКФ по CKD-EPI 2021", group: "Почки", purpose: "Расчётная скорость клубочковой фильтрации по креатинину", formula: "142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^−1,200 × 0,9938^возраст × 1,012 [жен.]; κ = 0,7 (жен.) / 0,9 (муж.), α = −0,241 / −0,302; Scr в мг/дл", applicability: "Взрослые ≥18 лет; креатинин, стандартизованный по IDMS. Неточна при крайних значениях мышечной массы, ампутациях, острых изменениях функции почек", sources: [{ citation: "Inker LA et al. New creatinine- and cystatin C-based equations to estimate GFR without race. N Engl J Med 2021;385:1737–1749", url: "https://www.kidney.org/professionals/ckd-epi-creatinine-equation-2021" }, KDIGO] },
  cockcroft_gault: { id: "cockcroft_gault", title: "Клиренс креатинина по Кокрофту–Голту", group: "Почки", purpose: "Клиренс креатинина — величина, на которую ссылаются многие инструкции при коррекции дозы", formula: "(140 − возраст) × масса (кг) / (72 × Scr, мг/дл) × 0,85 [жен.]", applicability: "Взрослые; используется фактическая масса тела. Результат не нормирован на 1,73 м²", sources: [{ citation: "Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum creatinine. Nephron 1976;16:31–41", url: pubmed("Prediction of creatinine clearance from serum creatinine Cockcroft Gault") }] },
  schwartz_bedside: { id: "schwartz_bedside", title: "СКФ у детей по Шварцу (2009)", group: "Почки", purpose: "Расчётная СКФ у детей по росту и креатинину", formula: "0,413 × рост (см) / Scr (мг/дл)", applicability: "Дети 1–16 лет; креатинин ферментативным методом. Выведена у детей с ХБП (CKiD)", sources: [{ citation: "Schwartz GJ et al. New equations to estimate GFR in children with CKD. J Am Soc Nephrol 2009;20:629–637", url: "https://pubmed.ncbi.nlm.nih.gov/19158356/" }] },
  bmi: { id: "bmi", title: "Индекс массы тела", group: "Антропометрия", purpose: "ИМТ и категория ВОЗ для взрослых", formula: "масса (кг) / рост (м)²", applicability: "Взрослые. У детей и подростков — центильные кривые ВОЗ по возрасту и полу; ИМТ не различает жировую и мышечную массу", sources: [{ citation: "ВОЗ. Ожирение и избыточный вес (информационный бюллетень); классификация — WHO Technical Report Series 894, 2000", url: "https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight" }] },
  bsa_mosteller: { id: "bsa_mosteller", title: "Площадь поверхности тела (Мостеллер)", group: "Антропометрия", purpose: "Площадь поверхности тела по росту и массе", formula: "√(рост (см) × масса (кг) / 3600)", applicability: "Взрослые и дети. Доза по ППТ определяется инструкцией и протоколом", sources: [{ citation: "Mosteller RD. Simplified calculation of body-surface area. N Engl J Med 1987;317:1098", url: "https://pubmed.ncbi.nlm.nih.gov/3657876/" }] },
  gcs: { id: "gcs", title: "Шкала комы Глазго", group: "Неврология", purpose: "Уровень сознания по трём компонентам", formula: "Открывание глаз (1–4) + речевой ответ (1–5) + двигательный ответ (1–6); сумма 3–15", applicability: "Взрослые и дети старше 5 лет; у интубированных и при афазии речевой компонент не оценивается — указывайте это", sources: [{ citation: "Teasdale G, Jennett B. Assessment of coma and impaired consciousness. A practical scale. Lancet 1974;2:81–84", url: pubmed("Assessment of coma and impaired consciousness. A practical scale") }] },
  homa_ir: { id: "homa_ir", title: "HOMA-IR", group: "Обмен веществ", purpose: "Индекс инсулинорезистентности по глюкозе и инсулину натощак", formula: "инсулин натощак (мкЕд/мл) × глюкоза натощак (ммоль/л) / 22,5", applicability: "Исследовательский индекс; порог зависит от метода определения инсулина и популяции. Не применяется на инсулинотерапии", sources: [{ citation: "Matthews DR et al. Homeostasis model assessment: insulin resistance and β-cell function from fasting plasma glucose and insulin concentrations in man. Diabetologia 1985;28:412–419", url: "https://pubmed.ncbi.nlm.nih.gov/3899825/" }] },
  gestation_lmp: { id: "gestation_lmp", title: "Срок беременности и ПДР по менструации", group: "Беременность", purpose: "Гестационный срок и предполагаемая дата родов по первому дню последней менструации", formula: "ПДР = первый день последней менструации + 280 дней", applicability: "Регулярный цикл ~28 дней; срок уточняют по УЗИ в I триместре (КТР) — при расхождении ориентируются на УЗИ", sources: [{ citation: "ACOG Committee Opinion No. 700: Methods for estimating the due date. Obstet Gynecol 2017;129:e150–e154", url: "https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2017/05/methods-for-estimating-the-due-date" }] },
};

/** What each specialty sees first; the rest of the catalog stays one tap away («Все калькуляторы»). */
export const SPECIALTY_CALCULATORS: Record<SpecialtyId, CalculatorId[]> = {
  cardiology: ["cha2ds2va", "hasbled", "ckd_epi_2021", "cockcroft_gault", "bmi", "bsa_mosteller"],
  therapy: ["ckd_epi_2021", "cockcroft_gault", "bmi", "cha2ds2va", "hasbled", "bsa_mosteller"],
  pediatrics: ["schwartz_bedside", "bsa_mosteller", "bmi", "gcs"],
  obgyn: ["gestation_lmp", "bmi", "ckd_epi_2021"],
  neurology: ["gcs", "cha2ds2va", "hasbled", "ckd_epi_2021", "bmi"],
  endocrinology: ["bmi", "homa_ir", "ckd_epi_2021", "cockcroft_gault", "bsa_mosteller"],
  oncology: ["bsa_mosteller", "ckd_epi_2021", "cockcroft_gault", "bmi"],
};

export function calculatorsFor(specialty: SpecialtyId): { primary: CalculatorDefinition[]; other: CalculatorDefinition[] } {
  const primary = SPECIALTY_CALCULATORS[specialty].map(id => CALCULATORS[id]);
  const shown = new Set(SPECIALTY_CALCULATORS[specialty]);
  return { primary, other: Object.values(CALCULATORS).filter(item => !shown.has(item.id)) };
}
