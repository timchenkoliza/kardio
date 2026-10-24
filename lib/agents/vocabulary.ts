import type { SpecialtyId } from "@/lib/domain/types";
import type { SourceId } from "@/lib/mesh/sources";
import type { ContentTypePref, DeliveryChannel, EventFormatPref, Frequency, LearningGoal } from "./types";

/**
 * Chip vocabularies for visual (prompt-free) agent configuration.
 * Topic ids are stable; catalog topic ids map to the canonical Golden Set
 * `canonical_topic_id` values; PubMed terms are query fragments, not claims.
 */
export interface TopicOption {
  id: string;
  label: string;
  catalogTopics: string[];
  pubmed: string;
  keywords: string[];
  /**
   * Specialty-framed topic whose keyword is generic («профилактика», «ИИ»): it
   * scopes searches inside its own specialty only and never matches a question
   * asked from another specialty.
   */
  specialtyBound?: boolean;
}

export const TOPICS: Record<SpecialtyId, readonly TopicOption[]> = {
  cardiology: [
    { id: "ihd", label: "ИБС", catalogTopics: ["stable_ischemic_heart_disease", "stemi", "nstemi"], pubmed: "\"coronary artery disease\"[tiab] OR \"myocardial infarction\"[tiab]", keywords: ["ибс", "коронар", "инфаркт", "окс", "стенокард", "инфаркт миокард", "ишем болезн сердц", "ишеми миокард", "ишемическ кардиомиопат", "безболев ишеми"] },
    { id: "hf", label: "ХСН", catalogTopics: [], pubmed: "\"heart failure\"[tiab]", keywords: ["хсн", "сн", "снсфв", "сннфв", "снунфв", "снпфв", "снфв", "снснфв", "сердечн недостат", "сердечная недостаточность", "heart failure", "hfpef", "hfref"] },
    { id: "ah", label: "Артериальная гипертензия", catalogTopics: ["arterial_hypertension"], pubmed: "hypertension[tiab]", keywords: ["аг", "гипертенз", "гипертони", "давлен", "ад", "гипертони болезн"] },
    { id: "af", label: "Фибрилляция предсердий", catalogTopics: ["atrial_fibrillation"], pubmed: "\"atrial fibrillation\"[tiab]", keywords: ["фп", "фибрилляц", "трепетан", "антикоагул"] },
    { id: "lipids", label: "Липидология", catalogTopics: [], pubmed: "dyslipidemia[tiab] OR \"lipoprotein(a)\"[tiab] OR LDL[tiab]", keywords: ["липид", "холестер", "лпнп", "статин", "дислипид"] },
    { id: "arrhythmia", label: "Нарушения ритма", catalogTopics: ["ventricular_arrhythmias", "bradyarrhythmias", "supraventricular_tachycardia"], pubmed: "arrhythmia[tiab] OR tachycardia[tiab]", keywords: ["аритм", "тахикард", "брадикард", "ритм"] },
    { id: "valves", label: "Клапанные пороки", catalogTopics: ["aortic_regurgitation"], pubmed: "\"valvular heart disease\"[tiab] OR \"aortic stenosis\"[tiab] OR regurgitation[tiab]", keywords: ["клапан", "порок", "аортальн", "митральн", "трикуспид", "аортальн стеноз"] },
    { id: "cardiomyopathy", label: "Кардиомиопатии", catalogTopics: ["hypertrophic_cardiomyopathy", "myocarditis"], pubmed: "cardiomyopathy[tiab] OR myocarditis[tiab]", keywords: ["кардиомиопат", "гкмп", "миокардит", "амилоид"] },
    { id: "ph", label: "Лёгочная гипертензия", catalogTopics: ["pulmonary_hypertension"], pubmed: "\"pulmonary hypertension\"[tiab]", keywords: ["легочн гипертенз", "легочн артериальн гипертенз", "легочн гипертон", "лаг", "хтэлг"] },
    { id: "metabolic", label: "Метаболический синдром", catalogTopics: ["metabolic_syndrome"], pubmed: "\"metabolic syndrome\"[tiab] OR obesity[tiab]", keywords: ["метаболич", "ожирен", "кардиометабол"], specialtyBound: true },
    { id: "cardiorenal", label: "Кардиоренальные связи", catalogTopics: [], pubmed: "\"chronic kidney disease\"[tiab] AND cardiovascular[tiab]", keywords: ["почк", "хбп", "кардиоренал", "нефро"], specialtyBound: true },
    { id: "endocarditis", label: "Инфекционный эндокардит", catalogTopics: ["infective_endocarditis"], pubmed: "endocarditis[tiab]", keywords: ["эндокардит"] },
    { id: "prevention", label: "Профилактика", catalogTopics: ["prognosis_and_diagnostics", "treatment_strategies"], pubmed: "\"cardiovascular prevention\"[tiab] OR \"cardiovascular risk\"[tiab]", keywords: ["профилакт", "score2", "суммарн риск", "сердечно-сосудист риск"], specialtyBound: true },
    { id: "ai", label: "ИИ в кардиологии", catalogTopics: ["ai_in_cardiology"], pubmed: "\"artificial intelligence\"[tiab] AND cardiology[tiab]", keywords: ["ии", "искусственн интеллект", "нейросет"], specialtyBound: true },
  ],
  therapy: [
    { id: "ah", label: "Артериальная гипертензия", catalogTopics: [], pubmed: "hypertension[tiab]", keywords: ["аг", "гипертенз", "гипертони", "давлен", "ад", "гипертони болезн"] },
    { id: "dm2", label: "Сахарный диабет 2 типа", catalogTopics: [], pubmed: "\"type 2 diabetes\"[tiab]", keywords: ["сд2", "диабет 2"] },
    { id: "copd", label: "ХОБЛ", catalogTopics: [], pubmed: "COPD[tiab] OR \"chronic obstructive pulmonary\"[tiab]", keywords: ["хобл"] },
    { id: "asthma", label: "Бронхиальная астма", catalogTopics: [], pubmed: "asthma[tiab]", keywords: ["астм"] },
    { id: "pneumonia", label: "Пневмония", catalogTopics: [], pubmed: "pneumonia[tiab]", keywords: ["пневмон"] },
    { id: "ari", label: "ОРВИ и грипп", catalogTopics: [], pubmed: "\"respiratory tract infections\"[tiab] OR influenza[tiab]", keywords: ["орви", "грипп", "простуд"] },
    { id: "gerd", label: "ГЭРБ и диспепсия", catalogTopics: [], pubmed: "\"gastroesophageal reflux\"[tiab] OR dyspepsia[tiab]", keywords: ["гэрб", "рефлюкс", "диспепс", "изжог"] },
    { id: "anemia", label: "Анемии", catalogTopics: [], pubmed: "anemia[tiab] OR anaemia[tiab]", keywords: ["анеми"] },
    { id: "ckd", label: "Хроническая болезнь почек", catalogTopics: [], pubmed: "\"chronic kidney disease\"[tiab]", keywords: ["хбп", "почечн", "болезн почек"] },
    { id: "gout", label: "Подагра", catalogTopics: [], pubmed: "gout[tiab] OR hyperuricemia[tiab]", keywords: ["подагр", "гиперурикем"] },
    { id: "osteoarthritis", label: "Остеоартрит", catalogTopics: [], pubmed: "osteoarthritis[tiab]", keywords: ["остеоартр", "артроз"] },
    { id: "lipids", label: "Дислипидемия", catalogTopics: [], pubmed: "dyslipidemia[tiab] OR LDL[tiab]", keywords: ["липид", "холестер", "лпнп", "дислипид"] },
  ],
  pediatrics: [
    { id: "fever", label: "ОРВИ и лихорадка у детей", catalogTopics: [], pubmed: "(\"respiratory tract infections\"[tiab] OR fever[tiab]) AND child*[tiab]", keywords: ["орви", "лихорад", "температур", "простуд"], specialtyBound: true },
    { id: "otitis", label: "Острый средний отит", catalogTopics: [], pubmed: "\"otitis media\"[tiab]", keywords: ["отит"] },
    { id: "bronchiolitis", label: "Бронхиолит", catalogTopics: [], pubmed: "bronchiolitis[tiab]", keywords: ["бронхиолит"] },
    { id: "asthma", label: "Бронхиальная астма у детей", catalogTopics: [], pubmed: "asthma[tiab] AND child*[tiab]", keywords: ["астм"], specialtyBound: true },
    { id: "atopic", label: "Атопический дерматит", catalogTopics: [], pubmed: "\"atopic dermatitis\"[tiab] OR eczema[tiab]", keywords: ["атопич", "дерматит", "экзем"] },
    { id: "food_allergy", label: "Пищевая аллергия", catalogTopics: [], pubmed: "\"food allergy\"[tiab] OR \"food hypersensitivity\"[tiab]", keywords: ["пищев аллерг", "аллергия на белок"] },
    { id: "vaccination", label: "Вакцинация", catalogTopics: [], pubmed: "vaccin*[tiab] AND child*[tiab]", keywords: ["вакцин", "прививк"], specialtyBound: true },
    { id: "neonatal", label: "Неонатология", catalogTopics: [], pubmed: "newborn*[tiab] OR neonat*[tiab]", keywords: ["новорожд", "неонат", "желтух"] },
    { id: "growth", label: "Рост и развитие", catalogTopics: [], pubmed: "\"child development\"[tiab] OR \"growth disorders\"[tiab] OR \"short stature\"[tiab]", keywords: ["низкоросл", "задержк развит", "физическ развит"] },
    { id: "feeding", label: "Вскармливание и питание", catalogTopics: [], pubmed: "breastfeeding[tiab] OR \"infant nutrition\"[tiab] OR \"complementary feeding\"[tiab]", keywords: ["вскармлив", "прикорм", "грудн молок", "детск смес"] },
    { id: "uti", label: "Инфекции мочевых путей", catalogTopics: [], pubmed: "\"urinary tract infections\"[tiab] AND child*[tiab]", keywords: ["мочев инфекц", "пиелонеф", "инфекц мочев"], specialtyBound: true },
    { id: "adhd", label: "СДВГ", catalogTopics: [], pubmed: "ADHD[tiab] OR \"attention deficit\"[tiab]", keywords: ["сдвг", "гиперактив"] },
  ],
  obgyn: [
    { id: "preeclampsia", label: "Преэклампсия и гипертензия беременных", catalogTopics: [], pubmed: "preeclampsia[tiab] OR \"pre-eclampsia\"[tiab] OR \"gestational hypertension\"[tiab]", keywords: ["преэклампс", "гестоз"] },
    { id: "gdm", label: "Гестационный сахарный диабет", catalogTopics: [], pubmed: "\"gestational diabetes\"[tiab]", keywords: ["гестацион диабет", "гсд"] },
    { id: "preterm", label: "Преждевременные роды", catalogTopics: [], pubmed: "\"preterm birth\"[tiab] OR \"preterm labor\"[tiab]", keywords: ["преждевремен род", "недонош"] },
    { id: "pregnancy", label: "Ведение беременности", catalogTopics: [], pubmed: "\"prenatal care\"[tiab] OR \"antenatal care\"[tiab]", keywords: ["беременн", "антенатал", "пренатал"] },
    { id: "endometriosis", label: "Эндометриоз", catalogTopics: [], pubmed: "endometriosis[tiab]", keywords: ["эндометриоз"] },
    { id: "pcos", label: "Синдром поликистозных яичников", catalogTopics: [], pubmed: "\"polycystic ovary\"[tiab]", keywords: ["спкя", "поликистоз"] },
    { id: "contraception", label: "Контрацепция", catalogTopics: [], pubmed: "contracepti*[tiab]", keywords: ["контрацеп"] },
    { id: "menopause", label: "Менопауза и МГТ", catalogTopics: [], pubmed: "menopaus*[tiab] OR \"menopausal hormone therapy\"[tiab]", keywords: ["менопауз", "климакт", "мгт"] },
    { id: "infertility", label: "Бесплодие и ВРТ", catalogTopics: [], pubmed: "infertility[tiab] OR \"in vitro fertilization\"[tiab]", keywords: ["бесплод", "эко", "врт"] },
    { id: "cervical", label: "Шейка матки и ВПЧ", catalogTopics: [], pubmed: "\"cervical cancer screening\"[tiab] OR \"human papillomavirus\"[tiab]", keywords: ["впч", "шейк матк", "цервикал"] },
    { id: "fibroids", label: "Миома матки", catalogTopics: [], pubmed: "leiomyoma[tiab] OR \"uterine fibroids\"[tiab]", keywords: ["миом"] },
  ],
  neurology: [
    { id: "stroke", label: "Инсульт", catalogTopics: [], pubmed: "stroke[tiab]", keywords: ["инсульт", "онмк", "инфаркт мозг", "инфаркт головн мозг"] },
    { id: "epilepsy", label: "Эпилепсия", catalogTopics: [], pubmed: "epilep*[tiab]", keywords: ["эпилеп", "судорог"] },
    { id: "headache", label: "Мигрень и головная боль", catalogTopics: [], pubmed: "migraine[tiab] OR headache[tiab]", keywords: ["мигрен", "головн бол", "цефалг"] },
    { id: "ms", label: "Рассеянный склероз", catalogTopics: [], pubmed: "\"multiple sclerosis\"[tiab]", keywords: ["рассеян склероз"] },
    { id: "parkinson", label: "Болезнь Паркинсона", catalogTopics: [], pubmed: "parkinson*[tiab]", keywords: ["паркинсон"] },
    { id: "dementia", label: "Деменция и когнитивные нарушения", catalogTopics: [], pubmed: "dementia[tiab] OR \"cognitive impairment\"[tiab] OR alzheimer*[tiab]", keywords: ["деменц", "когнитив", "альцгейм"] },
    { id: "neuropathy", label: "Полинейропатии", catalogTopics: [], pubmed: "neuropath*[tiab]", keywords: ["нейропат", "невропат", "полинейр"] },
    { id: "back_pain", label: "Боль в спине", catalogTopics: [], pubmed: "\"low back pain\"[tiab] OR radiculopathy[tiab]", keywords: ["боль в спин", "люмбал", "радикулопат", "дорсопат"] },
    { id: "sleep", label: "Нарушения сна", catalogTopics: [], pubmed: "insomnia[tiab] OR \"sleep disorders\"[tiab]", keywords: ["инсомн", "бессонниц", "нарушени сна"] },
    { id: "vertigo", label: "Головокружение", catalogTopics: [], pubmed: "vertigo[tiab] OR dizziness[tiab]", keywords: ["головокруж", "вертиго"] },
  ],
  endocrinology: [
    { id: "dm1", label: "Сахарный диабет 1 типа", catalogTopics: [], pubmed: "\"type 1 diabetes\"[tiab]", keywords: ["сд1", "диабет 1"] },
    { id: "dm2", label: "Сахарный диабет 2 типа", catalogTopics: [], pubmed: "\"type 2 diabetes\"[tiab]", keywords: ["сд2", "диабет 2"] },
    { id: "obesity", label: "Ожирение", catalogTopics: [], pubmed: "obesity[tiab]", keywords: ["ожирен", "избыточн масс"] },
    { id: "hypothyroidism", label: "Гипотиреоз", catalogTopics: [], pubmed: "hypothyroidism[tiab]", keywords: ["гипотиреоз"] },
    { id: "hyperthyroidism", label: "Тиреотоксикоз", catalogTopics: [], pubmed: "hyperthyroidism[tiab] OR \"Graves disease\"[tiab]", keywords: ["тиреотокс", "гипертиреоз", "базедов", "грейвс"] },
    { id: "thyroid_nodules", label: "Узлы щитовидной железы", catalogTopics: [], pubmed: "\"thyroid nodule\"[tiab] OR \"thyroid nodules\"[tiab]", keywords: ["узл щитовид", "узлов зоб"] },
    { id: "osteoporosis", label: "Остеопороз", catalogTopics: [], pubmed: "osteoporosis[tiab]", keywords: ["остеопороз"] },
    { id: "adrenal", label: "Заболевания надпочечников", catalogTopics: [], pubmed: "adrenal[tiab]", keywords: ["надпочечн", "аддисон", "кушинг", "феохромоцит"] },
    { id: "pituitary", label: "Заболевания гипофиза", catalogTopics: [], pubmed: "pituitary[tiab] OR acromegaly[tiab] OR prolactinoma[tiab]", keywords: ["гипофиз", "акромегал", "пролактин"] },
    { id: "diabetes_tech", label: "Технологии в диабетологии", catalogTopics: [], pubmed: "\"continuous glucose monitoring\"[tiab] OR \"insulin pump\"[tiab]", keywords: ["инсулинов помп", "мониторинг глюкоз", "cgm"] },
  ],
  oncology: [
    { id: "breast", label: "Рак молочной железы", catalogTopics: [], pubmed: "\"breast cancer\"[tiab]", keywords: ["молочн", "рмж"] },
    { id: "lung", label: "Рак лёгкого", catalogTopics: [], pubmed: "\"lung cancer\"[tiab]", keywords: ["легк", "лёгк"] },
    { id: "colorectal", label: "Колоректальный рак", catalogTopics: [], pubmed: "\"colorectal cancer\"[tiab]", keywords: ["колоректал", "кишк"] },
    { id: "prostate", label: "Рак предстательной железы", catalogTopics: [], pubmed: "\"prostate cancer\"[tiab]", keywords: ["предстательн", "простат"] },
    { id: "melanoma", label: "Меланома", catalogTopics: [], pubmed: "melanoma[tiab]", keywords: ["меланом"] },
    { id: "immunotherapy", label: "Иммунотерапия", catalogTopics: [], pubmed: "immunotherapy[tiab] AND cancer[tiab]", keywords: ["иммунотерап", "ингибитор контрольн"] },
    { id: "supportive", label: "Поддерживающая терапия", catalogTopics: [], pubmed: "\"supportive care\"[tiab] AND cancer[tiab]", keywords: ["поддерживающ"] },
  ],
};

