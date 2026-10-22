import { countLabel } from "./format";
import { researchStudyNormalizationFromAttributes, type ResearchStudyNormalization } from "./research-study-normalization";
import { describeStudyIdentifiers, hasStudyIdentifiers, studyIdentifiersIn } from "./study-identifiers";
import type { AgentResultView, AgentRun, ResultAttributeValue, VerificationStatus } from "./types";

/**
 * One compact answer for the research scenario, built only from what the run
 * stored: retrieved records, the text actually read, values extracted from that
 * text with their quote, and the authors' own conclusion. Nothing here is
 * inferred: a field the text does not state stays empty, and the product never
 * turns a study result into a treatment recommendation.
 */

export type ResearchAnswerKind = "study" | "question" | "not_found" | "unavailable" | "blocked";

export interface StudyLink {
  label: string;
  href: string;
}

export interface StudyDigest {
  id: string;
  title: string;
  journal: string;
  year: string | null;
  /** Study design in Russian, from PubMed publication types; null when PubMed gives only «Journal Article». */
  design: string | null;
  access: "full_text" | "abstract" | "unavailable" | null;
  /** Main effect as stated in the text: measure, estimate, 95% CI, p. */
  effect: string | null;
  /** Sentences of the article the effect and endpoint were read from. */
  effectQuote: string | null;
  endpoint: string | null;
  population: string | null;
  comparison: string | null;
  followUp: string | null;
  conclusion: { text: string; label: string } | null;
  links: StudyLink[];
  verification: VerificationStatus | null;
  outsideApprovedList: boolean;
  internalHref: string | null;
}

export interface ResearchAnswer {
  kind: ResearchAnswerKind;
  headline: string;
  studies: StudyDigest[];
  /** Why this can be trusted: what was read and how the links were checked. */
  trust: string[];
  practice: string;
  limitations: string[];
  totalFound: number;
}

const DESIGN_RU: ReadonlyArray<[RegExp, string]> = [
  [/^meta-analysis$/iu, "метаанализ"],
  [/^systematic review$/iu, "систематический обзор"],
  [/^randomized controlled trial$/iu, "РКИ"],
  [/^(?:practice )?guideline$/iu, "клинические рекомендации"],
  [/^clinical trial, phase (i{1,3}|iv)$/iu, "клиническое исследование"],
  [/^clinical trial$/iu, "клиническое исследование"],
  [/^observational study$/iu, "наблюдательное исследование"],
  [/^multicenter study$/iu, "многоцентровое"],
  [/^comparative study$/iu, "сравнительное"],
  [/^review$/iu, "обзор"],
  [/^case reports$/iu, "описание случая"],
];

