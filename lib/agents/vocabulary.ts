import type { SpecialtyId } from "@/lib/domain/types";
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
}

export const TOPICS: Record<SpecialtyId, readonly TopicOption[]> = {
  cardiology: [
    { id: "ihd", label: "ИБС", catalogTopics: ["stable_ischemic_heart_disease", "stemi", "nstemi"], pubmed: "\"coronary artery disease\"[tiab] OR \"myocardial infarction\"[tiab]", keywords: ["ибс", "ишем", "коронар", "инфаркт", "окс", "стенокард"] },
    { id: "hf", label: "ХСН", catalogTopics: [], pubmed: "\"heart failure\"[tiab]", keywords: ["хсн", "сердечн недостат", "сердечная недостаточность", "heart failure", "hfpef", "hfref"] },
    { id: "ah", label: "Артериальная гипертензия", catalogTopics: ["arterial_hypertension"], pubmed: "hypertension[tiab]", keywords: ["аг", "гипертенз", "гипертони", "давлен"] },
    { id: "af", label: "Фибрилляция предсердий", catalogTopics: ["atrial_fibrillation"], pubmed: "\"atrial fibrillation\"[tiab]", keywords: ["фп", "фибрилляц", "трепетан", "антикоагул"] },
    { id: "lipids", label: "Липидология", catalogTopics: [], pubmed: "dyslipidemia[tiab] OR \"lipoprotein(a)\"[tiab] OR LDL[tiab]", keywords: ["липид", "холестер", "лпнп", "статин", "дислипид"] },
    { id: "arrhythmia", label: "Нарушения ритма", catalogTopics: ["ventricular_arrhythmias", "bradyarrhythmias", "supraventricular_tachycardia"], pubmed: "arrhythmia[tiab] OR tachycardia[tiab]", keywords: ["аритм", "тахикард", "брадикард", "ритм"] },
    { id: "valves", label: "Клапанные пороки", catalogTopics: ["aortic_regurgitation"], pubmed: "\"valvular heart disease\"[tiab] OR \"aortic stenosis\"[tiab] OR regurgitation[tiab]", keywords: ["клапан", "порок", "аортальн", "митральн", "трикуспид"] },
    { id: "cardiomyopathy", label: "Кардиомиопатии", catalogTopics: ["hypertrophic_cardiomyopathy", "myocarditis"], pubmed: "cardiomyopathy[tiab] OR myocarditis[tiab]", keywords: ["кардиомиопат", "гкмп", "миокардит", "амилоид"] },
    { id: "ph", label: "Лёгочная гипертензия", catalogTopics: ["pulmonary_hypertension"], pubmed: "\"pulmonary hypertension\"[tiab]", keywords: ["легочн гипертенз", "лёгочн", "лаг", "хтэлг"] },
    { id: "metabolic", label: "Метаболический синдром", catalogTopics: ["metabolic_syndrome"], pubmed: "\"metabolic syndrome\"[tiab] OR obesity[tiab]", keywords: ["метаболич", "ожирен", "кардиометабол"] },
    { id: "cardiorenal", label: "Кардиоренальные связи", catalogTopics: [], pubmed: "\"chronic kidney disease\"[tiab] AND cardiovascular[tiab]", keywords: ["почк", "хбп", "кардиоренал", "нефро"] },
    { id: "endocarditis", label: "Инфекционный эндокардит", catalogTopics: ["infective_endocarditis"], pubmed: "endocarditis[tiab]", keywords: ["эндокардит"] },
    { id: "prevention", label: "Профилактика", catalogTopics: ["prognosis_and_diagnostics", "treatment_strategies"], pubmed: "\"cardiovascular prevention\"[tiab] OR \"cardiovascular risk\"[tiab]", keywords: ["профилакт", "score2", "суммарн риск", "сердечно-сосудист риск"] },
    { id: "ai", label: "ИИ в кардиологии", catalogTopics: ["ai_in_cardiology"], pubmed: "\"artificial intelligence\"[tiab] AND cardiology[tiab]", keywords: ["ии", "искусственн интеллект", "нейросет"] },
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
  /** PubMed journal filter applied when this source is trusted. */
  pubmedJournal: string | null;
}

export const SOURCE_OPTIONS: readonly SourceOption[] = [
  { id: "rko", label: "РКО", matches: ["src-rko", "src-rko-guidelines", "src-rko-video", "src-rko-esc", "rnmo-rko"], pubmedJournal: null },
  { id: "rkj", label: "Российский кардиологический журнал", matches: ["src-rkj"], pubmedJournal: "Russ J Cardiol" },
  { id: "esc", label: "ESC", matches: ["esc-guidelines", "esc-congresses", "src-rko-esc"], pubmedJournal: "Eur Heart J" },
  { id: "pubmed", label: "PubMed", matches: ["pubmed"], pubmedJournal: null },
  { id: "nejm", label: "NEJM", matches: ["journal-nejm"], pubmedJournal: "N Engl J Med" },
  { id: "lancet", label: "The Lancet", matches: ["journal-lancet"], pubmedJournal: "Lancet" },
  { id: "aha", label: "AHA / ACC", matches: ["aha-meetings"], pubmedJournal: "Circulation" },
  { id: "regulators", label: "Регуляторы (Минздрав, FDA)", matches: ["regulatory-news"], pubmedJournal: null },
  { id: "nmo", label: "Портал НМО", matches: ["rnmo-rko"], pubmedJournal: null },
  { id: "telegram", label: "Telegram-каналы", matches: ["telegram"], pubmedJournal: null },
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
  { id: "home", label: "На главной", available: true, note: "Результаты появляются в карточке агента" },
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

export function topicsFor(specialty: SpecialtyId): readonly TopicOption[] {
  return TOPICS[specialty];
}

export function topicById(specialty: SpecialtyId, id: string): TopicOption | undefined {
  return TOPICS[specialty].find(topic => topic.id === id);
}

export function topicLabels(specialty: SpecialtyId, ids: readonly string[]): string[] {
  return ids.map(id => topicById(specialty, id)?.label).filter((label): label is string => Boolean(label));
}

export function sourceById(id: string): SourceOption | undefined {
  return SOURCE_OPTIONS.find(source => source.id === id);
}

export function sourceLabels(ids: readonly string[]): string[] {
  return ids.map(id => sourceById(id)?.label).filter((label): label is string => Boolean(label));
}

/** Map arbitrary Russian/English text to topic ids using keyword stems. */
export function topicsMentioned(specialty: SpecialtyId, text: string): string[] {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  return TOPICS[specialty]
    .filter(topic => topic.keywords.some(keyword => {
      const parts = keyword.split(" ");
      return parts.every(part => {
        if (part.length <= 3) return new RegExp(`(^|[^\\p{L}])${part}([^\\p{L}]|$)`, "u").test(normalized);
        return normalized.includes(part);
      });
    }))
    .map(topic => topic.id);
}