export interface SourceOption {
  id: string;
  label: string;
  /** Golden Set source ids or connector ids this preference maps to. */
  matches: string[];
  /** PubMed journal (NLM abbreviation): a filter when trusted in research, excluded or ranked first in answers. */
  pubmedJournal: string | null;
  /**
   * Answer-path (source mesh) sources this option stands for as a whole.
   * Resolved in one place for the planner, adapters and compiler: lib/mesh/source-preferences.ts.
   */
  meshSources: readonly SourceId[];
}

export const SOURCE_OPTIONS: readonly SourceOption[] = [
  { id: "rko", label: "РКО", matches: ["src-rko", "src-rko-guidelines", "src-rko-video", "src-rko-esc", "rnmo-rko"], pubmedJournal: null, meshSources: ["goldenset_catalog"] },
  { id: "rkj", label: "Российский кардиологический журнал", matches: ["src-rkj"], pubmedJournal: "Russ J Cardiol", meshSources: [] },
  { id: "esc", label: "ESC", matches: ["esc-guidelines", "esc-congresses", "src-rko-esc"], pubmedJournal: "Eur Heart J", meshSources: ["esc_guidelines_snapshot"] },
  { id: "pubmed", label: "PubMed", matches: ["pubmed"], pubmedJournal: null, meshSources: ["pubmed"] },
  { id: "nejm", label: "NEJM", matches: ["journal-nejm"], pubmedJournal: "N Engl J Med", meshSources: [] },
  { id: "lancet", label: "The Lancet", matches: ["journal-lancet"], pubmedJournal: "Lancet", meshSources: [] },
  { id: "aha", label: "AHA / ACC", matches: ["aha-meetings"], pubmedJournal: "Circulation", meshSources: [] },
  // FDA labels (openFDA) are drug instructions, and ГРЛС / the rubricator are official hand-offs: neither is a regulatory message.
  { id: "regulators", label: "Регуляторы (Минздрав, FDA)", matches: ["regulatory-news"], pubmedJournal: null, meshSources: ["regulatory_snapshot"] },
  { id: "nmo", label: "Портал НМО", matches: ["rnmo-rko"], pubmedJournal: null, meshSources: [] },
  { id: "telegram", label: "Телеграм-каналы", matches: ["telegram"], pubmedJournal: null, meshSources: [] },
];

