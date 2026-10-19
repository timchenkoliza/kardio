import type { ContentKind, ContentObject, Currentness, Shell, SpecialtyId } from "@/lib/domain/types";

export const specialtyLabel: Record<SpecialtyId, string> = { cardiology: "Кардиология", oncology: "Онкология" };
export const shellLabel: Record<Shell, string> = { explore: "Обзор", practice: "Практика", workspace: "Рабочее пространство" };
export const kindLabel: Record<ContentKind, string> = { guideline: "Рекомендации", article: "Статья", video: "Видео", event: "Событие", clinical: "Клинический материал", service: "Профессиональный сервис", tool: "Калькулятор", drug: "Справочник", referral: "ВМП" };
export const currentnessLabel: Record<Currentness, string> = { current: "Актуальная версия по данным источника", review: "Требует проверки актуальности", superseded: "Есть более новая версия", archived: "Архивный материал" };
export function isSpecialty(value: string): value is SpecialtyId { return value === "cardiology" || value === "oncology"; }
export function publicationLabel(content: ContentObject): string {
  if (content.publicationDate) {
    const parsed = new Date(content.publicationDate);
    if (!Number.isNaN(parsed.getTime())) return new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
  }
  return content.publicationYear ? `${content.publicationYear}` : "Дата не указана";
}
export function sourceTypeLabel(type: string): string {
  const normalized = type.toLowerCase();
  if (/guideline|official|society/.test(normalized)) return "Профессиональное общество";
  if (/journal|research|evidence/.test(normalized)) return "Научное издание";
  if (/commercial|pharma|partner/.test(normalized)) return "Коммерческий источник";
  if (/expert|community|social/.test(normalized)) return "Экспертный / общественный источник";
  if (/education|video/.test(normalized)) return "Образовательный источник";
  return "Профессиональный источник";
}
export function isPartner(content: ContentObject): boolean {
  return /commercial|pharma|sponsor|partner/.test(content.source.commercialStatus) && !/non|unknown|none/.test(content.source.commercialStatus);
}
