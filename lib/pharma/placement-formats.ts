/**
 * Placement formats from the commercial offer «Лента для врачей», with one
 * synthetic example each, as a physician would see it in the feed.
 * Examples are format demonstrations: no real company, brand, product,
 * indication, dose or efficacy claim.
 */

export type PlacementFormatId = "article" | "useful" | "media" | "event" | "brand_page";

export interface PlacementFormat {
  id: PlacementFormatId;
  number: number;
  name: string;
  /** What the format is, as in the offer. */
  kinds: readonly string[];
  /** What the partner gets, as in the offer. */
  value: readonly string[];
  example: PlacementExample;
}

export type PlacementExample =
  | { type: "article"; variant: string; title: string; keyPoints: readonly string[]; meta: string; image: string; imageAlt: string }
  | { type: "useful"; variant: string; title: string; items: readonly string[]; actions: readonly string[]; metrics: readonly string[] }
  | { type: "media"; items: ReadonlyArray<{ variant: string; title: string; meta: string; image: string | null; imageAlt: string | null }> }
  | { type: "event"; variant: string; title: string; date: string; time: string; place: string; reminders: readonly string[]; registration: string }
  | { type: "brand_page"; company: string; about: string; sections: ReadonlyArray<{ title: string; text: string }> };

export const EXAMPLE_SPONSOR = "Люмен Фарма";
export const EXAMPLE_DISCLOSURE = "Партнёрский материал · пример формата";

export const PLACEMENT_FORMATS: readonly PlacementFormat[] = [
  {
    id: "article",
    number: 1,
    name: "Статья",
    kinds: ["Экспертный материал", "Интервью", "Разбор кейса", "Разбор исследования"],
    value: ["Привычный формат", "Коротко о главном: выводы и суммаризация в начале", "Закрепляет статус эксперта в профессиональной среде"],
    example: {
      type: "article",
      variant: "Интервью",
      title: "Маршрут пациента после острого коронарного синдрома: что обсуждать на первом визите",
      keyPoints: [
        "О чём: преемственность между стационаром и поликлиникой",
        "Для кого: кардиологи амбулаторного звена",
        "Что внутри: вопросы к эксперту и ссылки на рекомендации",
      ],
      meta: "Интервью с экспертом · 7 минут чтения",
      image: "/media/cardiology/coronary-angiography.webp",
      imageAlt: "Схема коронарографии",
    },
  },
  {
    id: "useful",
    number: 2,
    name: "Полезное",
    kinds: ["Чек-лист", "Инфографика", "Подборка", "Карточки", "Шпаргалка для практики"],
    value: ["Масштабирует охват через форматы, которые сохраняют и используют", "Интерес измеряется скачиваниями и просмотрами", "Образ надёжного помощника, а не просто рекламодателя"],
    example: {
      type: "useful",
      variant: "Чек-лист",
      title: "Измерение АД на приёме",
      items: [
        "5 минут покоя сидя перед измерением",
        "Манжета подобрана по окружности плеча, на уровне сердца",
        "Три измерения с интервалом 1–2 минуты",
        "На первом визите — на обеих руках",
      ],
      actions: ["Скачать PDF", "Сохранить"],
      metrics: ["Скачивания", "Сохранения", "Просмотры"],
    },
  },
  {
    id: "media",
    number: 3,
    name: "Медиа",
    kinds: ["Видео", "Подкаст", "UGC-контент"],
    value: ["Живые обзоры: наглядно показываем, как всё работает", "Как в привычных лентах — только про медицину", "Контент, который запоминается"],
    example: {
      type: "media",
      items: [
        { variant: "Видео", title: "Как читать ЭКГ при фибрилляции предсердий: разбор на примере", meta: "Видео · 6 мин", image: "/media/cardiology/ecg-atrial-fibrillation.webp", imageAlt: "ЭКГ при фибрилляции предсердий" },
        { variant: "Подкаст", title: "Кардиолог и нефролог: общий пациент", meta: "Подкаст · 24 мин", image: null, imageAlt: null },
        { variant: "UGC", title: "Врач рассказывает, как выстроил школу для пациентов с ХСН", meta: "Рассказ врача · 3 мин", image: "/media/cardiology/heart-four-chamber.webp", imageAlt: "Сердце в четырёхкамерной проекции" },
      ],
    },
  },
  {
    id: "event",
    number: 4,
    name: "Событие",
    kinds: ["Курс", "Конференция", "Вебинар"],
    value: ["Анонс там, где врач уже бывает", "Система напоминаний держит событие в фокусе", "Регистрация внутри сервиса — без лишних переходов"],
    example: {
      type: "event",
      variant: "Вебинар",
      title: "Резистентная артериальная гипертензия: разбор клинических случаев",
      date: "12 ноября",
      time: "19:00 МСК",
      place: "Онлайн",
      reminders: ["За день", "За час"],
      registration: "Зарегистрироваться",
    },
  },
  {
    id: "brand_page",
    number: 5,
    name: "Бренд-страница компании",
    kinds: ["Страница компании для врачей"],
    value: ["Все материалы партнёра в одном месте", "Контакты медицинского отдела и сообщения о нежелательных реакциях", "Подписка врача на обновления компании"],
    example: {
      type: "brand_page",
      company: EXAMPLE_SPONSOR,
      about: "Страница компании для специалистов здравоохранения",
      sections: [
        { title: "Материалы для врачей", text: "Статьи, чек-листы и видео компании" },
        { title: "События", text: "Ближайшие вебинары и курсы с регистрацией" },
        { title: "Медицинский отдел", text: "Вопрос медицинскому советнику" },
        { title: "Безопасность", text: "Сообщить о нежелательной реакции" },
      ],
    },
  },
];