export const CONTENT_TYPE_OPTIONS: ReadonlyArray<{ id: ContentTypePref; label: string }> = [
  { id: "research", label: "Исследования" },
  { id: "guidelines", label: "Рекомендации" },
  { id: "drugs", label: "Препараты" },
  { id: "events", label: "События" },
  { id: "learning", label: "Обучение" },
];

export const FREQUENCY_OPTIONS: ReadonlyArray<{ id: Frequency; label: string; hours: number }> = [
  { id: "important_only", label: "Только важное", hours: 24 * 7 },
  { id: "daily", label: "Ежедневно", hours: 24 },
  { id: "weekly", label: "Раз в неделю", hours: 24 * 7 },
];

export const DELIVERY_OPTIONS: ReadonlyArray<{ id: DeliveryChannel; label: string; available: boolean; note: string }> = [
  { id: "home", label: "На главной", available: true, note: "Находки появляются в ленте «Для вас»" },
  { id: "save", label: "Сохранять", available: true, note: "Новые находки сразу попадают в «Мои материалы»" },
  { id: "notification", label: "Уведомления", available: false, note: "Push и email-уведомления пока не подключены" },
  { id: "calendar", label: "Календарь", available: true, note: "Только через подтверждение: файл .ics для вашего календаря" },
];

