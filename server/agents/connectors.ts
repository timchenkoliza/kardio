import type { ConnectorDescriptor, IntegrationMode } from "@/lib/agents/types";
import { DRUG_SNAPSHOT_RETRIEVED_AT } from "./snapshots/drug-changes";
import { EVENTS_SNAPSHOT_RETRIEVED_AT } from "./snapshots/events";
import { GUIDELINE_SNAPSHOT_RETRIEVED_AT } from "./snapshots/guideline-updates";

/**
 * Connector layer: access to external systems. Connectors are never shown as
 * product sections; tools use them and results keep their provenance.
 */
export const GOLDENSET_SNAPSHOT_AT = "2026-10-18T00:00:00.000Z";

function pubmedMode(): IntegrationMode {
  return process.env.PUBMED_DISABLED === "1" ? "UNAVAILABLE" : "LIVE";
}

function mediMode(): IntegrationMode {
  return process.env.MEDI_DISABLED === "1" || process.env.SOURCE_BROWSER === "off" ? "UNAVAILABLE" : "LIVE";
}

function openfdaMode(): IntegrationMode {
  return process.env.OPENFDA_DISABLED === "1" ? "UNAVAILABLE" : "LIVE";
}

export function connectorRegistry(): ConnectorDescriptor[] {
  return [
    { id: "catalog", name: "Каталог РКО и РКЖ", kind: "catalog", mode: "LIVE", dataOrigin: "catalog_snapshot", snapshotAt: GOLDENSET_SNAPSHOT_AT, description: "Канонический набор: рекомендации РКО, видеолекции разработчиков, новости РКО и РКЖ с версиями и статусом актуальности", limitations: "Импортированный снимок; права на полные тексты на проверке, поэтому доступны карточки и ссылки на первоисточник" },
    { id: "pubmed", name: "PubMed", kind: "literature", mode: pubmedMode(), dataOrigin: "runtime_api", snapshotAt: null, description: "Поиск публикаций через NCBI E-utilities во время запуска агента", limitations: "Только библиографические данные; выводы исследований агент не пересказывает без текста статьи" },
    { id: "journals", name: "Профессиональные журналы", kind: "literature", mode: pubmedMode(), dataOrigin: "runtime_api", snapshotAt: null, description: "NEJM, The Lancet, European Heart Journal, Circulation, РКЖ — через фильтр журналов PubMed", limitations: "Полные тексты и подписки издателей не подключены" },
    { id: "esc-guidelines", name: "Рекомендации ESC", kind: "guidelines", mode: "LIVE", dataOrigin: "curated_snapshot", snapshotAt: GUIDELINE_SNAPSHOT_RETRIEVED_AT, description: "Публикации рекомендаций ESC 2026 и согласительных документов с цитатами из источников", limitations: "Снимок обновляется редакцией; полный текст рекомендаций не загружен" },
    { id: "regulatory-news", name: "Регуляторные изменения", kind: "regulatory", mode: "LIVE", dataOrigin: "curated_snapshot", snapshotAt: DRUG_SNAPSHOT_RETRIEVED_AT, description: "Публичные сообщения о регистрациях, ограничениях и других лекарственных изменениях", limitations: "Это сигналы из публичных страниц, а не замена официальным реестрам. Регуляторный статус подтверждается только соответствующим первичным источником" },
    { id: "openfda-labels", name: "Инструкции FDA (openFDA)", kind: "drug_labels", mode: openfdaMode(), dataOrigin: "runtime_api", snapshotAt: null, description: "Разделы действующей инструкции препарата в США (Structured Product Labeling) через openFDA во время запроса", limitations: "Это инструкции FDA, а не инструкции, зарегистрированные в России. openFDA предупреждает, что данные не валидированы: решение сверяется с ГРЛС и первоисточником на DailyMed" },
    { id: "medi", name: "МЕДИ РУ (medi.ru)", kind: "professional_reference", mode: mediMode(), dataOrigin: "runtime_api", snapshotAt: null, description: "Российские инструкции по применению и копии клинических рекомендаций Минздрава для специалистов — читаются браузером во время запроса", limitations: "Вторичная публикация: официальный статус проверяется в ГРЛС и рубрикаторе. Поиск сайта закрыт для автоматического доступа (robots.txt), поэтому используются страницы МНН и каталоги рекомендаций; показываются только короткие цитаты со ссылкой" },
    { id: "cr-rubricator", name: "Рубрикатор клинических рекомендаций Минздрава", kind: "guidelines", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "cr.minzdrav.gov.ru — официальный статус клинических рекомендаций в России", limitations: "Программный доступ нестабилен и не подключён; продукт даёт переход в рубрикатор для проверки статуса" },
    { id: "grls", name: "ГРЛС Минздрава", kind: "regulatory", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "Государственный реестр лекарственных средств", limitations: "ГРЛС не подключён. Ссылка для ручной проверки не является доказательством, а сообщения СМИ/компаний не подтверждают официальный статус регистрации или инструкции в РФ" },
    { id: "events-listings", name: "Афиши профессиональных событий", kind: "events", mode: "LIVE", dataOrigin: "curated_snapshot", snapshotAt: EVENTS_SNAPSHOT_RETRIEVED_AT, description: "Конгрессы ESC и AHA со страниц организаторов", limitations: "Снимок афиш; мероприятия из агрегатора rnmo.ru скрыты — врачи отклонили этот источник; аккредитованные мероприятия НМО проверяйте на edu.rosminzdrav.ru" },
    { id: "nmo-portal", name: "Портал НМО", kind: "events", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "edu.rosminzdrav.ru — учёт баллов и запись на мероприятия", limitations: "Вход под вашей учётной записью не подключён" },
    { id: "rko-account", name: "Личный кабинет РКО", kind: "society", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "Регистрация на мероприятия РКО от вашего имени", limitations: "Авторизация под вашей учётной записью не подключена; агент готовит переход к регистрации" },
    { id: "telegram", name: "Telegram-каналы", kind: "messenger", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "Мониторинг профессиональных каналов", limitations: "Живое чтение каналов не подключено; есть только офлайн-разбор экспортов для редакции" },
    { id: "web", name: "Открытый веб", kind: "web", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "Поиск по открытому интернету", limitations: "Не подключён: агенты работают только с доверенными источниками" },
    { id: "user-uploads", name: "Ваши документы", kind: "user_documents", mode: "LIVE", dataOrigin: "user_content", snapshotAt: null, description: "Файлы, ссылки и заметки, которые вы добавили сами", limitations: "TXT, MD, CSV, HTML и DOCX индексируются; для PDF сохраняются только метаданные" },
    { id: "calendar-ics", name: "Календарь: файл .ics", kind: "calendar", mode: "LIVE", dataOrigin: "none", snapshotAt: null, description: "Готовит файл события с напоминаниями для любого календаря", limitations: "Файл скачивается после вашего подтверждения; импорт в календарь — на вашей стороне" },
    { id: "calendar-direct", name: "Запись в ваш календарь", kind: "calendar", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "Прямая запись в Яндекс, Google или Outlook Календарь", limitations: "Не подключено" },
    { id: "email", name: "Почта", kind: "email", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "Отправка писем от вашего имени", limitations: "Не подключено: агент готовит черновик, который открывается в вашей почтовой программе" },
    { id: "partner-channel", name: "Партнёрские материалы", kind: "partner", mode: "MOCK", dataOrigin: "synthetic_fixture", snapshotAt: null, description: "Материалы партнёров с раскрытием спонсора", limitations: "Синтетические примеры форматов; реальных партнёрских договоров нет" },
  ];
}

export function connectorById(id: string): ConnectorDescriptor | undefined {
  return connectorRegistry().find(connector => connector.id === id);
}

export function connectorModes(ids: readonly string[]): IntegrationMode[] {
  return ids.map(id => connectorById(id)?.mode ?? "UNAVAILABLE");
}
