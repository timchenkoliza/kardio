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

export function connectorRegistry(): ConnectorDescriptor[] {
  return [
    { id: "catalog", name: "Каталог РКО и РКЖ", kind: "catalog", mode: "LIVE", dataOrigin: "catalog_snapshot", snapshotAt: GOLDENSET_SNAPSHOT_AT, description: "Канонический набор: рекомендации РКО, видеолекции разработчиков, новости РКО и РКЖ с версиями и статусом актуальности", limitations: "Импортированный снимок; права на полные тексты на проверке, поэтому доступны карточки и ссылки на первоисточник" },
    { id: "pubmed", name: "PubMed", kind: "literature", mode: pubmedMode(), dataOrigin: "runtime_api", snapshotAt: null, description: "Поиск публикаций через NCBI E-utilities во время запуска агента", limitations: "Только библиографические данные; выводы исследований агент не пересказывает без текста статьи" },
    { id: "journals", name: "Профессиональные журналы", kind: "literature", mode: pubmedMode(), dataOrigin: "runtime_api", snapshotAt: null, description: "NEJM, The Lancet, European Heart Journal, Circulation, РКЖ — через фильтр журналов PubMed", limitations: "Полные тексты и подписки издателей не подключены" },
    { id: "esc-guidelines", name: "Рекомендации ESC", kind: "guidelines", mode: "LIVE", dataOrigin: "curated_snapshot", snapshotAt: GUIDELINE_SNAPSHOT_RETRIEVED_AT, description: "Публикации рекомендаций ESC 2026 и согласительных документов с цитатами из источников", limitations: "Снимок обновляется редакцией; полный текст рекомендаций не загружен" },
    { id: "regulatory-news", name: "Регуляторные изменения", kind: "regulatory", mode: "LIVE", dataOrigin: "curated_snapshot", snapshotAt: DRUG_SNAPSHOT_RETRIEVED_AT, description: "Публичные сообщения о регистрациях, ограничениях и важных исследованиях по препаратам", limitations: "Вторичные источники; каждую запись нужно сверить с первичным реестром" },
    { id: "grls", name: "ГРЛС Минздрава", kind: "regulatory", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "Государственный реестр лекарственных средств", limitations: "Публичного API нет — агент даёт ссылку для ручной проверки" },
    { id: "events-listings", name: "Афиши профессиональных событий", kind: "events", mode: "LIVE", dataOrigin: "curated_snapshot", snapshotAt: EVENTS_SNAPSHOT_RETRIEVED_AT, description: "Аккредитованные мероприятия РКО (rnmo.ru), конгрессы ESC и AHA", limitations: "Снимок афиш; даты и формат проверяйте на странице события" },
    { id: "nmo-portal", name: "Портал НМО", kind: "events", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "edu.rosminzdrav.ru — учёт баллов и запись на мероприятия", limitations: "Вход под вашей учётной записью не подключён" },
    { id: "rko-account", name: "Личный кабинет РКО", kind: "society", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "Регистрация на мероприятия РКО от вашего имени", limitations: "Авторизация под вашей учётной записью не подключена; агент готовит переход к регистрации" },
    { id: "telegram", name: "Telegram-каналы", kind: "messenger", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "Мониторинг профессиональных каналов", limitations: "Живое чтение каналов не подключено; есть только офлайн-разбор экспортов для редакции" },
    { id: "web", name: "Открытый веб", kind: "web", mode: "UNAVAILABLE", dataOrigin: "none", snapshotAt: null, description: "Поиск по открытому интернету", limitations: "Не подключён: агенты работают только с доверенными источниками" },
    { id: "user-uploads", name: "Ваши документы", kind: "user_documents", mode: "LIVE", dataOrigin: "user_content", snapshotAt: null, description: "Файлы, ссылки и заметки, которые вы добавили сами", limitations: "TXT, MD, CSV, HTML и DOCX индексируются; для PDF сохраняются только метаданные" },
    { id: "calendar-ics", name: "Календарь: файл .ics", kind: "calendar", mode: "LIVE", dataOrigin: "user_content", snapshotAt: null, description: "Готовит файл события с напоминаниями для любого календаря", limitations: "Файл скачивается после вашего подтверждения; импорт в календарь — на вашей стороне" },
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
