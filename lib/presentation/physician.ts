import type { VerificationStatus } from "@/lib/agents/types";
import type { CapabilityState } from "@/lib/portal/cards";
import { DRUGS } from "@/lib/portal/lexicon";
import { EXTRA_DRUGS, GLOSSARY, ISSUERS, JURISDICTIONS } from "./glossary";

/**
 * physicianPresentation(): the one deterministic editorial layer between raw
 * evidence/results and the physician surface. It decides the language of what
 * is shown first, writes honest Russian titles from fixed templates and a
 * clinical glossary, maps internal states to editorial labels and keeps the
 * original text behind «Оригинал». It never states medical meaning a source
 * does not state, and it never changes the evidence graph.
 */

const CYRILLIC = /\p{Script=Cyrillic}/gu;
const LATIN = /\p{Script=Latin}/gu;

export function cyrillicShare(text: string): number {
  const cyr = text.match(CYRILLIC)?.length ?? 0;
  const lat = text.match(LATIN)?.length ?? 0;
  return cyr + lat ? cyr / (cyr + lat) : 1;
}

/** Russian copy (international names, INN and abbreviations inside it are fine). */
export function isRussian(text: string | null | undefined): boolean {
  return !text || cyrillicShare(text) >= 0.6;
}

/**
 * English prose on a Russian surface: four or more consecutive Latin words of
 * two letters or more. Journal names, INN and abbreviations stay below it.
 */
