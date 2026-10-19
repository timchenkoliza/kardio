export type OncologyStarterKind = "guideline" | "clinical" | "evidence" | "learning" | "event";

export interface OncologyStarterItem {
  id: string;
  kind: OncologyStarterKind;
  title: string;
  source: string;
  sourceLabel: string;
  dateLabel: string;
  summary: string;
  url: string;
}

/**
 * External, source-grounded starter layer for Oncology.
 * These items are intentionally not canonical ContentObjects: they keep the
 * oncology catalog boundary honest until a dedicated verified import exists.
 */
export const oncologyStarterItems: readonly OncologyStarterItem[] = [
  {
    id: "aor-guidelines-2026",
    kind: "guideline",
    title: "Клинические рекомендации по онкологии: каталог 2026",
    source: "Ассоциация онкологов России",
    sourceLabel: "Официальный профессиональный источник",
    dateLabel: "2026",
    summary: "Каталог рекомендаций для взрослых по отдельным опухолевым локализациям, включая рак лёгкого, желудка, мочевого пузыря, предстательной железы и другие нозологии.",
    url: "https://oncology-association.ru/clinical-guidelines",
  },
  {
    id: "russco-guidelines-2025",
    kind: "guideline",
    title: "Практические рекомендации RUSSCO",
    source: "RUSSCO",
    sourceLabel: "Профессиональное общество",
    dateLabel: "электронные версии 2025",
    summary: "Рекомендации по лечению злокачественных опухолей. На странице RUSSCO указано, что электронные версии 2025 года регулярно обновляются.",
    url: "https://www.rosoncoweb.ru/standarts/RUSSCO/",
  },
  {
    id: "russco-supportive-care-2025",
    kind: "clinical",
    title: "Поддерживающая терапия в онкологии",
    source: "RUSSCO",
    sourceLabel: "Профессиональное общество",
    dateLabel: "2025",
    summary: "Рекомендации по профилактике и лечению осложнений злокачественных опухолей и противоопухолевой лекарственной терапии.",
    url: "https://rosoncoweb.ru/standarts/suptherapy/",
  },
  {
    id: "russco-protocols-2026",
    kind: "clinical",
    title: "Протоколы противоопухолевой лекарственной терапии",
    source: "RUSSCO",
    sourceLabel: "Профессиональный источник",
    dateLabel: "обновления 2026",
    summary: "Раздел с протоколами противоопухолевой терапии и связанными материалами. Состав схем и показания проверяются только в первоисточнике.",
    url: "https://www.rosoncoweb.ru/standarts/protocols/resources/",
  },
  {
    id: "esmo-cervical-2026",
    kind: "evidence",
    title: "Рак шейки матки — ESMO Clinical Practice Guideline",
    source: "ESMO",
    sourceLabel: "Международное профессиональное общество",
    dateLabel: "24 сентября 2026",
    summary: "Обновление ESMO Clinical Practice Guideline по раку шейки матки, опубликованное в сентябре 2026 года.",
    url: "https://www.esmo.org/guidelines/guidelines-news",
  },
  {
    id: "esmo-metastatic-breast-2026",
    kind: "evidence",
    title: "Метастатический рак молочной железы — Living Guideline v2.0",
    source: "ESMO",
    sourceLabel: "Международное профессиональное общество",
    dateLabel: "август 2026",
    summary: "Living Guideline ESMO по метастатическому раку молочной железы, версия 2.0. Карточка ведёт на страницу обновлений ESMO.",
    url: "https://www.esmo.org/guidelines/guidelines-news",
  },
  {
    id: "russco-congress-2026",
    kind: "event",
    title: "XXX Российский онкологический конгресс",
    source: "RUSSCO",
    sourceLabel: "Страница организатора",
    dateLabel: "10–12 декабря 2026 · Москва",
    summary: "Конгресс с международным участием. На странице организатора опубликованы программа, регистрация и организационная информация.",
    url: "https://www.rosoncoweb.ru/events/2026/12/10/",
  },
  {
    id: "russco-education-2026",
    kind: "learning",
    title: "Видеозаписи конференций и симпозиумов RUSSCO",
    source: "RUSSCO",
    sourceLabel: "Образовательный архив",
    dateLabel: "2026",
    summary: "Архив видеозаписей профильных конференций 2026 года: поддерживающая терапия, онкоурология, рак молочной железы, опухоли ЖКТ и другие темы.",
    url: "https://www.rosoncoweb.ru/events/archive/",
  },
];

export function oncologyStarterByKind(kind: OncologyStarterKind | "all"): OncologyStarterItem[] {
  return oncologyStarterItems.filter(item => kind === "all" || item.kind === kind);
}