export const FORMAT_OPTIONS: ReadonlyArray<{ id: EventFormatPref; label: string }> = [
  { id: "moscow", label: "Москва" },
  { id: "spb", label: "Санкт-Петербург" },
  { id: "regions", label: "Регионы" },
  { id: "online", label: "Онлайн" },
  { id: "international", label: "Зарубежные" },
];

export const HORIZON_OPTIONS: ReadonlyArray<{ days: number; label: string }> = [
  { days: 30, label: "30 дней" },
  { days: 60, label: "60 дней" },
  { days: 90, label: "90 дней" },
  { days: 365, label: "Год" },
];

export const GOAL_OPTIONS: ReadonlyArray<{ id: LearningGoal; label: string }> = [
  { id: "guideline_refresh", label: "Освежить рекомендации" },
  { id: "nmo_points", label: "Баллы НМО" },
  { id: "new_topic", label: "Освоить новую тему" },
  { id: "exam_prep", label: "Подготовка к аккредитации" },
];

/** Narrower conditions named with a broader topic's word, whichever specialty is asking: «pulmonary hypertension» is not «hypertension». */
const NARROWER_TERMS: readonly string[] = [
  '"pulmonary arterial hypertension"[tiab]',
  '"pulmonary hypertension"[tiab]',
  '"portal hypertension"[tiab]',
  '"intracranial hypertension"[tiab]',
  '"ocular hypertension"[tiab]',
];