export function hasEnglishProse(text: string): boolean {
  return /(?:\b[A-Za-z][A-Za-z'’-]+\b[\s,;:]+){4,}[A-Za-z]{2,}/u.test(text.replace(/«[^»]*»/gu, " "));
}

export function capitalize(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1) : text;
}

interface GlossaryHit { ru: string; at: number; population: boolean; aspect: boolean; phrase: string | null; suppresses: readonly string[] }

function glossaryHits(text: string): GlossaryHit[] {
  const hits: GlossaryHit[] = [];
  for (const entry of GLOSSARY) {
    const match = entry.pattern.exec(text);
    if (match) hits.push({ ru: entry.ru, at: match.index, population: Boolean(entry.population), aspect: Boolean(entry.aspect), phrase: entry.phrase ?? null, suppresses: entry.suppresses ?? [] });
  }
  const lower = text.toLowerCase();
  for (const drug of DRUGS) {
    const at = new RegExp(`\\b${drug.inn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").exec(lower)?.index;
    if (at !== undefined) hits.push({ ru: drug.ru, at, population: false, aspect: false, phrase: null, suppresses: [] });
  }
  for (const drug of EXTRA_DRUGS) {
    const match = drug.inn.exec(text);
    if (match) hits.push({ ru: drug.ru, at: match.index, population: false, aspect: false, phrase: null, suppresses: [] });
  }
  const suppressed = new Set(hits.flatMap(hit => hit.suppresses));
  const seen = new Set<string>();
  return hits
    .filter(hit => !suppressed.has(hit.ru))
    .sort((a, b) => a.at - b.at)
    .filter(hit => (seen.has(hit.ru) ? false : (seen.add(hit.ru), true)));
}

/** Topic and drug labels found in an English title or abstract, in reading order (populations last). */
export function glossaryTerms(text: string, max = 4): string[] {
  const hits = glossaryHits(text).filter(hit => !hit.aspect);
  return [...hits.filter(hit => !hit.population), ...hits.filter(hit => hit.population)].slice(0, max).map(hit => hit.ru);
}

/** Subject, what the document does with it, and for whom — the parts of a Russian title. */
export function glossaryParts(text: string): { subjects: string[]; aspects: string[]; population: string | null } {
  const hits = glossaryHits(text);
  const population = hits.find(hit => hit.population);
  return {
    subjects: hits.filter(hit => !hit.population && !hit.aspect).slice(0, 3).map(hit => hit.ru),
    aspects: hits.filter(hit => hit.aspect).slice(0, 2).map(hit => hit.ru),
    population: population ? population.phrase ?? population.ru : null,
  };
}

/** The kind of document as its own title states it, when that is more specific than the database type. */
export function documentKind(title: string, typeLabel: string): string {
  if (/executive summary/i.test(title)) return "Краткая версия рекомендаций";
  if (/focused update/i.test(title)) return "Обновление рекомендаций";
  if (/scientific statement/i.test(title)) return "Научное заявление";
  if (/position (?:statement|paper)/i.test(title)) return "Позиция экспертов";
  if (/consensus/i.test(title)) return "Консенсус экспертов";
  if (/network meta-analysis/i.test(title)) return "Сетевой метаанализ";
  if (/systematic review and meta-analysis/i.test(title)) return "Систематический обзор и метаанализ";
  const generic = /^(?:Публикация|Статья|Новая публикация|Исследование)$/u.test(typeLabel);
  if (!generic) return typeLabel;
  if (/guideline|recommendations/i.test(title)) return "Рекомендации";
  if (/randomi[sz]ed/i.test(title)) return "Рандомизированное исследование";
  if (/cohort/i.test(title)) return "Когортное исследование";
  if (/case report|case series/i.test(title)) return "Клинический случай";
  if (/cross-sectional/i.test(title)) return "Одномоментное исследование";
  if (/\breview\b/i.test(title)) return "Обзор";
  return typeLabel;
}

/** A year the document gives itself in its title («2026 Guideline…», «…guidelines 2025»). */
export function titleYear(title: string): string | null {
  return title.match(/\b(20[0-4]\d)\b/u)?.[1] ?? null;
}

/**
 * «Рекомендации 2026: инсульт — реабилитация и восстановление у взрослых».
 * Every part comes from the glossary or the source title; nothing is inferred.
 */
export function composeTitle(title: string, typeLabel: string): string | null {
  const parts = glossaryParts(title);
  if (!parts.subjects.length && !parts.aspects.length) return null;
  const year = titleYear(title);
  const kind = documentKind(title, typeLabel);
  const head = `${kind}${year && !kind.includes(year) ? ` ${year}` : ""}`;
  const subject = parts.subjects.length ? parts.subjects.join(", ") : null;
  const aspect = parts.aspects.length ? parts.aspects.join(" и ") : null;
  const body = [subject, aspect].filter(Boolean).join(" — ");
  return `${head}: ${body}${parts.population ? ` ${parts.population}` : ""}`;
}

/** Who issued the document and where, in Russian, from the source title. */
export function issuersOf(title: string): { issuers: string[]; jurisdiction: string | null } {
  const issuers = [...new Set(ISSUERS.filter(entry => entry.pattern.test(title)).map(entry => entry.ru))];
  return { issuers, jurisdiction: JURISDICTIONS.find(entry => entry.pattern.test(title))?.ru ?? null };
}

/**
 * Facts about a publication in Russian: who issued it, where it was published
 * and how certain the authors say the evidence is. No finding is restated.
 */
export function publicationFacts(args: { title: string; journal?: string | null; abstract?: string | null }): string | null {
  const { issuers, jurisdiction } = issuersOf(args.title);
  const certainty = args.abstract ? certaintyOf(args.abstract) : null;
  const facts = [
    issuers.length ? `Документ: ${issuers.join(", ")}.` : jurisdiction ? `Национальный документ: ${jurisdiction}.` : null,
    args.journal ? `Опубликовано в журнале ${args.journal}.` : null,
    certainty ? `Уверенность доказательств по оценке авторов: ${CERTAINTY_LABEL[certainty]}.` : null,
  ].filter(Boolean);
  return facts.length ? facts.join(" ") : null;
}

/**
 * Curated Russian copy for known publications (golden scenarios and items the
 * editorial team has already read). The title is a translation of the source
 * title; the summary only restates what the title and the publication type say.
 */
export const CURATED_COPY: ReadonlyArray<{ match: RegExp; title: string; summary: string | null; tags?: readonly string[] }> = [
  {
    match: /Transcatheter Mitral and Tricuspid Valve Intervention/i,
    title: "Канадские кардиологические общества: обновление практики транскатетерных вмешательств на митральном и трикуспидальном клапанах",
    summary: "Совместный документ канадских обществ кардиологов, кардиохирургов и интервенционных кардиологов. В фокусе — оценка пациентов перед транскатетерным вмешательством на митральном и трикуспидальном клапанах.",
    tags: ["митральный клапан", "трикуспидальный клапан", "транскатетерные вмешательства"],
  },
  {
    match: /Blood pressure targets for hypertension in people with diabetes/i,
    title: "Целевые уровни АД при артериальной гипертензии у пациентов с сахарным диабетом",
    summary: "Систематический обзор Cochrane о целевых уровнях артериального давления у пациентов с артериальной гипертензией и сахарным диабетом.",
    tags: ["целевые уровни АД", "артериальная гипертензия", "сахарный диабет"],
  },
  {
    match: /Veterans Affairs.*Lipid Management/i,
    title: "Синопсис рекомендаций VA/DoD 2025 по управлению липидами для снижения сердечно-сосудистого риска",
    summary: "Краткое изложение клинических рекомендаций Министерства по делам ветеранов и Министерства обороны США по управлению липидами для снижения сердечно-сосудистого риска.",
    tags: ["липидный обмен", "сердечно-сосудистый риск"],
  },
  {
    match: /Cannabis and cannabinoids for symptomatic treatment for people with multiple sclerosis/i,
    title: "Каннабис и каннабиноиды для симптоматического лечения при рассеянном склерозе",
    summary: "Систематический обзор Cochrane о симптоматическом лечении каннабиноидами у пациентов с рассеянным склерозом.",
    tags: ["рассеянный склероз", "каннабиноиды", "спастичность"],
  },
  {
    match: /Immunomodulators and immunosuppressants for relapsing-remitting multiple sclerosis/i,
    title: "Иммуномодуляторы и иммуносупрессанты при ремиттирующем рассеянном склерозе: сетевой метаанализ",
    summary: "Систематический обзор Cochrane с сетевым метаанализом препаратов, изменяющих течение ремиттирующего рассеянного склероза.",
    tags: ["ремиттирующий рассеянный склероз", "иммуномодуляторы", "иммуносупрессанты"],
  },
  {
    match: /Effects of exercise in people with multiple sclerosis/i,
    title: "Физические упражнения при рассеянном склерозе: систематический обзор и метаанализ",
    summary: "Систематический обзор и метаанализ о влиянии физических упражнений у пациентов с рассеянным склерозом.",
    tags: ["рассеянный склероз", "физическая активность", "утомляемость"],
  },
];

export function curatedCopy(title: string) {
  return CURATED_COPY.find(entry => entry.match.test(title)) ?? null;
}

export interface LocalizedText {
  /** Russian display title. */
  title: string;
  /** Russian summary, or null when no honest Russian summary exists. */
  summary: string | null;
  /** The source wording, shown only behind «Оригинал». */
  original: { title: string; summary: string | null; language: "en" } | null;
  tags: string[];
  /** How the Russian title was produced. */
  basis: "source" | "curated" | "glossary" | "template";
}

/**
 * Russian title and summary for any publication-like item. Russian source copy
 * passes through; English becomes curated copy, a glossary title («Тип: темы»)
 * or the honest template «Новая публикация по теме «…»».
 */
export function localizeItem(args: { title: string; summary?: string | null; typeLabel: string; topic?: string | null; tags?: readonly string[] }): LocalizedText {
  const summary = args.summary?.trim() || null;
  if (isRussian(args.title)) {
    return {
      title: args.title,
      summary: summary && isRussian(summary) && !hasEnglishProse(summary) ? summary : null,
      original: summary && !isRussian(summary) ? { title: args.title, summary, language: "en" } : null,
      tags: [...(args.tags ?? [])].slice(0, 4),
      basis: "source",
    };
  }
  const original = { title: args.title, summary, language: "en" as const };
  const curated = curatedCopy(args.title);
  if (curated) return { title: curated.title, summary: curated.summary, original, tags: [...(curated.tags ?? glossaryTerms(args.title))], basis: "curated" };
  // A Russian prefix on an English title («Прочитать систематический обзор: …») names the kind.
  const prefixed = args.title.match(/^([\p{Script=Cyrillic}\s]{6,60}):\s*(.+)$/u);
  const english = prefixed ? prefixed[2] : args.title;
  const kind = prefixed ? prefixed[1].trim() : args.typeLabel;
  const composed = composeTitle(english, kind);
  const tags = glossaryTerms(english);
  if (composed) return { title: capitalize(composed), summary: null, original, tags: tags.length ? tags : glossaryTerms(summary ?? ""), basis: "glossary" };
  const fromSummary = summary && !isRussian(summary) ? glossaryTerms(summary) : [];
  if (fromSummary.length) return { title: `${kind}: ${fromSummary.slice(0, 3).join(", ")}`, summary: null, original, tags: fromSummary, basis: "glossary" };
  const topic = args.topic?.trim();
  return {
    title: topic ? `${args.typeLabel} по теме «${topic}»` : `${args.typeLabel}: название на языке оригинала`,
    summary: null,
    original,
    tags: topic ? [topic] : [],
    basis: "template",
  };
}

/** Editorial source labels: the physician sees trust in words, never an internal enum. */
export type TrustTone = "trusted" | "curated" | "check" | "unavailable" | "example";

export function trustLabel(state: CapabilityState, options: { showcase?: boolean; partner?: boolean } = {}): { label: string; tone: TrustTone } {
  if (options.partner || state === "MOCK") return { label: "Пример формата", tone: "example" };
  if (options.showcase) return { label: "Подборка редакции", tone: "curated" };
  switch (state) {
    case "LIVE":
    case "DERIVED": return { label: "Надёжный источник", tone: "trusted" };
    case "SNAPSHOT": return { label: "Проверено редакцией", tone: "curated" };
    case "UNAVAILABLE":
    case "BROKEN": return { label: "Источник временно недоступен", tone: "unavailable" };
    default: return { label: "Требует сверки", tone: "check" };
  }
}

/**
 * Claim verification in editorial language (no «частично», no internal notes).
 * It says the shown text was found in the source — never that the source answers the question.
 */
export function editorialVerification(status: VerificationStatus): { label: string; tone: "supported" | "check" } {
  return status === "SUPPORTED" ? { label: "Совпадает с текстом источника", tone: "supported" } : { label: "Требует сверки", tone: "check" };
}

export type Certainty = "high" | "moderate" | "low" | "very_low";

export const CERTAINTY_LABEL: Record<Certainty, string> = {
  high: "высокая",
  moderate: "умеренная",
  low: "низкая",
  very_low: "очень низкая",
};

/**
 * Certainty of evidence as the authors word it (GRADE vocabulary in Cochrane
 * and guideline conclusions). Only the authors' own wording is read; no
 * judgement of our own is added.
 */
export function certaintyOf(text: string | null | undefined): Certainty | null {
  if (!text) return null;
  const value = text.toLowerCase();
  if (/very low[- ](?:certainty|quality)|very uncertain/.test(value)) return "very_low";
  if (/high[- ](?:certainty|quality) evidence|highly confident/.test(value)) return "high";
  if (/moderate[- ](?:certainty|quality)|moderately confident|\bprobably\b/.test(value)) return "moderate";
  if (/low[- ](?:certainty|quality)|\bmay\b|uncertain|limited evidence/.test(value)) return "low";
  return null;
}

/** Drug label section → the physician's navigation group. */
export type DrugSectionGroup = "indications" | "dosing" | "contraindications" | "safety" | "interactions" | "populations" | "other";

export const DRUG_SECTION_TITLE: Record<DrugSectionGroup, string> = {
  indications: "Показания",
  dosing: "Дозирование",
  contraindications: "Противопоказания",
  safety: "Безопасность",
  interactions: "Взаимодействия",
  populations: "Особые группы",
  other: "Другие разделы",
};

export const DRUG_SECTION_ORDER: readonly DrugSectionGroup[] = ["indications", "dosing", "contraindications", "safety", "interactions", "populations", "other"];

export function drugSectionGroup(heading: string | null | undefined): DrugSectionGroup {
  const value = (heading ?? "").toLocaleLowerCase("ru-RU");
  // «Противопоказания» contains «показания»: it is matched first.
  if (/противопоказ|contraindicat/.test(value)) return "contraindications";
  if (/показан|indication/.test(value)) return "indications";
  if (/дозир|способ применения|доз|dosage|administration/.test(value)) return "dosing";
  if (/взаимодейств|interaction/.test(value)) return "interactions";
  if (/беремен|лактац|кормлен|дет|пожил|почеч|печен|особ|pregnan|lactation|pediatric|geriatric|population/.test(value)) return "populations";
  if (/предупрежд|мер[ыа] предосторож|побочн|нежелательн|передозир|рамке|warning|precaution|adverse|overdos|boxed|изменени/.test(value)) return "safety";
  return "other";
}

/**
 * Internal diagnostics never reach the physician: whitelist explanations,
 * connector/policy states and machine identifiers. Returns null when a text is
 * internal; editorial text passes unchanged.
 */
const INTERNAL = /бел(?:ом|ый|ого) списк|white-?list|verificationNote|коннектор|connector|\bLIVE\b|\bMOCK\b|\bUNVERIFIED\b|\bDERIVED\b|\brun-[0-9a-f]|\bres-[0-9a-f]|\bskill\b|\bflow\b|policy_|rule_id|каталог статей, не знак качества/iu;

export function physicianSafe(text: string | null | undefined): string | null {
  if (!text) return null;
  return INTERNAL.test(text) ? null : text;
}

export function containsInternalJargon(text: string): boolean {
  return INTERNAL.test(text);
}

/** PubMed dates such as «2026 Oct 12» → «12 окт. 2026» (ISO and year-only kept as they are). */
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

export function russianPublicationDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const pubmed = /^(\d{4})\s+([A-Za-z]{3})(?:\s+(\d{1,2}))?/.exec(value.trim());
  if (pubmed) {
    const month = MONTHS[pubmed[2].toLowerCase()];
    if (month === undefined) return pubmed[1];
    const date = new Date(Date.UTC(Number(pubmed[1]), month, pubmed[3] ? Number(pubmed[3]) : 15));
    return pubmed[3]
      ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date)
      : new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  }
  return value;
}
