export type PbzCardiologyClusterId =
  | "hypertension"
  | "rhythm"
  | "lipids"
  | "anticoagulation"
  | "ischemia"
  | "valves"
  | "endocarditis"
  | "heart_failure";

export interface PbzCardiologyCluster {
  id: PbzCardiologyClusterId;
  label: string;
  searchQuery: string;
  patterns: readonly RegExp[];
}

export const pbzCardiologyClusters: readonly PbzCardiologyCluster[] = [
  { id: "hypertension", label: "Артериальная гипертензия", searchQuery: "артериальная гипертензия", patterns: [/гипертенз/u, /гипертони/u, /гипертоническ/u] },
  { id: "rhythm", label: "Ритм и ФП", searchQuery: "фибрилляция предсердий", patterns: [/фибрилляц/u, /(?<![\p{L}\p{N}_])фп(?![\p{L}\p{N}_])/u, /аритм/u, /кардиограмм/u, /(?<![\p{L}\p{N}_])экг(?![\p{L}\p{N}_])/u, /пульс/u] },
  { id: "lipids", label: "Липиды", searchQuery: "дислипидемия статины", patterns: [/розувастат/u, /аторвастат/u, /статин/u, /холестерин/u, /гиперлипид/u, /атеросклер/u] },
  { id: "anticoagulation", label: "Антикоагуляция", searchQuery: "антикоагулянтная терапия", patterns: [/антикоаг/u, /апиксаб/u, /риварокс/u, /варфар/u, /дабигат/u, /тромбоз/u, /тромбоэмбол/u, /has.?bled/u] },
  { id: "ischemia", label: "ИБС и ОКС", searchQuery: "ишемическая болезнь сердца ОКС", patterns: [/инфаркт/u, /ишем/u, /коронар/u, /(?<![\p{L}\p{N}_])окс(?![\p{L}\p{N}_])/u, /стент/u, /тропонин/u] },
  { id: "valves", label: "Клапаны и аорта", searchQuery: "клапанные заболевания аорта", patterns: [/аорт/u, /митрал/u, /клапан/u, /вальвул/u] },
  { id: "endocarditis", label: "Инфекционный эндокардит", searchQuery: "инфекционный эндокардит", patterns: [/эндокардит/u] },
  { id: "heart_failure", label: "Сердечная недостаточность", searchQuery: "сердечная недостаточность", patterns: [/(?<![\p{L}\p{N}_])хсн(?![\p{L}\p{N}_])/u, /сердечн.{0,18}недостат/u, /(?<![\p{L}\p{N}_])зсн(?![\p{L}\p{N}_])/u] },
] as const;

const patientLevelMarkers = [
  /пациент(?:ка|у|ом|а|ы|ов)?(?![\p{L}\p{N}_])/u,
  /больн(?:ой|ая|ого|ой|ому|ые)(?![\p{L}\p{N}_])/u,
  /полис\s*омс/u,
  /снилс/u,
  /дата рождения/u,
  /номер карты/u,
  /медицинск.{0,12}карта/u,
  /\bmrn\b/u,
  /(?<![\p{L}\p{N}_])(?:мужчина|женщина)\s+\d{1,3}\s*(?:лет|год|года)(?![\p{L}\p{N}_])/u,
  /(?<![\p{L}\p{N}_])\d{1,3}\s*(?:лет|год|года)(?![\p{L}\p{N}_])/u,
  /(?<![\p{L}\p{N}_])ад\s*[-–:]?\s*\d{2,3}\s*[\\/]\s*\d{2,3}(?![\p{L}\p{N}_])/u,
  /(?<![\p{L}\p{N}_])чсс\s*[-–:]?\s*\d{2,3}(?![\p{L}\p{N}_])/u,
  /(?<![\p{L}\p{N}_])сатурац/u,
  /(?<![\p{L}\p{N}_])жалоб/u,
  /(?<![\p{L}\p{N}_])анамнез/u,
  /(?<![\p{L}\p{N}_])у меня(?![\p{L}\p{N}_])/u,
  /(?<![\p{L}\p{N}_])мне\s+\d{1,3}(?![\p{L}\p{N}_])/u,
] as const;

export function isSafePbzPersonalizationQuery(value: string): boolean {
  const query = value.trim().toLocaleLowerCase("ru-RU");
  if (!query || query.length > 180) return false;
  return !patientLevelMarkers.some((pattern) => pattern.test(query));
}

export function classifyPbzCardiologyQuery(value: string): PbzCardiologyClusterId[] {
  if (!isSafePbzPersonalizationQuery(value)) return [];
  const query = value.toLocaleLowerCase("ru-RU");
  return pbzCardiologyClusters
    .filter((cluster) => cluster.patterns.some((pattern) => pattern.test(query)))
    .map((cluster) => cluster.id);
}

export interface PbzHistorySignal {
  cluster: PbzCardiologyCluster;
  count: number;
}

export function summarizePbzCardiologyHistory(queries: readonly string[]): PbzHistorySignal[] {
  const counts = new Map<PbzCardiologyClusterId, number>();
  for (const query of queries) {
    for (const id of classifyPbzCardiologyQuery(query)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return pbzCardiologyClusters
    .map((cluster) => ({ cluster, count: counts.get(cluster.id) ?? 0 }))
    .filter((signal) => signal.count > 0)
    .sort((a, b) => b.count - a.count || pbzCardiologyClusters.findIndex((cluster) => cluster.id === a.cluster.id) - pbzCardiologyClusters.findIndex((cluster) => cluster.id === b.cluster.id));
}

// Demo fixture derived only from short professional cardiology queries in the provided PBZ export.
// Patient-level prompts and identifiers are deliberately excluded from the fixture and from personalization.
export const PBZ_DEMO_SAFE_QUERIES = [
  "Клинические рекомендации артериальной гипертензии",
  "Гипертонический криз классификация",
  "Розувастатин",
  "Взаимодействие аторвастатина и дапаглифлозина",
  "Антикоагулянтная терапия при ФП",
  "Взаимодействие апиксабана и амиодарона",
  "5 типов инфаркта",
  "Референсные значения тропонина",
  "Клинические рекомендации инфекционный эндокардит",
  "Пролапс митрального клапана",
  "Расшифровка ЭКГ",
] as const;

export const PBZ_DEMO_HISTORY_SIGNALS = summarizePbzCardiologyHistory(PBZ_DEMO_SAFE_QUERIES);
export const PBZ_DEMO_RESEARCH_TERMS = PBZ_DEMO_HISTORY_SIGNALS.slice(0, 5).map((signal) => signal.cluster.searchQuery);
