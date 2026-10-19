import type { ContentKind, ContentObject, Source, SpecialtyId } from "@/lib/domain/types";

interface EditorialBlueprint {
  kind: Extract<ContentKind, "guideline" | "article" | "video" | "clinical">;
  title: (topic: string) => string;
  summary: (topic: string) => string;
  tags: readonly string[];
}

const FALLBACK_TOPICS: Record<SpecialtyId, readonly string[]> = {
  cardiology: [
    "Артериальная гипертензия",
    "Ишемическая болезнь сердца",
    "Сердечная недостаточность",
    "Фибрилляция предсердий",
    "Нарушения ритма",
    "Клапанные пороки сердца",
    "Кардиомиопатии",
    "Дислипидемия и профилактика",
    "Кардиоваскулярная визуализация",
    "Интервенционная кардиология",
  ],
  oncology: [
    "Рак молочной железы",
    "Рак лёгкого",
    "Колоректальный рак",
    "Рак предстательной железы",
    "Рак шейки матки",
    "Рак желудка",
    "Рак мочевого пузыря",
    "Меланома",
    "Поддерживающая терапия",
    "Иммунотерапия и биомаркеры",
  ],
};

const BLUEPRINTS: readonly EditorialBlueprint[] = [
  {
    kind: "guideline",
    title: topic => `${topic}: что проверить в актуальных рекомендациях`,
    summary: topic => `Навигационный разбор по теме «${topic}»: какие разделы рекомендаций стоит сверить перед принятием решения, где обычно меняются определения, стратификация риска и последовательность действий.`,
    tags: ["рекомендации", "обновление"],
  },
  {
    kind: "clinical",
    title: topic => `${topic}: приём за 12 минут — первый клинический чек`,
    summary: topic => `Короткий рабочий сценарий по теме «${topic}»: уточнить контекст, проверить ключевые данные, отделить срочные ситуации от плановых и зафиксировать, какой вопрос требует первоисточника.`,
    tags: ["приём", "чек-лист"],
  },
  {
    kind: "article",
    title: topic => `${topic}: что нового в доказательной базе`,
    summary: topic => `Редакционный обзор новых исследований по теме «${topic}». Фокус — не пересказ абстрактных новостей, а то, какие результаты потенциально меняют привычную клиническую логику и что ещё рано переносить в практику.`,
    tags: ["исследования", "evidence"],
  },
  {
    kind: "clinical",
    title: topic => `${topic}: красные флаги и точки эскалации`,
    summary: topic => `Практическая карточка по теме «${topic}»: признаки, при которых стандартный маршрут перестаёт быть достаточным и требуется ускоренная диагностика, консультация смежного специалиста или пересмотр тактики.`,
    tags: ["красные флаги", "маршрутизация"],
  },
  {
    kind: "guideline",
    title: topic => `${topic}: маршрут пациента от первого вопроса до следующего шага`,
    summary: topic => `Структурированный маршрут по теме «${topic}»: исходный вопрос, обязательные уточнения, диагностический этап, контрольные точки и условия перехода к следующему клиническому действию.`,
    tags: ["алгоритм", "маршрут"],
  },
  {
    kind: "article",
    title: topic => `${topic}: где рекомендации оставляют пространство для решения врача`,
    summary: topic => `Разбор серых зон по теме «${topic}»: ситуации, где несколько допустимых стратегий зависят от контекста, предпочтений пациента, сопутствующих состояний и качества доступных доказательств.`,
    tags: ["неопределённость", "decision making"],
  },
  {
    kind: "video",
    title: topic => `${topic}: 7-минутный разбор клинической логики`,
    summary: topic => `Сценарий короткого образовательного разбора по теме «${topic}»: от формулировки клинической задачи до выбора данных, которые действительно меняют решение. Без попытки заменить первоисточник.`,
    tags: ["видео", "разбор"],
  },
  {
    kind: "clinical",
    title: topic => `${topic} и коморбидность: что меняется в тактике`,
    summary: topic => `Карточка о том, как сопутствующие состояния могут менять приоритеты при теме «${topic}»: переносимость вмешательств, лекарственные взаимодействия, риски и необходимость совместного решения со смежными специалистами.`,
    tags: ["коморбидность", "тактика"],
  },
  {
    kind: "article",
    title: topic => `${topic}: какие данные действительно меняют решение`,
    summary: topic => `Фокусированный обзор по теме «${topic}»: отделяем показатели, которые влияют на выбор тактики, от данных, которые полезны для описания состояния, но редко меняют следующий шаг сами по себе.`,
    tags: ["данные", "решение"],
  },
  {
    kind: "clinical",
    title: topic => `${topic}: контроль после старта или изменения терапии`,
    summary: topic => `Рабочая памятка по теме «${topic}»: что оценивать после изменения тактики, какие сигналы требуют раннего контакта и какие вопросы стоит подготовить к следующему визиту.`,
    tags: ["наблюдение", "контроль"],
  },
  {
    kind: "article",
    title: topic => `${topic}: диагностический путь без лишних шагов`,
    summary: topic => `Редакционная схема по теме «${topic}»: как двигаться от клинической вероятности к подтверждению диагноза и не превращать обследование в последовательность тестов без понятного влияния на решение.`,
    tags: ["диагностика", "эффективность"],
  },
  {
    kind: "guideline",
    title: topic => `${topic}: когда достаточно амбулаторного маршрута, а когда нужна эскалация`,
    summary: topic => `Навигационная карточка по теме «${topic}»: границы рутинного наблюдения, основания для ускоренного дообследования и ситуации, в которых нужен другой уровень помощи.`,
    tags: ["эскалация", "маршрут"],
  },
  {
    kind: "clinical",
    title: topic => `${topic}: безопасность терапии — быстрый контроль`,
    summary: topic => `Чек-лист безопасности по теме «${topic}»: до начала или изменения терапии проверить противопоказания, взаимодействия, исходные риски и понятный план наблюдения.`,
    tags: ["безопасность", "терапия"],
  },
  {
    kind: "article",
    title: topic => `${topic}: роль биомаркеров и измеримых признаков`,
    summary: topic => `Обзор по теме «${topic}» о том, какие биомаркеры, шкалы и измеримые признаки могут уточнять риск или выбор тактики, а какие требуют осторожной интерпретации вне исходной популяции исследования.`,
    tags: ["биомаркеры", "стратификация"],
  },
  {
    kind: "video",
    title: topic => `${topic}: мини-консилиум — три разных угла на одну задачу`,
    summary: topic => `Сценарий экспертного разбора по теме «${topic}»: один и тот же случай рассматривается через призму диагностики, лечения и долгосрочного наблюдения, чтобы явно показать точки согласия и разногласия.`,
    tags: ["консилиум", "обучение"],
  },
  {
    kind: "clinical",
    title: topic => `${topic}: чек-лист перед завершением приёма`,
    summary: topic => `Финальная проверка по теме «${topic}»: рабочий диагноз или вопрос, следующий шаг, критерии ухудшения, контрольный срок и то, что пациент должен понять до завершения визита.`,
    tags: ["чек-лист", "приём"],
  },
  {
    kind: "article",
    title: topic => `${topic}: исследования 2026 года, за которыми стоит следить`,
    summary: topic => `Редакционный слот по теме «${topic}» для новых исследований 2026 года: приоритет получают работы с потенциальным влиянием на тактику, исходы или организацию помощи; окончательные выводы требуют проверки первоисточника.`,
    tags: ["2026", "исследования"],
  },
  {
    kind: "clinical",
    title: topic => `${topic}: что чаще всего остаётся за рамками первого решения`,
    summary: topic => `Практический разбор по теме «${topic}»: вопросы приверженности, переносимости, наблюдения, сопутствующих состояний и организационных ограничений, которые способны изменить результат уже после выбора основной тактики.`,
    tags: ["наблюдение", "практика"],
  },
  {
    kind: "guideline",
    title: topic => `${topic}: сверка решения с рекомендациями`,
    summary: topic => `Шаблон контрольной сверки по теме «${topic}»: соответствует ли решение популяции и условиям рекомендаций, какие допущения сделаны и где требуется индивидуализация вместо механического следования алгоритму.`,
    tags: ["рекомендации", "контроль решения"],
  },
  {
    kind: "article",
    title: topic => `${topic}: пять вопросов, которые стоит задать перед изменением тактики`,
    summary: topic => `Короткая рамка по теме «${topic}»: что именно изменилось, насколько надёжны данные, применимы ли они к конкретной ситуации, каков ожидаемый выигрыш и какие новые риски появляются вместе с решением.`,
    tags: ["решение", "вопросы"],
  },
] as const;

