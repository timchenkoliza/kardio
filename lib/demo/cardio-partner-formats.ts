export type CardioPartnerFormatKind =
  | "rx_product_utility"
  | "rx_case_to_evidence"
  | "hcp_tool"
  | "disease_education"
  | "otc_hcp";

export interface CardioPartnerFormat {
  id: string;
  kind: CardioPartnerFormatKind;
  sponsor: string;
  brand: string | null;
  audience: "HCP";
  disclosure: string;
  eyebrow: string;
  title: string;
  summary: string;
  cta: string;
  legalMode: "prototype_only" | "unbranded_education";
}

/**
 * Synthetic demo inventory for product/business review.
 * No company, brand, active ingredient, indication, dose or efficacy claim is real.
 * RX examples are UI prototypes only and must not be treated as a legal basis for
 * online prescription-drug promotion in Russia.
 */
export const CARDIO_PARTNER_FORMATS: readonly CardioPartnerFormat[] = [
  {
    id: "partner-rx-utility",
    kind: "rx_product_utility",
    sponsor: "Альта Медика",
    brand: "Ардевиа RX · демо",
    audience: "HCP",
    disclosure: "Партнёрский формат · синтетический пример",
    eyebrow: "RX · рабочий формат",
    title: "От клинической задачи к инструкции",
    summary: "Место для одного зарегистрированного свойства препарата, короткого сценария применения и прямого перехода к инструкции и безопасности.",
    cta: "Посмотреть формат",
    legalMode: "prototype_only",
  },
  {
    id: "partner-rx-case",
    kind: "rx_case_to_evidence",
    sponsor: "Северин Биофарм",
    brand: "Тромелис RX · демо",
    audience: "HCP",
    disclosure: "Партнёрский формат · синтетический пример",
    eyebrow: "RX · клинический кейс",
    title: "ФП: кейс, развилка, доказательства",
    summary: "Нативный разбор клинической ситуации: исходные данные, точка выбора, evidence-блок и отдельный переход к информации о препарате.",
    cta: "Открыть кейс",
    legalMode: "prototype_only",
  },
  {
    id: "partner-hcp-tool",
    kind: "hcp_tool",
    sponsor: "Орбис Терапьютикс",
    brand: "Ритмора RX · демо",
    audience: "HCP",
    disclosure: "Партнёрский формат · синтетический пример",
    eyebrow: "Инструмент для врача",
    title: "Короткий гид по применению",
    summary: "Карточка-утилита для HCP: быстрый переход к инструкции, ограничениям, хранению, введению или другому практическому разделу без рекламного текста вокруг.",
    cta: "Открыть гид",
    legalMode: "prototype_only",
  },
  {
    id: "partner-disease-education",
    kind: "disease_education",
    sponsor: "Люмен Фарма",
    brand: null,
    audience: "HCP",
    disclosure: "При поддержке партнёра · без бренда препарата",
    eyebrow: "Кардиоренальный риск",
    title: "Когда заболевания усиливают друг друга",
    summary: "Disease-awareness формат: один клинический вопрос, взаимосвязь сердца и почек, диагностика и маршрутизация — без продуктового обещания.",
    cta: "Разобрать тему",
    legalMode: "unbranded_education",
  },
  {
    id: "partner-otc-hcp",
    kind: "otc_hcp",
    sponsor: "Веларис",
    brand: "Тензория OTC · демо",
    audience: "HCP",
    disclosure: "Партнёрский формат · синтетический пример",
    eyebrow: "OTC · коммуникация врачу",
    title: "Самоконтроль давления: разговор с пациентом",
    summary: "Формат для безрецептурного продукта: практическая памятка для разговора с пациентом, место бренда отделено от редакционного материала и помечено как реклама.",
    cta: "Посмотреть пример",
    legalMode: "prototype_only",
  },
] as const;
