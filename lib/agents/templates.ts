import type { ProfessionalAgentCadence, ProfessionalAgentKind, ProfessionalAgentOutput } from "@/lib/domain/types";

export interface ProfessionalAgentTemplate {
  id: string;
  kind: ProfessionalAgentKind;
  title: string;
  description: string;
  instruction: string;
  cadence: ProfessionalAgentCadence;
  outputFormat: ProfessionalAgentOutput;
  topics: string[];
  commercial: boolean;
  sponsorName: string | null;
}

export const CARDIOLOGY_AGENT_TEMPLATES: readonly ProfessionalAgentTemplate[] = [
  {
    id: "guideline-delta",
    kind: "guideline_delta",
    title: "Что изменилось в рекомендациях",
    description: "Следить за выбранными рекомендациями и возвращать только изменения, которые могут повлиять на практику.",
    instruction: "Сравнивай новые версии рекомендаций с предыдущими. Показывай только изменившиеся формулировки, пороги, классы рекомендаций и алгоритмы. Всегда давай ссылку на первоисточник и отделяй факт изменения от интерпретации.",
    cadence: "event",
    outputFormat: "delta",
    topics: ["Кардиология"],
    commercial: false,
    sponsorName: null,
  },
  {
    id: "research-watch",
    kind: "research_watch",
    title: "Новые данные по терапии",
    description: "Собирать новые исследования по выбранной теме и раскладывать их по уровню доказательности.",
    instruction: "Следи за новыми исследованиями по выбранной теме. Отделяй RCT, метаанализы, наблюдательные данные и экспертные материалы. Показывай дизайн, популяцию, конечные точки, ограничения и применимость к практике.",
    cadence: "weekly",
    outputFormat: "brief",
    topics: ["Сердечная недостаточность", "Дислипидемия и профилактика"],
    commercial: false,
    sponsorName: null,
  },
  {
    id: "practice-brief",
    kind: "practice_brief",
    title: "Практика по теме",
    description: "Собрать короткий профессиональный разбор по выбранному вопросу из разрешённых источников.",
    instruction: "Собирай по выбранной теме только профессионально релевантные материалы. Возвращай краткое резюме: что известно, где есть выбор, какие данные меняют следующий шаг и что нужно проверить в первоисточнике.",
    cadence: "manual",
    outputFormat: "brief",
    topics: ["Артериальная гипертензия"],
    commercial: false,
    sponsorName: null,
  },
  {
    id: "learning-plan",
    kind: "learning",
    title: "Обучение",
    description: "Собирать обучение только из тех обществ и платформ, которые выбрал врач.",
    instruction: "Собирай новые образовательные материалы только из выбранных мной источников. Для каждого материала показывай формат, тему, автора или организатора, дату при наличии и ссылку на исходную страницу. Не копируй закрытый материал внутрь продукта.",
    cadence: "weekly",
    outputFormat: "learning_plan",
    topics: ["Кардиология"],
    commercial: false,
    sponsorName: null,
  },
  {
    id: "events-watch",
    kind: "events",
    title: "События",
    description: "Отслеживать выбранные конференции, вебинары и профессиональные события без общего календарного шума.",
    instruction: "Следи за событиями по выбранным темам и источникам. Показывай только новые или изменившиеся события, дату, формат, организатора, условия участия и ссылку на страницу организатора.",
    cadence: "weekly",
    outputFormat: "watchlist",
    topics: ["Кардиология"],
    commercial: false,
    sponsorName: null,
  },
  {
    id: "source-watch",
    kind: "source_watch",
    title: "Источник под наблюдением",
    description: "Подписаться на один профессиональный источник и получать только значимые обновления.",
    instruction: "Отслеживай изменения только в выбранном источнике. Не добавляй внешние материалы без отдельного запроса. Показывай, что именно появилось или изменилось и почему это может быть релевантно выбранным темам.",
    cadence: "event",
    outputFormat: "delta",
    topics: ["Кардиология"],
    commercial: false,
    sponsorName: null,
  },
  {
    id: "partner-channel",
    kind: "partner_channel",
    title: "Партнёрский HCP-канал",
    description: "Отдельно подключить материалы выбранного партнёра. Партнёрский контент не смешивается с независимой выдачей.",
    instruction: "Показывай только материалы из явно подключённого партнёрского канала. Всегда сохраняй маркировку партнёра и источник. Не переносить утверждения из партнёрского корпуса в независимый медицинский вывод.",
    cadence: "weekly",
    outputFormat: "watchlist",
    topics: ["Кардиология"],
    commercial: true,
    sponsorName: "Синтетический партнёр",
  },
] as const;
