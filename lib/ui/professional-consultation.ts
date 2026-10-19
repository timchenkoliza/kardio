import type { SpecialtyId } from "@/lib/domain/types";

export type ProfessionalConsultationRouteKind = "expert_group" | "professional_discussion" | "formal_consilium";

export interface ProfessionalConsultationRoute {
  id: string;
  specialty: SpecialtyId | "shared";
  kind: ProfessionalConsultationRouteKind;
  title: string;
  provider: string;
  description: string;
  actionLabel: string;
  url: string;
}

/**
 * Professional routes only. They do not create a patient consultation inside
 * the product and do not imply that a listed expert will accept a case.
 */
export const professionalConsultationRoutes: readonly ProfessionalConsultationRoute[] = [
  {
    id: "rko-workgroups",
    specialty: "cardiology",
    kind: "expert_group",
    title: "Найти экспертную группу по теме",
    provider: "Российское кардиологическое общество",
    description: "Секции и рабочие группы РКО по направлениям кардиологии. Подходит для поиска профильного профессионального сообщества и публичных контактов группы.",
    actionLabel: "Открыть группы РКО",
    url: "https://scardio.ru/workgroups",
  },
  {
    id: "russco-protocol-experts",
    specialty: "oncology",
    kind: "expert_group",
    title: "Эксперты протоколов RUSSCO",
    provider: "RUSSCO",
    description: "Публичный список экспертов проекта протоколов противоопухолевой лекарственной терапии с профессиональными аффилиациями.",
    actionLabel: "Открыть список экспертов",
    url: "https://rosoncoweb.ru/standarts/protocols/experts/",
  },
  {
    id: "russco-protocol-discussion",
    specialty: "oncology",
    kind: "professional_discussion",
    title: "Задать вопрос по протоколу",
    provider: "RUSSCO",
    description: "RUSSCO прямо приглашает практикующих врачей задавать вопросы по протоколам и участвовать в профессиональной дискуссии.",
    actionLabel: "Перейти к протоколам",
    url: "https://www.rosoncoweb.ru/standarts/protocols/",
  },
  {
    id: "vrachirf-peer-network",
    specialty: "shared",
    kind: "professional_discussion",
    title: "Обсудить профессиональный вопрос с врачами",
    provider: "Врачи РФ",
    description: "Верифицируемое профессиональное сообщество: зарегистрированные врачи могут обсуждать публикации и обращаться к авторам в комментариях или личных сообщениях. Не является формальным медицинским консилиумом.",
    actionLabel: "Открыть сообщество",
    url: "https://vrachirf.ru/",
  },
  {
    id: "formal-telemedicine-consilium",
    specialty: "shared",
    kind: "formal_consilium",
    title: "Официальный телемедицинский консилиум",
    provider: "Порядок Минздрава России № 193н",
    description: "Формальный консилиум относится к медицинской помощи и организуется медицинской организацией. Этот продукт не принимает медицинские данные пациента и не проводит такой консилиум внутри интерфейса.",
    actionLabel: "Открыть порядок Минздрава",
    url: "https://minjust.consultant.ru/files/55355",
  },
];

export function professionalConsultationRoutesForSpecialty(specialty: SpecialtyId): ProfessionalConsultationRoute[] {
  return professionalConsultationRoutes.filter(route => route.specialty === "shared" || route.specialty === specialty);
}