/** The specialty's topic terms plus the narrower forms: a title about a more specific condition does not count for a broader topic. */
export function specificTopicTerms(specialty: SpecialtyId): string[] {
  return [...new Set([...TOPICS[specialty].map(topic => topic.pubmed), ...NARROWER_TERMS].filter(Boolean))];
}

export function topicsFor(specialty: SpecialtyId): readonly TopicOption[] {
  return TOPICS[specialty];
}

export function topicById(specialty: SpecialtyId, id: string): TopicOption | undefined {
  return TOPICS[specialty].find(topic => topic.id === id);
}

export function topicLabels(specialty: SpecialtyId, ids: readonly string[]): string[] {
  return ids.map(id => topicById(specialty, id)?.label).filter((label): label is string => Boolean(label));
}

/**
 * Russian clinical concepts → PubMed terms. Lets the research agent search
 * English-language literature for the concepts of a Russian question instead
 * of only its topic. Matching is stem-based and Cyrillic-safe.
 */
export interface PubmedConcept {
  id: string;
  label: string;
  match: RegExp;
  term: string;
  /** An abbreviation that counts only as written in capitals («ИМ», not the pronoun «им»). */
  cased?: RegExp;
}

const START = "(?<![\\p{L}\\p{N}])";
const concept = (id: string, label: string, stems: string, term: string, cased?: string): PubmedConcept => ({ id, label, match: new RegExp(`${START}(?:${stems})`, "u"), term, ...(cased ? { cased: new RegExp(`${START}(?:${cased})(?![\\p{L}\\p{N}])`, "u") } : {}) });

