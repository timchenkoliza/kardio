import type { DrugChangeType } from "@/lib/agents/types";

/**
 * Curated snapshot of real, publicly reported drug-related changes in
 * cardiology, collected 2026-10-19. Primary registries (ГРЛС, FDA databases)
 * are not connected, so every record names the page it came from and whether
 * that page is a primary or secondary source. Records are facts about
 * regulatory/evidence events, never treatment advice.
 */
export interface DrugChangeRecord {
  id: string;
  type: DrugChangeType;
  status: "effective" | "announced";
  region: "RU" | "US" | "EU" | "INTL";
  inn: string;
  brand: string | null;
  holder: string | null;
  title: string;
  claims: Array<{ claim: string; quote: string; quoteLanguage: "en" | "ru"; quoteKind: "verbatim" | "page_extract" }>;
  changeDate: string;
  changeDateNote: string | null;
  topics: string[];
  source: { name: string; url: string; publishedAt: string | null; kind: "primary" | "secondary" };
  verifyIn: string | null;
}

export const DRUG_SNAPSHOT_RETRIEVED_AT = "2026-10-19T09:00:00.000Z";

export const DRUG_CHANGES: readonly DrugChangeRecord[] = [
  {
    id: "baxdrostat-ru-registration",
    type: "NEW_REGISTRATION",
    status: "effective",
    region: "RU",
    inn: "баксдростат",
    brand: "Баксфенди",
    holder: "АстраЗенека АБ",
    title: "Баксдростат зарегистрирован в России",
    claims: [
      { claim: "Минздрав России зарегистрировал баксдростат (Баксфенди); регистрационное удостоверение выдано 31 августа 2026 года", quote: "регистрационное удостоверение выдано 31 августа 2026 года (по данным ГРЛС)", quoteLanguage: "ru", quoteKind: "page_extract" },
      { claim: "Показание по сообщению источника — артериальная гипертензия как дополнительная терапия при недостаточном снижении давления на трёх и более препаратах", quote: "препарат одобрен как дополнительная терапия для пациентов, которые принимают три и более антигипертензивных средства, но не достигают достаточного снижения давления", quoteLanguage: "ru", quoteKind: "page_extract" },
    ],
    changeDate: "2026-08-31",
    changeDateNote: "Дата регистрационного удостоверения по данным источника",
    topics: ["ah"],
    source: { name: "Коммерсантъ", url: "https://www.kommersant.ru/doc/8956362", publishedAt: "2026-09-17", kind: "secondary" },
    verifyIn: "ГРЛС (grls.rosminzdrav.ru)",
  },
  {
    id: "baxdrostat-fda-approval",
    type: "NEW_REGISTRATION",
    status: "effective",
    region: "US",
    inn: "baxdrostat",
    brand: "Baxfendy",
    holder: "AstraZeneca",
    title: "FDA одобрило баксдростат — первый ингибитор альдостеронсинтазы",
    claims: [
      { claim: "FDA одобрило баксдростат для взрослых с АГ, не контролируемой на фоне других антигипертензивных препаратов", quote: "Treatment of adults with hypertension whose blood pressure remains inadequately controlled despite other antihypertensive medications.", quoteLanguage: "en", quoteKind: "page_extract" },
      { claim: "BaxHTN: плацебо-скорректированное снижение САД к 12 неделе — 9,8 мм рт. ст. (2 мг) и 8,7 мм рт. ст. (1 мг)", quote: "Placebo-corrected seated systolic BP reductions through 12 weeks were 9.8 mm Hg with the 2-mg dose and 8.7 mm Hg with the 1-mg dose.", quoteLanguage: "en", quoteKind: "page_extract" },
      { claim: "Частые нежелательные явления в BaxHTN: гиперкалиемия, гипонатриемия, гипотензия, мышечные спазмы, головокружение", quote: "The most common adverse events in BaxHTN were hyperkalemia, hyponatremia, hypotension, muscle spasms, and dizziness.", quoteLanguage: "en", quoteKind: "page_extract" },
    ],
    changeDate: "2026-05-18",
    changeDateNote: "Дата публикации об одобрении; точная дата решения FDA на странице не указана",
    topics: ["ah"],
    source: { name: "TCTMD", url: "https://www.tctmd.com/news/fda-approves-baxdrostat-inadequately-controlled-hypertension", publishedAt: "2026-05-18", kind: "secondary" },
    verifyIn: "Drugs@FDA",
  },
  {
    id: "aficamten-fda-approval",
    type: "NEW_REGISTRATION",
    status: "effective",
    region: "US",
    inn: "aficamten",
    brand: "Myqorzo",
    holder: "Cytokinetics",
    title: "FDA одобрило афикамтен при обструктивной ГКМП",
    claims: [
      { claim: "Афикамтен (Myqorzo), ингибитор сердечного миозина, одобрен для взрослых с симптомной обструктивной ГКМП", quote: "Adults with \"symptomatic obstructive hypertrophic cardiomyopathy\" (oHCM)", quoteLanguage: "en", quoteKind: "page_extract" },
      { claim: "SEQUOIA-HCM: к 24 неделе пиковое потребление кислорода выросло в среднем на 1,8 мл/кг против отсутствия роста на плацебо", quote: "Met its primary endpoint at 24 weeks, improving peak oxygen uptake (pVO₂) by 1.8 ml/kg on average versus no increase with placebo.", quoteLanguage: "en", quoteKind: "page_extract" },
    ],
    changeDate: "2025-12-19",
    changeDateNote: "Дата пресс-релиза компании, на который ссылается источник",
    topics: ["cardiomyopathy"],
    source: { name: "AJMC", url: "https://www.ajmc.com/view/fda-approves-aficamten-for-obstructive-hypertrophic-cardiomyopathy", publishedAt: "2025-12-22", kind: "secondary" },
    verifyIn: "Drugs@FDA",
  },
  {
    id: "aficamten-fda-rems",
    type: "NEW_RESTRICTION",
    status: "effective",
    region: "US",
    inn: "aficamten",
    brand: "Myqorzo",
    holder: "Cytokinetics",
    title: "Афикамтен: предупреждение в рамке и программа REMS",
    claims: [
      { claim: "Предупреждение в рамке о сердечной недостаточности вследствие систолической дисфункции", quote: "Boxed warning for heart failure due to systolic dysfunction.", quoteLanguage: "en", quoteKind: "page_extract" },
      { claim: "Эхокардиографический контроль обязателен до и во время терапии; начинать при ФВ ЛЖ ниже 55% не рекомендуется", quote: "Echocardiographic monitoring is required before and during therapy. ... treatment initiation is not recommended in patients with LVEF below 55%.", quoteLanguage: "en", quoteKind: "verbatim" },
      { claim: "Отпуск только через программу REMS с ограниченным распространением", quote: "The drug will be dispensed only through a restricted REMS program.", quoteLanguage: "en", quoteKind: "page_extract" },
    ],
    changeDate: "2025-12-19",
    changeDateNote: "Ограничения введены вместе с одобрением",
    topics: ["cardiomyopathy"],
    source: { name: "AJMC", url: "https://www.ajmc.com/view/fda-approves-aficamten-for-obstructive-hypertrophic-cardiomyopathy", publishedAt: "2025-12-22", kind: "secondary" },
    verifyIn: "Drugs@FDA, инструкция производителя",
  },
  {
    id: "selexipag-ru-announced",
    type: "NEW_REGISTRATION",
    status: "announced",
    region: "RU",
    inn: "селексипаг",
    brand: null,
    holder: "ФМБА России",
    title: "Анонс: отечественный селексипаг для лечения ЛАГ",
    claims: [
      { claim: "ФМБА объявило, что препарат селексипага для пациентов с ЛАГ, включая детей, «будет зарегистрирован и доступен в этом году»; на дату сбора это анонс, а не регистрация", quote: "препарат «будет зарегистрирован и доступен в этом году»", quoteLanguage: "ru", quoteKind: "page_extract" },
    ],
    changeDate: "2026-06-02",
    changeDateNote: "Дата заявления; дата регистрации не указана",
    topics: ["ph"],
    source: { name: "РИА Новости", url: "https://ria.ru/20260602/preparat-2096319626.html", publishedAt: "2026-06-02", kind: "secondary" },
    verifyIn: "ГРЛС (grls.rosminzdrav.ru)",
  },
  {
    id: "esc-hf-2026-glp1-hfpef",
    type: "GUIDELINE_CHANGE",
    status: "effective",
    region: "INTL",
    inn: "семаглутид, тирзепатид",
    brand: null,
    holder: null,
    title: "ESC 2026: GLP-1-терапия при СНсФВ и ожирении",
    claims: [
      { claim: "Семаглутид или тирзепатид — класс IIa при симптомной СН с ФВ ЛЖ 45% и выше и ИМТ 30 и выше, независимо от диабета", quote: "Semaglutide or tirzepatide receives a Class IIa recommendation, \"should be considered,\" for symptomatic HF with LVEF of 45% or above and BMI of 30 or higher, regardless of diabetes status.", quoteLanguage: "en", quoteKind: "page_extract" },
    ],
    changeDate: "2026-08-28",
    changeDateNote: "Дата онлайн-публикации рекомендаций",
    topics: ["hf", "metabolic"],
    source: { name: "AJMC", url: "https://www.ajmc.com/view/5-things-to-know-about-the-2026-esc-heart-failure-guidelines", publishedAt: "2026-09-14", kind: "secondary" },
    verifyIn: "European Heart Journal, doi:10.1093/eurheartj/ehag100",
  },
  {
    id: "esc-hf-2026-sglt2-inhospital",
    type: "GUIDELINE_CHANGE",
    status: "effective",
    region: "INTL",
    inn: "иНГЛТ-2",
    brand: null,
    holder: null,
    title: "ESC 2026: иНГЛТ-2 — старт в стационаре после стабилизации",
    claims: [
      { claim: "Новая рекомендация: начинать иНГЛТ-2 в стационаре после стабилизации декомпенсированной СН", quote: "New recommendations include starting SGLT2 inhibitors in hospital after stabilization", quoteLanguage: "en", quoteKind: "page_extract" },
    ],
    changeDate: "2026-08-28",
    changeDateNote: "Дата онлайн-публикации рекомендаций",
    topics: ["hf"],
    source: { name: "AJMC", url: "https://www.ajmc.com/view/5-things-to-know-about-the-2026-esc-heart-failure-guidelines", publishedAt: "2026-09-14", kind: "secondary" },
    verifyIn: "European Heart Journal, doi:10.1093/eurheartj/ehag100",
  },
  {
    id: "single-af-2026",
    type: "IMPORTANT_NEW_STUDY",
    status: "effective",
    region: "INTL",
    inn: "ПОАК",
    brand: null,
    holder: null,
    title: "SINGLE-AF: ПОАК при промежуточном риске инсульта",
    claims: [
      { claim: "SINGLE-AF (NEJM): ПОАК снизили частоту неблагоприятных исходов против отсутствия антикоагуляции у пациентов с ФП и промежуточным риском инсульта без значимого роста больших кровотечений", quote: "Direct oral anticoagulants reduced adverse clinical outcomes vs no anticoagulation in atrial fibrillation patients at intermediate stroke risk, without a significant increase in major bleeding.", quoteLanguage: "en", quoteKind: "page_extract" },
    ],
    changeDate: "2026-08-31",
    changeDateNote: "Представлено на конгрессе ESC 2026 (конец августа); точная дата публикации на странице не указана",
    topics: ["af"],
    source: { name: "Hospital Healthcare Europe", url: "https://hospitalhealthcare.com/specialisms/cardiovascular/practice-changing-trials-and-guidelines-esc-congress-2026-highlights/", publishedAt: "2026-10-05", kind: "secondary" },
    verifyIn: "NEJM / PubMed",
  },
  {
    id: "staree-2026",
    type: "IMPORTANT_NEW_STUDY",
    status: "effective",
    region: "INTL",
    inn: "аторвастатин",
    brand: null,
    holder: null,
    title: "STAREE: аторвастатин у людей 70+ без ССЗ",
    claims: [
      { claim: "STAREE (NEJM): аторвастатин 40 мг снизил частоту больших сердечно-сосудистых событий на 30% против плацебо у людей 70 лет и старше без ССЗ, диабета и деменции", quote: "Atorvastatin 40 mg reduced major cardiovascular events by 30% vs placebo in adults aged 70+ without known cardiovascular disease, diabetes or dementia", quoteLanguage: "en", quoteKind: "page_extract" },
      { claim: "Выживаемость без инвалидности значимо не улучшилась", quote: "but did not significantly improve disability-free survival", quoteLanguage: "en", quoteKind: "page_extract" },
    ],
    changeDate: "2026-08-31",
    changeDateNote: "Представлено на конгрессе ESC 2026 (конец августа); точная дата публикации на странице не указана",
    topics: ["lipids", "prevention"],
    source: { name: "Hospital Healthcare Europe", url: "https://hospitalhealthcare.com/specialisms/cardiovascular/practice-changing-trials-and-guidelines-esc-congress-2026-highlights/", publishedAt: "2026-10-05", kind: "secondary" },
    verifyIn: "NEJM / PubMed",
  },
];
