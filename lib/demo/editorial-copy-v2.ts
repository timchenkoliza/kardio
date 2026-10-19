import type { ContentKind, SpecialtyId } from "@/lib/domain/types";

export interface EditorialCopyBlueprint {
  kind: Extract<ContentKind, "guideline" | "article" | "video" | "clinical">;
  title: (topic: string) => string;
  summary: (topic: string) => string;
  tags: readonly string[];
}

const short = (topic: string, tail: string) => `${topic} — ${tail}`;

/**
 * Copy rules adapted from the product ToV:
 * - fact first, no unsupported evaluation;
 * - direct, living Russian without implementation jargon;
 * - one clear clinical job per card;
 * - concise titles and short leads;
 * - no claim that prototype copy is a clinical recommendation.
 */
export const EDITORIAL_COPY_V2: readonly EditorialCopyBlueprint[] = [
  {
    kind: "guideline",
    title: topic => short(topic, "что изменилось"),
    summary: topic => `Короткая сверка по теме «${topic}»: новые формулировки, пороги и развилки, которые стоит проверить в актуальной версии рекомендаций перед решением.`,
    tags: ["рекомендации", "обновление"],
  },
  {
    kind: "clinical",
    title: topic => short(topic, "что проверить на приёме"),
    summary: topic => `Что собрать за первые минуты по теме «${topic}»: жалобы, контекст, ключевые показатели и признаки, которые меняют следующий шаг.`,
    tags: ["приём", "чек-лист"],
  },
  {
    kind: "article",
    title: topic => short(topic, "когда менять тактику"),
    summary: topic => `Какие новые данные по теме «${topic}» действительно могут изменить привычную тактику, а какие пока требуют осторожной интерпретации.`,
    tags: ["исследования", "тактика"],
  },
  {
    kind: "clinical",
    title: topic => short(topic, "красные флаги"),
    summary: topic => `Признаки по теме «${topic}», при которых плановый маршрут стоит пересмотреть: срочность, дообследование, другой уровень помощи или консультация коллег.`,
    tags: ["красные флаги", "маршрутизация"],
  },
  {
    kind: "guideline",
    title: topic => short(topic, "следующий шаг"),
    summary: topic => `Маршрут по теме «${topic}»: что уже известно, чего не хватает для решения и какое действие логично проверить следующим по рекомендациям.`,
    tags: ["алгоритм", "маршрут"],
  },
  {
    kind: "article",
    title: topic => short(topic, "где есть выбор"),
    summary: topic => `Разбираем ситуации по теме «${topic}», где рекомендации допускают несколько вариантов и решение зависит от риска, сопутствующих состояний и предпочтений пациента.`,
    tags: ["неопределённость", "решение"],
  },
  {
    kind: "video",
    title: topic => short(topic, "разбор за 7 минут"),
    summary: topic => `Один клинический вопрос по теме «${topic}» — от исходных данных до решения. Только логика выбора и точки, где нужен первоисточник.`,
    tags: ["видео", "разбор"],
  },
  {
    kind: "clinical",
    title: topic => short(topic, "что меняет коморбидность"),
    summary: topic => `Какие сопутствующие состояния при теме «${topic}» могут изменить выбор терапии, переносимость, риски или необходимость совместного решения со смежным специалистом.`,
    tags: ["коморбидность", "тактика"],
  },
  {
    kind: "article",
    title: topic => short(topic, "данные для решения"),
    summary: topic => `Показатели по теме «${topic}», которые реально влияют на выбор тактики. Отдельно — данные, которые описывают состояние, но сами по себе редко меняют следующий шаг.`,
    tags: ["данные", "решение"],
  },
  {
    kind: "clinical",
    title: topic => short(topic, "контроль после изменения терапии"),
    summary: topic => `Что проверить после старта или изменения лечения по теме «${topic}»: эффект, переносимость, новые риски и срок следующего контроля.`,
    tags: ["наблюдение", "контроль"],
  },
  {
    kind: "article",
    title: topic => short(topic, "диагностика без лишних шагов"),
    summary: topic => `Как двигаться по теме «${topic}» от клинической вероятности к подтверждению диагноза и не добавлять исследования, которые не меняют решение.`,
    tags: ["диагностика", "эффективность"],
  },
  {
    kind: "guideline",
    title: topic => short(topic, "когда нужна эскалация"),
    summary: topic => `Где по теме «${topic}» заканчивается рутинное наблюдение и появляются основания для ускоренного дообследования, госпитализации или другого уровня помощи.`,
    tags: ["эскалация", "маршрут"],
  },
  {
    kind: "clinical",
    title: topic => short(topic, "безопасность терапии"),
    summary: topic => `Перед назначением или изменением лечения по теме «${topic}» стоит проверить противопоказания, взаимодействия, исходные риски и план наблюдения.`,
    tags: ["безопасность", "терапия"],
  },
  {
    kind: "article",
    title: topic => short(topic, "биомаркеры и шкалы"),
    summary: topic => `Какие биомаркеры, шкалы и измеримые признаки по теме «${topic}» помогают уточнить риск или тактику, а где результат нельзя переносить вне исходной популяции.`,
    tags: ["биомаркеры", "стратификация"],
  },
  {
    kind: "video",
    title: topic => short(topic, "3 взгляда на один кейс"),
    summary: topic => `Диагностика, лечение и наблюдение по теме «${topic}» в одном разборе. Видно, где специалисты сходятся и какие вопросы остаются открытыми.`,
    tags: ["консилиум", "обучение"],
  },
  {
    kind: "clinical",
    title: topic => short(topic, "перед завершением приёма"),
    summary: topic => `Финальная проверка по теме «${topic}»: рабочий вывод, следующий шаг, критерии ухудшения, срок контроля и что пациент должен понимать после визита.`,
    tags: ["чек-лист", "приём"],
  },
  {
    kind: "article",
    title: topic => short(topic, "исследования 2026"),
    summary: topic => `Работы по теме «${topic}», за которыми стоит следить в 2026 году: фокус на данных, способных изменить тактику, исходы или организацию помощи.`,
    tags: ["2026", "исследования"],
  },
  {
    kind: "clinical",
    title: topic => short(topic, "что часто упускают"),
    summary: topic => `После основного решения по теме «${topic}» результат могут изменить приверженность, переносимость, коморбидность и доступность наблюдения. Эти точки лучше проверить отдельно.`,
    tags: ["наблюдение", "практика"],
  },
  {
    kind: "guideline",
    title: topic => short(topic, "сверка с рекомендациями"),
    summary: topic => `Проверяем решение по теме «${topic}»: подходит ли рекомендация этой клинической ситуации, какие допущения сделаны и где нужна индивидуализация.`,
    tags: ["рекомендации", "контроль решения"],
  },
  {
    kind: "article",
    title: topic => short(topic, "5 вопросов перед решением"),
    summary: topic => `Что изменилось, насколько надёжны данные, применимы ли они к этой ситуации, какой ожидается выигрыш и какие новые риски появляются по теме «${topic}».`,
    tags: ["решение", "вопросы"],
  },
] as const;

if (EDITORIAL_COPY_V2.length !== 20) {
  throw new Error("Editorial copy pack must contain exactly 20 units");
}

export function editorialCopySourceLabel(specialty: SpecialtyId): string {
  return specialty === "cardiology" ? "Кардиология · редакционный прототип" : "Онкология · редакционный прототип";
}
