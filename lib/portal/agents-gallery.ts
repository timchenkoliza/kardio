import type { SpecialtyId } from "@/lib/domain/types";
import { askHref, researchScenarioHref, type PortalJob } from "@/lib/portal/jobs";

/**
 * Agents as the physician sees them: capability personas over the one portal
 * input. A gallery card never names a backend component; it says what the
 * capability does, which kinds of sources it reads, and starts the same
 * routed job the input would start — in the same tab. A capability that does
 * not exist for a specialty is shown as «готовим», never simulated.
 */

export type MascotVariant = "drug" | "guidelines" | "research" | "consilium" | "calculators" | "events" | "materials" | "learning" | "updates";

export interface GalleryAgent {
  id: MascotVariant;
  name: string;
  role: string;
  /** What it can do, one line. */
  can: string;
  /** Kinds of sources, in physician terms. */
  sources: string;
  /** Mascot help copy (hover / focus). */
  help: string;
  job: PortalJob | null;
  /** Specialties where the capability works today; null = all launch specialties. */
  availableIn: readonly SpecialtyId[] | null;
}

export const GALLERY: readonly GalleryAgent[] = [
  { id: "drug", name: "Справка по препарату", role: "Фармаколог-справочник", can: "Показания, дозирование, противопоказания и безопасность — из официальной инструкции", sources: "Инструкции МЕДИ РУ и FDA, сообщения регуляторов; статус в России — по ссылке на ГРЛС", help: "Проверяю инструкцию, дозирование и безопасность", job: "drug", availableIn: null },
  { id: "guidelines", name: "Клинические рекомендации", role: "Методист по рекомендациям", can: "Актуальные рекомендации по теме и что изменилось между версиями", sources: "Рекомендации профессиональных обществ и публикации PubMed; рубрикатор Минздрава — по ссылке", help: "Сверяю текущую и предыдущую версии", job: "guidelines", availableIn: null },
  { id: "research", name: "Разбор по\u00a0исследованиям", role: "Аналитик доказательств", can: "Исследования по вопросу или конкретная статья по PMID и DOI: результат из текста статьи, вывод авторов, ссылка на первоисточник", sources: "PubMed и журналы, проверенные врачами; статья по идентификатору — из любого журнала", help: "Читаю статьи и показываю, откуда цифры", job: "research", availableIn: null },
  { id: "consilium", name: "Консилиум", role: "Сводит позиции источников", can: "Сопоставляет выводы рекомендаций и обзоров по сложному вопросу и показывает, где они расходятся", sources: "Рекомендации и обзоры; продукт не решает, кто прав, — решение остаётся за вами", help: "Собираю позиции источников и показываю расхождения", job: "answer", availableIn: null },
  { id: "calculators", name: "Калькуляторы", role: "Шкалы и формулы", can: "СКФ, клиренс креатинина, ИМТ, ППТ, шкалы риска и сроки — с формулой, областью применимости и источником; расчёт в браузере", sources: "Опубликованные формулы и рекомендации профессиональных обществ — у каждой ссылка на первоисточник", help: "Считаю по формуле прямо в браузере", job: null, availableIn: null },
  { id: "events", name: "Мероприятия и НМО", role: "Календарь специальности", can: "Конференции и школы по теме с датами, форматом и организатором", sources: "Афиши организаторов и портал НМО; регистрация — только после вашего подтверждения", help: "Ищу события и сверяю даты", job: "events", availableIn: null },
  { id: "materials", name: "Мои материалы", role: "Личная библиотека", can: "Отвечает только по вашим файлам, ссылкам и заметкам — со ссылкой на документ", sources: "Только то, что вы добавили сами; другим пользователям недоступно", help: "Ищу только в вашей личной библиотеке", job: "materials", availableIn: null },
  { id: "learning", name: "Обучение", role: "Наставник", can: "Следующий шаг в обучении по вашей специальности и вопросам — с объяснением, почему он", sources: "Обзоры и рекомендации по специальности", help: "Подбираю, что изучить дальше", job: "learning", availableIn: null },
  { id: "updates", name: "Что нового", role: "Обозреватель специальности", can: "Новые исследования, рекомендации и сигналы по препаратам с прошлого визита", sources: "PubMed, рекомендации обществ, регуляторы", help: "Смотрю, что появилось с вашего прошлого визита", job: "updates", availableIn: null },
];

export function galleryAvailable(agent: GalleryAgent, specialty: SpecialtyId): boolean {
  return !agent.availableIn || agent.availableIn.includes(specialty);
}

/** Same-tab launch target of a gallery card. */
export function galleryHref(agent: GalleryAgent, specialty: SpecialtyId): string | null {
  if (!galleryAvailable(agent, specialty)) return null;
  if (agent.id === "materials") return `/${specialty}/materials`;
  if (agent.id === "calculators") return `/${specialty}/tools`;
  // The research scenario has its own settings (what to get, sources, type): open it, not the bare input.
  if (agent.id === "research") return researchScenarioHref(specialty);
  return agent.job ? askHref(specialty, { job: agent.job }) : null;
}

/** The three capabilities shown on the home page under the one input (opportunity map order). */
export const HOME_AGENTS: readonly MascotVariant[] = ["drug", "guidelines", "research"];
