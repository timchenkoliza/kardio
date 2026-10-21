import type { Priority } from "./types";

/**
 * R-09: strings that must not appear in visible product text.
 * Sources: design-system/README.md → Content fundamentals; reference audit DS-01, DS-03, DS-18, DS-20, DS-21, DS-23.
 * To add a pattern: give it a stable id (it is part of the fingerprint), a regex and a fix.
 */
export interface BannedPattern {
  id: string;
  pattern: RegExp;
  priority: Priority;
  why: string;
  fix: string;
}

const CYR = "А-Яа-яЁё";

export const BANNED_COPY: readonly BannedPattern[] = [
  { id: "slug", pattern: /\b[a-z]+_[a-z]+(?:_[a-z]+)*\b/g, priority: "P0", why: "служебный идентификатор (слаг) в видимом тексте", fix: "Показывать человекочитаемое название из справочника, а не id" },
  { id: "we", pattern: new RegExp(`(?<![${CYR}])[Мм]ы(?![${CYR}])`, "gu"), priority: "P2", why: "интерфейс говорит от первого лица «мы»", fix: "Переписать обезличенно, в третьем лице: «Материал показан…», «…маскируются»" },
  { id: "vygruzka", pattern: /выгрузк/giu, priority: "P1", why: "внутренний термин «выгрузка» вместо источника", fix: "Назвать источник: «В рекомендациях РКО указано…»" },
  { id: "b2d", pattern: /\bB2D\b/g, priority: "P2", why: "внутренний жаргон «B2D» на экране врача", fix: "Убрать служебное название: «Проверено врачами»" },
  { id: "prototype", pattern: /прототип/giu, priority: "P2", why: "служебная метка «прототип» вместо источника", fix: "Указать реальный источник материала, слово «прототип» убрать" },
  { id: "telegram-latin", pattern: /\bTelegram\b/g, priority: "P3", why: "«Telegram» латиницей", fix: "Писать кириллицей: «Телеграм-каналы»" },
  { id: "straight-quotes", pattern: new RegExp(`"(?=[${CYR}])|(?<=[${CYR}])"`, "gu"), priority: "P3", why: "прямые кавычки в кириллическом тексте", fix: "Ёлочки «…», внутри — „лапки“" },
  { id: "hyphen-as-dash", pattern: / - /g, priority: "P3", why: "дефис с пробелами вместо тире", fix: "Тире с неразрывным пробелом перед ним: «слово — слово»" },
  { id: "three-dots", pattern: /\.\.\./g, priority: "P3", why: "три точки вместо многоточия", fix: "Символ многоточия «…»" },
];