if (BLUEPRINTS.length !== 20) throw new Error("Hardcoded topic pack must contain exactly 20 editorial units");

function normalizeTopicKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function contentType(kind: EditorialBlueprint["kind"]): string {
  if (kind === "guideline") return "Редакционный разбор рекомендаций";
  if (kind === "clinical") return "Клиническая карточка";
  if (kind === "video") return "Образовательный разбор";
  return "Редакционный обзор";
}

export function hardcodedEditorialSource(specialty: SpecialtyId): Source {
  return {
    id: `hardcoded-editorial-${specialty}`,
    specialty,
    name: "Редакционный прототип",
    type: "Редакционный черновик",
    publisher: "Kardio",
    url: null,
    trustStatus: "requires_review",
    commercialStatus: "non_commercial",
    metadataCompleteness: 100,
    notes: "Hardcoded prototype copy. Not source-validated; requires editorial and clinical review before external publication.",
    lastCheckedAt: null,
  };
}

export function topicLabelsForHardcodedExpansion(
  specialty: SpecialtyId,
  existingContent: readonly ContentObject[],
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  const add = (raw: string | null | undefined) => {
    const label = raw?.trim();
    if (!label) return;
    const key = normalizeTopicKey(label);
    if (!key || seen.has(key)) return;
    seen.add(key);
    labels.push(label);
  };

  for (const item of existingContent) add(item.topics.at(-1));
  for (const topic of FALLBACK_TOPICS[specialty]) add(topic);
  return labels;
}