export const PUBMED_CONCEPTS: readonly PubmedConcept[] = [
  concept("anticoagulation", "антикоагулянты", "поак|ноак|доак|антикоагул|апиксабан|ривароксабан|дабигатран|эдоксабан|варфарин", "anticoagula*[tiab] OR \"factor Xa\"[tiab] OR apixaban[tiab] OR rivaroxaban[tiab] OR dabigatran[tiab] OR edoxaban[tiab] OR warfarin[tiab]"),
  concept("antiplatelet", "антиагреганты", "антиагрегант|антитромбоцитар|дезагрегант|тикагрелор|клопидогрел|прасугрел", "antiplatelet[tiab] OR ticagrelor[tiab] OR clopidogrel[tiab] OR prasugrel[tiab]"),
  concept("stroke", "инсульт", "(?:(?:остр\\p{L}*\\s+)?(?:ишемическ|геморрагическ|кардиоэмболическ|лакунарн)\\p{L}*\\s+)?инсульт|онмк|тиа(?![\\p{L}])|транзиторн\\p{L}*\\s+ишемическ\\p{L}*\\s+атак|инфаркт\\p{L}*\\s+(?:головного\\s+)?мозг", "stroke[tiab] OR \"transient ischemic\"[tiab]"),
  concept("intermediate", "промежуточный риск", "промежуточн", "intermediate[tiab]"),
  concept("bleeding", "кровотечения", "кровотеч|геморраг", "bleeding[tiab] OR hemorrhag*[tiab]"),
  concept("sglt2", "иНГЛТ-2", "ингл|sglt|глифлозин|дапаглифлозин|эмпаглифлозин", "SGLT2[tiab] OR \"sodium-glucose\"[tiab] OR gliflozin*[tiab]"),
  concept("glp1", "ГПП-1", "гпп|аргпп|glp|семаглутид|тирзепатид|лираглутид", "\"GLP-1\"[tiab] OR semaglutide[tiab] OR tirzepatide[tiab]"),
  concept("statin", "статины", "статин|аторвастатин|розувастатин", "statin*[tiab] OR atorvastatin[tiab] OR rosuvastatin[tiab]"),
  concept("pcsk9", "PCSK9 и инклисиран", "pcsk9|пцск|инклисиран|эволокумаб|алирокумаб", "PCSK9[tiab] OR inclisiran[tiab]"),
  concept("lpa", "липопротеин(а)", "липопротеин\\s*\\(?а|lp\\(a", "\"lipoprotein(a)\"[tiab]"),
  concept("mra", "антагонисты МКР", "финеренон|спиронолактон|эплеренон|антагонист.{0,20}минералокорт\\p{L}*(?:\\s+рецептор)?", "finerenone[tiab] OR spironolactone[tiab] OR \"mineralocorticoid receptor\"[tiab]"),
  concept("aldosterone_synthase", "ингибиторы альдостеронсинтазы", "баксдростат|лорундростат|альдостеронсинтаз", "baxdrostat[tiab] OR lorundrostat[tiab] OR \"aldosterone synthase\"[tiab]"),
  concept("myosin", "ингибиторы миозина", "мавакамтен|афикамтен|миозин", "mavacamten[tiab] OR aficamten[tiab] OR \"myosin inhibitor\"[tiab]"),
  concept("ablation", "абляция", "абляц|аблац|изоляц.{0,12}легочн", "ablation[tiab]"),
  concept("mi", "инфаркт миокарда (ИМ)", "инфаркт\\p{L}*\\s+миокард", "\"myocardial infarction\"[tiab]", "ИМ|ОИМ"),
  // Only coronary bypass: «АКШ», «аорто-/маммарокоронарное шунтирование», «шунтирование коронарных артерий», or
  // «шунтирование» in one clause with a coronary word — never a named other shunt (gastric, portosystemic, ventricular…).
  concept("cabg", "АКШ", "акш|мкш|(?:аорто|маммаро)?-?коронарн\\p{L}*\\s+шунтир|(?<!(?:бариатрическ|портосистемн|портокавальн|вентрикул\\p{L}*|экстра-интракраниальн|интракраниальн|экстракраниальн|ликворн|спленоренальн|мезентериальн|артериовенозн|желудочн|внутрипеченочн)\\p{L}*\\s)шунтир\\p{L}*(?![\\p{L}])(?!\\s+(?:желудк|кишечн|печен|почк|при\\s+гидроцефал|при\\s+впс))(?:\\s+коронарн|(?=[^.;!?]{0,50}?(?:ибс|ишемическ\\p{L}*\\s+болезн\\p{L}*\\s+сердц|инфаркт\\p{L}*\\s+миокард|(?<![\\p{L}])им(?![\\p{L}])|стенокард|многососуд|работающ\\p{L}*\\s+сердц|(?<![\\p{L}])ик(?![\\p{L}])|чкв|стентир|хсн|сердечн\\p{L}*\\s+недостаточн)))|(?:ибс|ишемическ\\p{L}*\\s+болезн\\p{L}*\\s+сердц|инфаркт\\p{L}*\\s+миокард|стенокард|чкв|стентир)[^.;!?]{0,50}?(?<!(?:бариатрическ|портосистемн|вентрикул\\p{L}*|экстра-интракраниальн|интракраниальн|желудочн)\\p{L}*\\s)шунтир(?!\\p{L}*\\s+(?:желудк|кишечн|печен|почк))", "\"coronary artery bypass\"[tiab] OR CABG[tiab]"),
  concept("pe", "ТЭЛА", "тэла|тромбоэмболи\\p{L}*\\s+легочн\\p{L}*(?![\\p{L}])(?!\\s+гипертенз)(?:\\s+артери\\p{L}*)?", "\"pulmonary embolism\"[tiab]"),
  concept("pci", "ЧКВ и стентирование", "чкв|стентир|чрескожн", "\"percutaneous coronary\"[tiab] OR PCI[tiab] OR stent*[tiab]"),
  concept("tavi", "TAVI", "tavi|тави|тавр|транскатетерн", "TAVI[tiab] OR TAVR[tiab] OR transcatheter[tiab]"),
  concept("elderly", "пожилые пациенты", "пожил|старше\\s*(?:70|75|80)|70\\+|75\\+", "elderly[tiab] OR older[tiab] OR aged[tiab]"),
  concept("ckd", "ХБП", "хбп|почечн|рскф|(?:хроническ\\p{L}*\\s+)?болезн\\p{L}*\\s+почек", "\"chronic kidney disease\"[tiab] OR CKD[tiab] OR renal[tiab]"),
  concept("dm1", "сахарный диабет 1 типа", "сд\\s*1(?![\\p{N}])(?:-?го)?(?:\\s*тип\\p{L}*)?|(?:сахарн\\p{L}*\\s+)?диабет\\p{L}*\\s+1(?:-?го)?\\s*тип\\p{L}*|1(?:-?го)?\\s*тип\\p{L}*\\s+(?:сахарн\\p{L}*\\s+)?диабет\\p{L}*", "\"type 1 diabetes\"[tiab]"),
  concept("dm2", "сахарный диабет 2 типа", "сд\\s*2(?![\\p{N}])(?:-?го)?(?:\\s*тип\\p{L}*)?|(?:сахарн\\p{L}*\\s+)?диабет\\p{L}*\\s+2(?:-?го)?\\s*тип\\p{L}*|2(?:-?го)?\\s*тип\\p{L}*\\s+(?:сахарн\\p{L}*\\s+)?диабет\\p{L}*", "\"type 2 diabetes\"[tiab]"),
  concept("diabetes", "сахарный диабет", "(?:сахарн\\p{L}*\\s+)?диабет\\p{L}*|сд2|сд(?![\\p{L}])", "diabet*[tiab]"),
  // «гипогликемические препараты» are glucose-lowering drugs, not hypoglycaemia.
  concept("hypoglycemia", "гипогликемия", "гипогликеми(?!ческ\\p{L}*\\s+(?:препарат|средств|терапи|агент|лекарств))", "hypoglyc*[tiab]"),
  concept("insulin", "инсулин", "инсулинотерап|инсулин(?:а|у|ом|е|ы|ов)?(?![\\p{L}])", "insulin[tiab]"),
  concept("birth", "роды", "(?<!(?:разн|нескольк|друг|эт|всех|двух|тр[её]х|многих|одн)\\p{L}*\\s)род(?:ы|ов|ах|ам|ами)(?![\\p{L}])|родоразрешени|послеродов", "delivery[tiab] OR childbirth[tiab] OR postpartum[tiab]"),
  concept("obesity", "ожирение", "ожирен", "obesity[tiab] OR obese[tiab]"),
  concept("pregnancy", "беременность", "беременн", "pregnan*[tiab]"),
  concept("hyperkalemia", "гиперкалиемия", "гиперкалием", "hyperkalemia[tiab] OR hyperkalaemia[tiab]"),
  concept("amyloidosis", "амилоидоз", "амилоид|ттр", "amyloid*[tiab]"),
  concept("myocarditis", "миокардит", "миокардит", "myocarditis[tiab]"),
  concept("rehabilitation", "реабилитация", "реабилитац", "rehabilitation[tiab]"),
  concept("ai", "ИИ", "искусственн.{0,6}интеллект|нейросет|ии(?![\\p{L}])", "\"artificial intelligence\"[tiab] OR \"machine learning\"[tiab] OR \"deep learning\"[tiab]"),
];

