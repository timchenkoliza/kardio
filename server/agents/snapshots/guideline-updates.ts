/**
 * Curated snapshot of real guideline publications outside the canonical
 * Golden Set. Collected 2026-10-19 from public pages; each assertion keeps the
 * source quote it was translated from. This is not a live integration: the
 * ESC connector is declared as a curated snapshot and must be refreshed by the
 * editorial pipeline.
 */
export interface GuidelineAssertion {
  claim: string;
  quote: string;
  quoteLanguage: "en" | "ru";
}

export interface GuidelineUpdateRecord {
  id: string;
  society: "ESC" | "ESC/ACC/AHA/WHF";
  title: string;
  titleRu: string;
  kind: "new_version" | "first_guideline" | "consensus_document";
  previousVersion: string | null;
  publishedAt: string | null;
  publishedNote: string | null;
  primaryUrl: string;
  doi: string | null;
  summarySource: { name: string; url: string; publishedAt: string | null };
  topics: string[];
  assertions: GuidelineAssertion[];
}

export const GUIDELINE_SNAPSHOT_RETRIEVED_AT = "2026-10-19T09:00:00.000Z";

export const GUIDELINE_UPDATES: readonly GuidelineUpdateRecord[] = [
  {
    id: "esc-hf-2026",
    society: "ESC",
    title: "2026 ESC Guidelines for the management of heart failure",
    titleRu: "ESC 2026: сердечная недостаточность",
    kind: "new_version",
    previousVersion: "ESC 2021 и фокусное обновление 2023",
    publishedAt: "2026-08-28",
    publishedNote: "Опубликовано онлайн в European Heart Journal",
    primaryUrl: "https://doi.org/10.1093/eurheartj/ehag100",
    doi: "10.1093/eurheartj/ehag100",
    summarySource: { name: "AJMC", url: "https://www.ajmc.com/view/5-things-to-know-about-the-2026-esc-heart-failure-guidelines", publishedAt: "2026-09-14" },
    topics: ["hf", "metabolic", "prevention", "ah"],
    assertions: [
      { claim: "Категорий по фракции выброса теперь две: HFmrEF упразднена, HFrEF — ФВ ЛЖ ниже 50%, HFpEF — 50% и выше с диастолической дисфункцией", quote: "Ejection fraction categories reduced to two. HFmrEF is eliminated. HFrEF covers LVEF below 50%, and HFpEF covers LVEF of 50% or above with diastolic dysfunction.", quoteLanguage: "en" },
      { claim: "Вместо «острой СН» — «декомпенсированная СН» с трёхфазной схемой ведения в стационаре; иНГЛТ-2 начинать в стационаре после стабилизации, диуретики рано титровать по натрию мочи", quote: "\"Decompensated heart failure\" replaces \"acute heart failure.\" A three-phase in-hospital framework (initial management, stabilization, and predischarge/early postdischarge care) is introduced. New recommendations include starting SGLT2 inhibitors in hospital after stabilization and using urinary sodium-guided diuretic therapy early.", quoteLanguage: "en" },
      { claim: "GDMT разделена на базовую (foundational) и дополнительную медикаментозную терапию; устройства и вмешательства вынесены в отдельную категорию", quote: "Guideline-directed medical therapy is split into foundational medical therapy and additional medical therapy. A separate category, guideline-directed interventional therapy, covers devices and procedures.", quoteLanguage: "en" },
      { claim: "Семаглутид или тирзепатид — класс IIa при симптомной СН с ФВ ЛЖ 45% и выше и ИМТ 30 и выше, независимо от диабета", quote: "Semaglutide or tirzepatide receives a Class IIa recommendation, \"should be considered,\" for symptomatic HF with LVEF of 45% or above and BMI of 30 or higher, regardless of diabetes status.", quoteLanguage: "en" },
      { claim: "Целевое САД ниже 130 мм рт. ст. при АГ или стадии B СН; принята четырёхстадийная модель A–D", quote: "The systolic blood pressure target drops to below 130 mm Hg for hypertension or stage B HF ... A formal 4-stage (A to D) framework is adopted, aligned with the 2022 AHA/ACC/HFSA staging model.", quoteLanguage: "en" },
    ],
  },
  {
    id: "esc-cvd-ckd-2026",
    society: "ESC",
    title: "2026 ESC Guidelines for the management of cardiovascular disease and chronic kidney disease",
    titleRu: "ESC 2026: сердечно-сосудистые заболевания и ХБП",
    kind: "first_guideline",
    previousVersion: null,
    publishedAt: null,
    publishedNote: "Представлены на конгрессе ESC 2026 (конец августа), опубликованы в European Heart Journal",
    primaryUrl: "https://doi.org/10.1093/eurheartj/ehag098",
    doi: "10.1093/eurheartj/ehag098",
    summarySource: { name: "Hospital Healthcare Europe", url: "https://hospitalhealthcare.com/specialisms/cardiovascular/practice-changing-trials-and-guidelines-esc-congress-2026-highlights/", publishedAt: "2026-10-05" },
    topics: ["cardiorenal", "hf", "ihd", "arrhythmia", "prevention"],
    assertions: [
      { claim: "Вводится схема STAMP: скрининг, триаж и учёт риска ХБП, модификация ведения ССЗ, планирование помощи", quote: "Introduce the STAMP framework: Screen, Triage and Address CKD risk, Modify cardiovascular disease management, and Plan health services.", quoteLanguage: "en" },
      { claim: "Рекомендуется активно выявлять ХБП при ОКС, сердечной недостаточности, аритмиях, инсульте, заболеваниях периферических артерий и внезапной сердечной смерти", quote: "Encourage active identification of CKD in conditions including acute coronary syndromes, heart failure, arrhythmias, stroke, peripheral arterial disease and sudden cardiac death.", quoteLanguage: "en" },
    ],
  },
  {
    id: "esc-rehab-2026",
    society: "ESC",
    title: "2026 ESC Guidelines on cardiac rehabilitation",
    titleRu: "ESC 2026: кардиореабилитация",
    kind: "first_guideline",
    previousVersion: null,
    publishedAt: null,
    publishedNote: "Первые рекомендации ESC по кардиореабилитации, конгресс ESC 2026",
    primaryUrl: "https://doi.org/10.1093/eurheartj/ehag099",
    doi: "10.1093/eurheartj/ehag099",
    summarySource: { name: "Hospital Healthcare Europe", url: "https://hospitalhealthcare.com/specialisms/cardiovascular/practice-changing-trials-and-guidelines-esc-congress-2026-highlights/", publishedAt: "2026-10-05" },
    topics: ["prevention", "ihd", "hf"],
    assertions: [
      { claim: "Единая рамка комплексной кардиореабилитации для разных групп пациентов и условий оказания помощи", quote: "Provide a unified framework for comprehensive cardiac rehabilitation across patient groups and healthcare settings.", quoteLanguage: "en" },
      { claim: "Отдельно разобраны телемедицина, телемониторинг, мобильные приложения и носимые устройства, включая реабилитацию на дому", quote: "Address telehealth, telemonitoring, mobile-health applications and wearable devices, which may widen access, including through home-based care.", quoteLanguage: "en" },
    ],
  },
  {
    id: "udmi-5-2026",
    society: "ESC/ACC/AHA/WHF",
    title: "Fifth Universal Definition of Myocardial Infarction",
    titleRu: "Пятое универсальное определение инфаркта миокарда",
    kind: "consensus_document",
    previousVersion: "Четвёртое универсальное определение (2018)",
    publishedAt: null,
    publishedNote: "Представлено на конгрессе ESC 2026; согласительный документ, не рекомендации ESC",
    primaryUrl: "https://hospitalhealthcare.com/specialisms/cardiovascular/practice-changing-trials-and-guidelines-esc-congress-2026-highlights/",
    doi: null,
    summarySource: { name: "Hospital Healthcare Europe", url: "https://hospitalhealthcare.com/specialisms/cardiovascular/practice-changing-trials-and-guidelines-esc-congress-2026-highlights/", publishedAt: "2026-10-05" },
    topics: ["ihd"],
    assertions: [
      { claim: "Нумерованные типы ИМ заменены тремя категориями: первичный, вторичный и связанный с процедурой ИМ", quote: "Replaces numerical MI types with three categories: primary MI, secondary MI and procedure-related MI.", quoteLanguage: "en" },
      { claim: "Для определения повреждения миокарда нужны половые 99-е перцентили верхней референсной границы тропонина", quote: "States that sex-specific 99th percentile upper reference limits for cardiac troponin are necessary when defining myocardial injury.", quoteLanguage: "en" },
    ],
  },
];