export function hardcodedTopicContent(
  specialty: SpecialtyId,
  existingContent: readonly ContentObject[] = [],
): ContentObject[] {
  const source = hardcodedEditorialSource(specialty);
  const topics = topicLabelsForHardcodedExpansion(specialty, existingContent);

  return topics.flatMap(topic => {
    const topicHash = stableHash(`${specialty}:${normalizeTopicKey(topic)}`);
    return BLUEPRINTS.map((blueprint, index): ContentObject => ({
      id: `hardcoded-${specialty}-${topicHash}-${String(index + 1).padStart(2, "0")}`,
      specialty,
      kind: blueprint.kind,
      type: contentType(blueprint.kind),
      title: blueprint.title(topic),
      summary: blueprint.summary(topic),
      sourceId: source.id,
      source,
      canonicalUrl: null,
      publicationDate: null,
      publicationYear: null,
      updatedAt: null,
      lastCheckedAt: null,
      language: "ru",
      topics: [topic],
      tags: [topic, ...blueprint.tags, "hardcoded-copy"],
      currentness: "review",
      requiresReview: true,
      freshness: "prototype_copy",
      version: null,
      parentId: null,
      supersedesId: null,
      supersededById: null,
      trustLayer: "user-added",
      editorialStatus: "prototype_hardcoded",
      rightsStatus: "not_applicable",
      priority: 1,
      author: null,
      provenance: {
        type: "hardcoded_editorial_seed",
        asset: null,
        location: "lib/demo/hardcoded-topic-content.ts",
        notes: "Prototype text only. Not source-validated. Requires editorial and clinician review before publication.",
      },
      asset: null,
    }));
  });
}

export function withHardcodedTopicContent(
  specialty: SpecialtyId,
  existingContent: readonly ContentObject[],
): ContentObject[] {
  const existingIds = new Set(existingContent.map(item => item.id));
  const additions = hardcodedTopicContent(specialty, existingContent).filter(item => !existingIds.has(item.id));
  return [...existingContent, ...additions];
}

export const HARD_CODED_UNITS_PER_TOPIC = BLUEPRINTS.length;