/** At most `limit` concepts go into one PubMed query (the research run's limit is 4). */
export function pubmedConceptsIn(text: string, limit = 4): PubmedConcept[] {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  const found = PUBMED_CONCEPTS.filter(item => item.match.test(normalized) || Boolean(item.cased?.test(text.normalize("NFKC"))));
  // A stated diabetes type replaces the general concept: «type 1 diabetes», not any diabetes.
  const typed = found.some(item => item.id === "dm1" || item.id === "dm2");
  return found.filter(item => !(typed && item.id === "diabetes")).slice(0, limit);
}

/** Human label for a catalog ontology topic (e.g. "pulmonary_hypertension" → "Лёгочная гипертензия"). */
export function catalogTopicLabel(specialty: SpecialtyId, catalogTopic: string): string {
  const match = TOPICS[specialty].find(topic => topic.catalogTopics.includes(catalogTopic));
  return match?.label ?? catalogTopic.replace(/_/g, " ");
}

export function sourceById(id: string): SourceOption | undefined {
  return SOURCE_OPTIONS.find(source => source.id === id);
}

export function sourceLabels(ids: readonly string[]): string[] {
  return ids.map(id => sourceById(id)?.label).filter((label): label is string => Boolean(label));
}

/**
 * Map arbitrary Russian/English text to topic ids using keyword stems. A key inside a word counts
 * («дислипидемия» → «липид»), but not after a negating «не» («неклапанная» is not «клапан»). A topic whose
 * matched words all belong to a multi-word key of another found topic is that narrower topic, not its own:
 * «лёгочная гипертензия» is pulmonary hypertension, not arterial hypertension through «гипертенз».
 */