function text(value: ResultAttributeValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Design labels in evidence order (meta-analysis first); «клиническое исследование» is dropped when the trial is an RCT. */
export function designLabel(publicationTypes: string | null): string | null {
  if (!publicationTypes) return null;
  const types = publicationTypes.split(/\s*,\s*/u);
  let labels = [...new Set(DESIGN_RU.filter(([pattern]) => types.some(type => pattern.test(type))).map(([, label]) => label))];
  if (labels.includes("РКИ")) labels = labels.filter(label => label !== "клиническое исследование");
  return labels.length ? labels.join(", ") : null;
}

/** The leading design only («РКИ», not «РКИ, многоцентровое»), for counting what the answer rests on. */
function primaryDesign(design: string | null): string | null {
  return design?.split(", ")[0] ?? null;
}

function yearOf(result: AgentResultView): string | null {
  return result.observedAt?.match(/\d{4}/u)?.[0] ?? result.summary.match(/\b(19|20)\d{2}\b/u)?.[0] ?? null;
}

function effectLine(normalized: ResearchStudyNormalization | null): string | null {
  const fields = normalized?.fields;
  if (!fields?.effectMeasure || !fields.effectEstimate) return null;
  return [
    `${fields.effectMeasure.value} ${fields.effectEstimate.value}`,
    fields.confidenceInterval ? `95% ДИ ${fields.confidenceInterval.value}` : null,
    fields.pValue?.value ?? null,
  ].filter(Boolean).join("; ");
}

function populationLine(normalized: ResearchStudyNormalization | null): string | null {
  const fields = normalized?.fields;
  const parts = [fields?.sampleSize?.value ?? null, fields?.age?.value ? `age ${fields.age.value}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function comparisonLine(normalized: ResearchStudyNormalization | null): string | null {
  const intervention = normalized?.fields.intervention?.value ?? null;
  const comparator = normalized?.fields.comparator?.value ?? null;
  if (intervention && comparator) return `${intervention} — против: ${comparator}`;
  return intervention ?? (comparator ? `Контроль: ${comparator}` : null);
}

function weakest(statuses: readonly VerificationStatus[]): VerificationStatus | null {
  const order: VerificationStatus[] = ["UNSUPPORTED", "UNKNOWN", "PARTIALLY_SUPPORTED", "SUPPORTED"];
  return order.find(status => statuses.includes(status)) ?? null;
}

function linksFor(result: AgentResultView): StudyLink[] {
  const links: StudyLink[] = [];
  const pubmed = result.actions.find(action => action.kind === "open_source" && action.href)?.href ?? result.source.sourceUrl;
  if (pubmed) links.push({ label: result.source.connectorId === "pubmed" ? "PubMed" : "Первоисточник", href: pubmed });
  const read = text(result.attributes["evidenceText.url"]);
  if (text(result.attributes["evidenceText.access"]) === "full_text" && read && read !== pubmed) links.push({ label: "Полный текст PMC", href: read });
  const doi = text(result.attributes.doi);
  if (doi) links.push({ label: "DOI", href: `https://doi.org/${doi.split("/").map(encodeURIComponent).join("/")}` });
  return links;
}

export function studyDigest(result: AgentResultView): StudyDigest {
  const normalized = researchStudyNormalizationFromAttributes(result.attributes);
  const access = text(result.attributes["evidenceText.access"]);
  const conclusionText = text(result.attributes["authorsConclusion.text"]);
  const internal = result.actions.find(action => action.kind === "open_internal" && action.href)?.href ?? null;
  return {
    id: result.id,
    title: result.title,
    journal: text(result.attributes.journal) ?? result.source.source,
    year: yearOf(result),
    design: designLabel(text(result.attributes.publicationTypes)) ?? (result.category === "guideline" ? "клинические рекомендации" : null),
    access: access === "full_text" || access === "abstract" || access === "unavailable" ? access : null,
    effect: effectLine(normalized),
    effectQuote: normalized?.fields.effectEstimate?.supportText ?? null,
    endpoint: normalized?.fields.endpoint?.value ?? null,
    population: populationLine(normalized),
    comparison: comparisonLine(normalized),
    followUp: normalized?.fields.followUp?.value ?? null,
    conclusion: conclusionText ? { text: conclusionText, label: text(result.attributes["authorsConclusion.label"]) ?? "Вывод авторов" } : null,
    links: linksFor(result),
    verification: weakest(result.evidence.map(item => item.verificationStatus)),
    outsideApprovedList: result.attributes.journalOutsideApprovedList === true,
    internalHref: internal,
  };
}

/** The run's own ranking decides the order; how deeply a record was read only breaks ties. */
function depth(study: StudyDigest): number {
  return study.effect ? 0 : study.conclusion ? 1 : study.access && study.access !== "unavailable" ? 2 : 3;
}

const PRACTICE = "Выводы авторов приведены выше на языке оригинала. Продукт не превращает их в рекомендацию и не подбирает лечение: применимость к вашей практике оценивает врач, сверяясь с клиническими рекомендациями.";

export function buildResearchAnswer(run: AgentRun, results: readonly AgentResultView[]): ResearchAnswer {
  const question = run.input.text ?? "";
  const identifiers = studyIdentifiersIn(question);
  const named = hasStudyIdentifiers(identifiers);
  const pubmedUse = run.toolsUsed.find(use => use.tool === "searchPubmed");
  const pubmedDown = Boolean(pubmedUse && pubmedUse.status !== "ok" && pubmedUse.status !== "partial");
  const organic = results.filter(result => !result.partner);
  const ranked = [...organic].sort((a, b) => a.rank - b.rank);
  const digests = ranked.map(result => ({ digest: studyDigest(result), rank: result.rank }))
    .sort((a, b) => a.rank - b.rank || depth(a.digest) - depth(b.digest))
    .map(entry => entry.digest);

  if (run.status === "blocked") {
    return { kind: "blocked", headline: "Запрос остановлен проверкой безопасности: продукт не разбирает данные конкретного пациента и не назначает лечение.", studies: [], trust: [], practice: PRACTICE, limitations: [...run.riskNotices], totalFound: 0 };
  }

  const read = digests.filter(study => study.access === "full_text" || study.access === "abstract");
  const fullText = read.filter(study => study.access === "full_text").length;
  const withEffect = digests.filter(study => study.effect).length;
  const statuses = organic.flatMap(result => result.evidence.map(item => item.verificationStatus));
  const supported = statuses.filter(status => status === "SUPPORTED").length;
  const partial = statuses.filter(status => status === "PARTIALLY_SUPPORTED").length;
  const designCounts = new Map<string, number>();
  for (const study of digests) {
    const design = primaryDesign(study.design);
    if (design) designCounts.set(design, (designCounts.get(design) ?? 0) + 1);
  }
  const designs = [...designCounts.entries()].map(([design, count]) => `${design} — ${count}`);

  const trust = [
    designs.length ? `Дизайн по данным PubMed: ${designs.slice(0, 4).join(", ")}.` : null,
    read.length ? `Прочитано: ${fullText ? `полный текст — ${fullText}` : ""}${fullText && read.length - fullText ? ", " : ""}${read.length - fullText ? `только аннотация — ${read.length - fullText}` : ""}.${withEffect ? " Цифры эффекта взяты из этого текста, у каждой есть цитата." : ""}` : null,
    statuses.length ? `Сверка ссылок с источником: полностью — ${supported} из ${statuses.length}${partial ? `, подтверждены только данные публикации — ${partial}` : ""}. Это сверка ссылок, а не оценка качества исследования.` : null,
  ].filter((value): value is string => Boolean(value));

  const limitations = [
    pubmedDown ? `PubMed: ${pubmedUse?.note ?? "недоступен во время запуска"}.` : null,
    read.length && read.length === read.filter(study => study.access === "abstract").length ? "Полных текстов в открытом доступе нет: прочитаны только аннотации." : null,
    read.length > withEffect ? `Для ${countLabel(read.length - withEffect, ["публикации", "публикаций", "публикаций"])} величина эффекта в тексте не найдена — поле оставлено пустым.` : null,
    digests.some(study => study.outsideApprovedList) ? "Журнала нет в списке, проверенном врачами: качество источника оцените сами." : null,
    !named && organic.some(result => result.source.connectorId === "pubmed") ? `Поиск в PubMed ограничен журналами, проверенными врачами, и шестью самыми подходящими статьями${organic.some(result => result.source.connectorId !== "pubmed") ? "; остальные находки — из каталога специальности" : ""}.` : null,
    "Выводы авторов приводятся на языке оригинала, перевода нет.",
  ].filter((value): value is string => Boolean(value));

  if (pubmedDown && !organic.length) {
    // The note says why: excluded in the physician's sources, switched off, or no answer from NCBI.
    const note = pubmedUse?.note ?? "";
    const excluded = /исключ/u.test(note);
    const headline = excluded
      ? "PubMed исключён в источниках вашего профиля, поэтому разбор по PubMed не выполнялся. Включите его в профиле или в настройках разбора."
      : `PubMed не ответил${note ? ` (${note.replace(/\.$/u, "")})` : ""}, поэтому разбор не выполнен${named ? ` (${describeStudyIdentifiers(identifiers)})` : ""}. Повторите запрос позже.`;
    return { kind: "unavailable", headline, studies: [], trust: [], practice: PRACTICE, limitations: limitations.filter(line => !line.startsWith("PubMed:")), totalFound: 0 };
  }
  if (named) {
    const asked = describeStudyIdentifiers(identifiers);
    if (!organic.length) {
      const skipped = pubmedUse?.status === "ok" && pubmedUse.note?.startsWith("PubMed пропущен");
      return { kind: "not_found", headline: skipped ? `${pubmedUse?.note}: публикацию (${asked}) не искали.` : `В PubMed нет публикации по ${asked}. Проверьте идентификатор или вставьте ссылку на статью в PubMed.`, studies: [], trust, practice: PRACTICE, limitations, totalFound: 0 };
    }
    const study = digests[0];
    const result = study.effect ? `Основной результат по тексту статьи: ${study.effect}.` : study.conclusion ? "Величину эффекта в тексте найти не удалось — ниже вывод авторов." : "Текст статьи прочитать не удалось — доступны только данные PubMed.";
    return { kind: "study", headline: `${study.design ? `${study.design[0].toLocaleUpperCase("ru-RU")}${study.design.slice(1)}, ` : ""}${study.journal}${study.year ? `, ${study.year}` : ""}. ${result}`, studies: digests.slice(0, 4), trust, practice: PRACTICE, limitations, totalFound: organic.length };
  }
  if (!organic.length) {
    const noTopic = pubmedUse?.status === "partial" && /Нет тем/u.test(pubmedUse.note ?? "");
    const headline = noTopic
      ? "Не удалось понять тему вопроса: в PubMed не искали, в каталоге специальности совпадений нет. Назовите заболевание, вмешательство или сравнение, например «ПОАК у пожилых с фибрилляцией предсердий», или вставьте PMID статьи."
      : "По вопросу ничего не нашлось в выбранных источниках. Уточните заболевание, вмешательство или сравнение, либо расширьте источники в настройках разбора.";
    return { kind: "not_found", headline, studies: [], trust, practice: PRACTICE, limitations, totalFound: 0 };
  }
  const headline = [
    `Нашли ${countLabel(organic.length, ["публикацию", "публикации", "публикаций"])} по вопросу.`,
    read.length ? `Прочитали ${read.length}${withEffect ? `, величина эффекта указана в ${withEffect}` : ", величину эффекта в тексте найти не удалось"}.` : pubmedDown ? "PubMed не ответил: ниже только материалы каталога специальности." : "Тексты публикаций не читались — ниже только данные PubMed и каталога.",
  ].join(" ");
  return { kind: "question", headline, studies: digests.slice(0, 3), trust, practice: PRACTICE, limitations, totalFound: organic.length };
}