/** Abbreviations with another meaning in a context: «АД» in «атопический дерматит (АД)» is not blood pressure. */
const AMBIGUOUS_KEYS: Readonly<Record<string, RegExp>> = {
  ад: /атопическ/u,
  // An infarction of another organ is not ИБС («инфаркт мозга», «лакунарный инфаркт», «инфаркты плаценты»).
  инфаркт: /инфаркт\p{L}*\s+(?:мозг|мозжечк|плацент|почк|селезен|кишечн|легк|легочн|спинн|сетчатк)|(?:лакунарн|церебральн|ишемическ|геморрагическ|кардиоэмболическ|мозгов)\p{L}*\s+инфаркт/u,
};

export function topicsMentioned(specialty: SpecialtyId, text: string): string[] {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  const words = normalized.match(/[\p{L}\p{N}-]+/gu) ?? [];
  const hitsWord = (part: string, word: string) => part.length <= 3 ? new RegExp(`(^|[^\\p{L}\\p{N}])${part}([^\\p{L}\\p{N}]|$)`, "u").test(word) : word.includes(part) && !word.startsWith(`не${part}`);
  const at = (part: string): number[] => words.flatMap((word, index) => hitsWord(part, word) ? [index] : []);
  const match = (topic: TopicOption) => {
    // Keys are compared the way the text is normalised («лёгочн» → «легочн»).
    const found = topic.keywords.filter(keyword => !AMBIGUOUS_KEYS[keyword]?.test(normalized)).flatMap(keyword => {
      const parts = keyword.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").split(" ");
      const positions = parts.map(at);
      if (!positions.every(list => list.length)) return [];
      // A multi-word key also records where its words stand together («лёгочная гипертензия»): only that phrase is the narrower topic.
      const phrase = parts.length > 1 ? positions[0].filter(start => parts.every((part, offset) => start + offset < words.length && hitsWord(part, words[start + offset]))).flatMap(start => parts.map((_, offset) => start + offset)) : [];
      return [{ words: positions.flat(), phrase: new Set(phrase) }];
    });
    return found.length ? { id: topic.id, words: new Set(found.flatMap(item => item.words)), phrases: found.map(item => item.phrase).filter(phrase => phrase.size) } : null;
  };
  const own = (TOPICS[specialty] ?? []).flatMap(topic => match(topic) ?? []);
  // Narrower phrases of any specialty («легочн гипертенз» in cardiology) also stop a broader key in a specialty without that topic.
  const narrower = (Object.keys(TOPICS) as SpecialtyId[]).flatMap(id => TOPICS[id].flatMap(topic => match(topic) ?? [])).flatMap(hit => hit.phrases.map(phrase => ({ id: hit.id, phrase })));
  return own
    .filter(hit => !narrower.some(other => other.id !== hit.id && phraseCovers(other.phrase, hit.words)))
    .map(hit => hit.id);
}

function phraseCovers(phrase: ReadonlySet<number>, words: ReadonlySet<number>): boolean {
  return phrase.size > words.size && [...words].every(index => phrase.has(index));
}
