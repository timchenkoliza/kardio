import { unmatchedWords } from "@/lib/portal/unmatched";
import { countLabel, isBibliographicOnly, matchedSource, outsideApprovedList, verificationLabelFor } from "./format";
import { conditionLabel } from "@/lib/portal/labels";
import { type PubmedConcept, pubmedConceptsIn, topicById, topicLabels, topicsMentioned } from "./vocabulary";
import { isFragment, researchStudyNormalizationFromAttributes, type ResearchStudyNormalization } from "./research-study-normalization";
import { describeStudyIdentifiers, hasStudyIdentifiers, studyIdentifiersIn } from "./study-identifiers";
import { compileIntent } from "@/lib/mesh/intent";
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
  /** The same check label as in the table and the export («Совпадает с источником · версию сверьте»). */
  verificationLabel: string | null;
  verificationTone: "supported" | "partial" | "unsupported" | "unknown" | null;
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
  /** What the search used and the words of the question it did not («Не учтено в поиске: катетерная аблация»). */
  conditions?: string[];
  unmatched?: string[];
  /** The state comes from the physician's source settings: the way out is the profile's «Источники». */
  sourcesLink?: boolean;
  /**
   * None of the found works answers the question as asked (no asked drug in its title or conclusion, the named
   * trial not found): the works are shown as «Шире вопроса», with no result figures on top.
   */
  broader?: boolean;
}

/** PubMed journals the topic search was limited to, as the run recorded them («журналы: BMJ, Lancet»). */
export const SEARCHED_JOURNALS = /журналы поиска: ([^·]+)/u;

/** Abbreviations that are not a trial name («HR», «ESC», «PMID»). */
const NOT_A_TRIAL = /^(?:HR|OR|RR|CI|RCT|ESC|AHA|ACC|ADA|ASN|NEJM|JAMA|BMJ|PMID|DOI|ХСН|ФП|ИБС|ОКС|ЧКВ|АКШ|ХБП|HFPEF|HFREF|HFMREF|SGLT2|GLP-1|LDL|PCSK9|NOAC|DOAC|TAVI|PCI|CABG|MRI|CT|ECG|COVID-19)$/iu;

/**
 * The trial a question names by its acronym («DAPA-HF», «EMPEROR-Preserved», «PARADIGM-HF»): a hyphenated Latin
 * name with capitals, or an all-capitals word of four letters or more next to «исследование» / «trial».
 */
export function trialNameIn(question: string): string | null {
  const hyphenated = question.match(/(?<![\p{L}\p{N}])[A-Z][A-Z0-9]{1,}(?:-[A-Za-z0-9]+)+(?![\p{L}\p{N}])/u)?.[0];
  if (hyphenated && !NOT_A_TRIAL.test(hyphenated)) return hyphenated;
  if (!/исследовани|trial|РКИ/iu.test(question)) return null;
  const capitals = [...question.matchAll(/(?<![\p{L}\p{N}])[A-Z]{4,}[0-9]*(?![\p{L}\p{N}])/gu)].map(match => match[0]).find(word => !NOT_A_TRIAL.test(word));
  return capitals ?? null;
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/gu, "");

/** Titles of secondary, pooled or subgroup analyses of a trial (R1 A round 2: DAPA-HF and DELIVER pooled). */
export const SECONDARY_ANALYSIS = /\b(?:post[- ]?hoc|secondary|pooled|participant[- ]level|patient[- ]level|sub-?analys[ie]s|subgroups?|insights? from|analys[ie]s (?:of|from)|meta-analys[ie]s|prespecified|pre-specified|exploratory|trials\b)/iu;

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
  // A value saved as a piece of a sentence («) by 17%…», «94) to a similar extent») is shown as an empty field.
  const whole = (value: string | null | undefined) => value && !isFragment(value) ? value : null;
  const conclusionText = whole(text(result.attributes["authorsConclusion.text"]));
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
    endpoint: whole(normalized?.fields.endpoint?.value),
    population: populationLine(normalized),
    comparison: comparisonLine(normalized),
    followUp: whole(normalized?.fields.followUp?.value),
    conclusion: conclusionText ? { text: conclusionText, label: text(result.attributes["authorsConclusion.label"]) ?? "Вывод авторов" } : null,
    links: linksFor(result),
    verification: weakest(result.evidence.map(item => item.verificationStatus)),
    verificationLabel: result.evidence.length ? verificationLabelFor(weakest(result.evidence.map(item => item.verificationStatus)) ?? "UNKNOWN", result.evidence).label : null,
    verificationTone: result.evidence.length ? verificationLabelFor(weakest(result.evidence.map(item => item.verificationStatus)) ?? "UNKNOWN", result.evidence).tone : null,
    outsideApprovedList: result.attributes.journalOutsideApprovedList === true,
    internalHref: internal,
  };
}

/** The run's own ranking decides the order; how deeply a record was read only breaks ties. */
function depth(study: StudyDigest): number {
  return study.effect ? 0 : study.conclusion ? 1 : study.access && study.access !== "unavailable" ? 2 : 3;
}

const NOT_ADVICE = "Продукт не превращает их в рекомендацию и не подбирает лечение: применимость к вашей практике оценивает врач, сверяясь с клиническими рекомендациями.";

/** How to read the result, for what was actually read: no «если тексты прочитаны» when none were. */
function practiceFor(read: number): string {
  return read
    ? `Выводы авторов приведены выше на языке оригинала. ${NOT_ADVICE}`
    : `Тексты статей не читались, поэтому выводов авторов здесь нет — они в самих статьях по ссылкам. ${NOT_ADVICE.replace("превращает их", "превращает найденное")}`;
}

/**
 * The conditions a review searched by, built as the research run builds its PubMed term: the question's
 * topics and recognised concepts (concepts are dropped when the run widened the search to its topics).
 * Words the search did not use are named, as in the reference answer.
 */
const fold = (text: string) => text.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");

export function researchConditions(run: AgentRun): { conditions: string[]; unmatched: string[] } {
  const question = run.input.text ?? "";
  if (!question.trim()) return { conditions: [], unmatched: [] };
  // A widened search and a skipped PubMed («Только РФ», «Только клинрекомендации») did not use the concepts: the catalog is searched by topic.
  // PubMed skipped, excluded or down: the catalog is searched by topic, so the concepts were not used either, nor were Latin words.
  const pubmedUnused = (run.toolsUsed ?? []).some(use => use.tool === "searchPubmed" && (/PubMed пропущен/u.test(use.note ?? "") || use.status === "unavailable" || use.status === "failed"));
  const widened = pubmedUnused || (run.plan ?? []).some(step => /Расширили поиск в PubMed до тем вопроса/u.test(step.label));
  const questionTopics = topicsMentioned(run.specialty, question);
  const topicTerms = questionTopics.map(id => topicById(run.specialty, id)?.pubmed ?? "");
  // A concept that is a question topic under another name («ХБП» and the topic «Хроническая болезнь почек») is that topic;
  // a compound topic («Кардиоренальные связи»: CKD AND cardiovascular) is not.
  const conceptParts = (concept: PubmedConcept) => concept.term.split(" OR ").map(part => part.trim());
  const topicNames = topicLabels(run.specialty, questionTopics).map(name => fold(name).split(/\s+/u));
  const sameAsTopic = (concept: PubmedConcept) => topicTerms.some(term => term && !/ AND /u.test(term) && term.split(" OR ").every(part => conceptParts(concept).includes(part.trim())))
    // «ИИ» inside the topic «ИИ в кардиологии» is that topic.
    || topicNames.some(words => fold(concept.label).split(/\s+/u).every(word => words.includes(word)));
  // The concept whose words chose a question topic is searched by that topic when PubMed is not used — only when the topic's
  // own term covers it («ХБП» in «Кардиоренальные связи»), not a broader topic («антикоагулянты» → «Фибрилляция предсердий»).
  const behindTopic = (concept: PubmedConcept) => (fold(question.normalize("NFKC")).match(new RegExp(concept.match.source, "gu")) ?? [])
    .some(text => topicsMentioned(run.specialty, text).some(id => questionTopics.includes(id)
      && (conceptParts(concept).some(part => fold(topicById(run.specialty, id)?.pubmed ?? "").includes(fold(part)))
        // or the topic is named by the concept itself («беременность» → «Ведение беременности»).
        || fold(topicById(run.specialty, id)?.label ?? "").split(/\s+/u).some(word => fold(concept.label).split(/\s+/u).some(own => own.length >= 6 && word.slice(0, own.length - 2) === own.slice(0, own.length - 2))))));
  // The run's query takes at most 4 concepts; the rest were not searched and are named.
  const searched = pubmedConceptsIn(question).filter(concept => !sameAsTopic(concept));
  const all = pubmedConceptsIn(question, Infinity).filter(concept => !sameAsTopic(concept));
  const label = (concept: PubmedConcept) => conditionLabel(concept.label);
  const labels = [...topicLabels(run.specialty, questionTopics), ...(widened ? [] : searched.map(concept => concept.label))].map(conditionLabel);
  const conditions = labels.filter((item, index) => labels.findIndex(other => fold(other) === fold(item)) === index);
  // A widened search dropped the recognised concepts («пожилые пациенты», «антикоагулянты»): they are named, not presumed used.
  // Written as in «Искали по», so the two lists read alike.
  const used = (concept: PubmedConcept) => (!widened && searched.includes(concept)) || (pubmedUnused && behindTopic(concept));
  // Named in the physician's own words when the concept's name is not theirs («апиксабан», not «антикоагулянты»):
  // the words it matched, with an adjective written right before («катетерная аблация») and the words of the same
  // phrase after it («изоляция лёгочных вен»), without an unpaired bracket («ТИА», not «ТИА)»).
  const written = (concept: PubmedConcept): string[] => {
    const source = question.normalize("NFKC");
    const words = fold(concept.label).split(/\s+/u).filter(word => word.length >= 4);
    if (words.some(word => fold(source).includes(word.slice(0, Math.max(4, word.length - 3))))) return [label(concept)];
    const matches = [...fold(source).matchAll(new RegExp(concept.match.source, "gu")), ...(concept.cased ? [...source.matchAll(new RegExp(concept.cased.source, "gu"))] : [])];
    const found = matches.map(match => {
      let start = match.index ?? 0;
      let end = start + match[0].length + (source.slice(start + match[0].length).match(/^[\p{L}\p{N}()-]*/u)?.[0].length ?? 0);
      // Before the concept: only an adjective in agreement with it («катетерная аблация»), never a noun («ведение») or a comparative («безопаснее»).
      const before = source.slice(0, start).match(/(\p{L}{3,}(?:ая|яя|ое|ые|ый|ий))\s+$/u);
      if (before && !/^(?:старше|младше|моложе|[0-9])/u.test(fold(match[0]))) start -= before[0].length;
      // After the concept: only the noun its last adjective belongs to («изоляция лёгочных» + «вен»), never a verb or a comparison.
      const last = source.slice(start, end).split(/\s+/u).at(-1) ?? "";
      const after = /(?:ых|их|ой|ей|ого|его|ая|ое|ые|ий|ый)$/u.test(last) ? source.slice(end).match(/^\s+(?!(?:при|у|с|со|для|на|в|во|по|и|или|после|до|от|без|к|о|об|за|более|менее|выше|ниже|против)(?![\p{L}]))\p{Ll}{3,}(?![\p{L}])/u)?.[0] ?? "" : "";
      end += after.length;
      let text = source.slice(start, end).replace(/[-(]+$/u, "");
      // An unpaired bracket belongs to the sentence, not to the words («(ТИА):» → «ТИА»).
      if ((text.match(/\)/gu) ?? []).length > (text.match(/\(/gu) ?? []).length) text = text.replace(/\)+$/u, "");
      if ((text.match(/\(/gu) ?? []).length > (text.match(/\)/gu) ?? []).length) text = text.replace(/^\(+/u, "");
      // Case word by word: abbreviations and Latin as written, other words in lower case («дозирование ПОАК»).
      return text.split(/(\s+)/u).map(word => /[A-Za-z]|\p{Lu}.*\p{Lu}/u.test(word) ? word : word.toLocaleLowerCase("ru-RU")).join("");
    });
    // «Транзиторная ишемическая атака (ТИА)»: the abbreviation of a phrase named beside it is that phrase.
    const initials = (text: string) => text.split(/\s+/u).map(word => word[0] ?? "").join("").toLocaleUpperCase("ru-RU");
    const unique = [...new Set(found)].filter(item => !(/^\p{Lu}{2,6}$/u.test(item) && found.some(other => other !== item && initials(other) === item)));
    return unique.length ? unique : [label(concept)];
  };
  const dropped = all.filter(concept => !used(concept)).flatMap(written).filter(item => !conditions.some(condition => fold(condition) === fold(item)));
  // A word is known when the review accounts for it: its topics and the concepts it searched or names above, including
  // the words of a multi-word key or concept matched on the whole question («искусственный интеллект», «минералокортикоидных»).
  const normalized = question.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
  const matchedParts = [
    // Only the keys that matched the question («митральн», not «аортальн стеноз» of the same topic).
    ...questionTopics.flatMap(id => topicById(run.specialty, id)?.keywords ?? [])
      .map(keyword => keyword.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е").split(" "))
      .filter(parts => parts.every(part => normalized.includes(part)))
      .flat(),
    ...pubmedConceptsIn(question, Infinity).flatMap(concept => (normalized.match(new RegExp(concept.match.source, "gu")) ?? []).flatMap(text => text.split(/[^\p{L}\p{N}-]+/u))),
  ].filter(part => part.length >= 4 || /^[a-z]+$/u.test(part));
  const known = (word: string) => {
    const value = word.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
    // A word's own topic counts only if it survives in the whole question («гипертензия» in «лёгочная гипертензия» is not АГ).
    // A concept counts by what it matched in the whole question, not by the word alone («гипогликемические препараты»).
    return topicsMentioned(run.specialty, word).some(id => questionTopics.includes(id)) || matchedParts.some(part => part.length >= 4 ? value.includes(part) : value === part);
  };
  const named = unmatchedWords(question, [...conditions, ...dropped], run.specialty, known, { latinSearched: !pubmedUnused });
  // A dropped concept already inside a named phrase («апиксабан» in «апиксабан 2,5 мг», «старше 75» in «старше 75 лет») is named once.
  // Each word is named once: a dropped concept inside a named phrase, or a named phrase inside a dropped concept, is dropped.
  const within = (inner: string, outer: string) => ` ${fold(outer)} `.includes(` ${fold(inner)} `);
  const kept = dropped.filter((item, index) => !named.some(phrase => within(item, phrase)) && !dropped.some((other, at) => at !== index && other !== item && within(item, other)));
  return { conditions, unmatched: [...kept, ...named.filter(phrase => !kept.some(item => item !== phrase && within(phrase, item)))] };
}

export function buildResearchAnswer(run: AgentRun, results: readonly AgentResultView[]): ResearchAnswer {
  const question = run.input.text ?? "";
  const identifiers = studyIdentifiersIn(question);
  const named = hasStudyIdentifiers(identifiers);
  const pubmedUse = run.toolsUsed.find(use => use.tool === "searchPubmed");
  const pubmedDown = Boolean(pubmedUse && pubmedUse.status !== "ok" && pubmedUse.status !== "partial");
  const organic = results.filter(result => !result.partner);
  const ranked = [...organic].sort((a, b) => a.rank - b.rank);
  // The works that name what the question asks («left main», PCI, CABG) come first, trials and meta-analyses before
  // registries among them: the first cards answer the question (R1 round 3, A №3).
  const asked = named ? [] : pubmedConceptsIn(question);
  const askedWords = asked.map(concept => ({ concept, words: [...concept.term.replace(/\[[a-z]+\]/giu, " ").replace(/\b(?:AND|OR|NOT)\b/gu, " ").matchAll(/"([^"]+)"|([A-Za-z][A-Za-z0-9-]{2,})/gu)].map(match => (match[1] ?? match[2]).toLowerCase()) }));
  const coverage = (study: StudyDigest) => {
    const text = `${study.title} ${study.conclusion?.text ?? ""}`;
    const lower = text.toLowerCase();
    return askedWords.filter(({ concept, words }) => words.some(word => lower.includes(word)) || concept.match.test(fold(text))).length;
  };
  const strongDesign = (study: StudyDigest) => /метаанализ|систематическ|РКИ/u.test(study.design ?? "") ? 0 : 1;
  const digests = ranked.map(result => ({ digest: studyDigest(result), rank: result.rank }))
    .sort((a, b) => a.rank - b.rank || depth(a.digest) - depth(b.digest))
    .map((entry, order) => ({ digest: entry.digest, order, covered: askedWords.length > 1 ? coverage(entry.digest) : 0 }))
    .sort((a, b) => b.covered - a.covered || (askedWords.length > 1 ? strongDesign(a.digest) - strongDesign(b.digest) : 0) || a.order - b.order)
    .map(entry => entry.digest);

  if (run.status === "blocked") {
    return { kind: "blocked", headline: "Запрос остановлен проверкой безопасности: продукт не разбирает данные конкретного пациента и не назначает лечение.", studies: [], trust: [], practice: practiceFor(0), limitations: [...run.riskNotices], totalFound: 0 };
  }

  const read = digests.filter(study => study.access === "full_text" || study.access === "abstract");
  const search = named ? { conditions: [], unmatched: [] } : researchConditions(run);
  const pubmedCount = organic.filter(result => result.source.connectorId === "pubmed").length;
  const catalogCount = organic.length - pubmedCount;
  const fullText = read.filter(study => study.access === "full_text").length;
  const withEffect = digests.filter(study => study.effect).length;
  const withEvidence = organic.filter(result => result.evidence.length);
  const citationOnly = withEvidence.filter(result => isBibliographicOnly(result.evidence));
  // A citation is checked when its label says so («Сверены данные публикации», with or without the journal's standing).
  const citationChecked = citationOnly.filter(result => verificationLabelFor(weakest(result.evidence.map(item => item.verificationStatus)) ?? "UNKNOWN", result.evidence).label.startsWith("Сверены данные публикации")).length;
  const outsideList = organic.filter(result => outsideApprovedList(result.evidence)).length;
  const quoted = withEvidence.filter(result => !isBibliographicOnly(result.evidence));
  const quotedLabel = (result: AgentResultView) => verificationLabelFor(weakest(result.evidence.map(item => item.verificationStatus)) ?? "UNKNOWN", result.evidence);
  const quotedMatched = quoted.filter(result => matchedSource(weakest(result.evidence.map(item => item.verificationStatus)) ?? "UNKNOWN", result.evidence)).length;
  // The checks still needed, as the labels name them («версию сверьте — 3», «карточка по документу — сверьте с полным текстом — 2»).
  const checkCounts = new Map<string, number>();
  for (const result of quoted) for (const check of quotedLabel(result).label.split(" · ").slice(1)) checkCounts.set(check, (checkCounts.get(check) ?? 0) + 1);
  const quotedChecks = [...checkCounts.entries()].map(([check, count]) => `${check}: ${count}`);
  const designCounts = new Map<string, number>();
  for (const study of digests) {
    const design = primaryDesign(study.design);
    if (design) designCounts.set(design, (designCounts.get(design) ?? 0) + 1);
  }
  const designs = [...designCounts.entries()].map(([design, count]) => `${design} — ${count}`);

  const trust = [
    designs.length ? `Дизайн: ${designs.join(", ")}.` : null,
    read.length ? `Прочитано: ${fullText ? `полный текст — ${fullText}` : ""}${fullText && read.length - fullText ? ", " : ""}${read.length - fullText ? `только аннотация — ${read.length - fullText}` : ""}.${withEffect ? " Цифры эффекта взяты из этого текста, у каждой есть цитата." : ""}` : null,
    // What was checked, in its own terms: citations against PubMed, quotes against the text; the journal's standing is said apart.
    citationOnly.length ? `Данные публикации сверены с PubMed — ${citationChecked} из ${citationOnly.length}${outsideList ? `; журнал вне списка, одобренного врачами, — ${outsideList}` : ""}.` : null,
    quoted.length ? `Текст совпадает с источником — ${quotedMatched} из ${quoted.length}${quotedChecks.length ? `; ${quotedChecks.join("; ")}` : ""}.` : null,
    citationOnly.length && quoted.length ? "Это сверка ссылок и текста, а не оценка качества исследования." : citationOnly.length ? "Это сверка ссылок, а не оценка качества исследования." : quoted.length ? "Это сверка текста с источником, а не оценка качества исследования." : null,
  ].filter((value): value is string => Boolean(value));

  // Journals set to «Не использовать»: what was withheld, or that a named publication comes from one.
  // Journals kept out of the search are named even when nothing was hidden after it (R1 B round 2 N-5).
  const journalNotes = !pubmedDown ? (pubmedUse?.note?.split("; ").filter(part => /исключённых в ваших источниках|журнал исключён в вашем профиле|исключены в вашем профиле и в поиск не входили/u.test(part)) ?? []) : [];
  const keptOut = journalNotes.find(part => /в поиск не входили/u.test(part));
  const journalLines = journalNotes.map(part => part === keptOut ? `В поиск не входили журналы, исключённые в вашем профиле: ${part.replace(/^.*?:\s*/u, "")}.` : `${part[0].toLocaleUpperCase("ru-RU")}${part.slice(1)}.`);
  const limitations = [
    pubmedDown ? `PubMed: ${(pubmedUse?.note ?? "недоступен во время запуска").replace(/^PubMed\s+/u, "")}.` : null,
    ...journalLines,
    read.length && read.length === read.filter(study => study.access === "abstract").length ? "Полных текстов в открытом доступе нет: прочитаны только аннотации." : null,
    read.length > withEffect ? `Для ${countLabel(read.length - withEffect, ["публикации", "публикаций", "публикаций"])} величина эффекта в тексте не найдена — поле оставлено пустым.` : null,
    digests.some(study => study.outsideApprovedList) ? "Журнала нет в списке, проверенном врачами: качество источника оцените сами." : null,
    !named && organic.some(result => result.source.connectorId === "pubmed") ? `Поиск в PubMed ограничен журналами, проверенными врачами${outsideList ? ", и журналами источников с «Приоритетом» в профиле — у новых профилей он стоит по умолчанию (они помечены «журнал не из списка врачей-экспертов»)" : ""}, и шестью самыми подходящими статьями${organic.some(result => result.source.connectorId !== "pubmed") ? "; остальные находки — из каталога специальности" : ""}.` : null,
    read.length ? "Выводы авторов приводятся на языке оригинала, перевода нет." : null,
  ].filter((value): value is string => Boolean(value));

  if (pubmedDown && !organic.length) {
    // The note says why: excluded in the physician's sources, switched off, or no answer from NCBI.
    const note = pubmedUse?.note ?? "";
    const excluded = /исключ/u.test(note);
    // The review's own filters cannot turn PubMed back on: only the profile can, and the link goes there.
    const headline = excluded
      ? `PubMed исключён в вашем профиле, поэтому разбор по PubMed не выполнялся${named ? ` (${describeStudyIdentifiers(identifiers)})` : ""}. Включите его в источниках профиля.`
      : `PubMed не ответил${note ? ` (${note.replace(/\.$/u, "")})` : ""}, поэтому разбор не выполнен${named ? ` (${describeStudyIdentifiers(identifiers)})` : ""}. Повторите запрос позже.`;
    // The catalog was still searched by the question's topics: say by what.
    return { kind: "unavailable", headline, studies: [], trust: [], practice: practiceFor(read.length), limitations: limitations.filter(line => !line.startsWith("PubMed:")), totalFound: 0, ...(excluded ? { sourcesLink: true } : {}), ...(named ? {} : { conditions: search.conditions, unmatched: search.unmatched }) };
  }
  if (named) {
    const asked = describeStudyIdentifiers(identifiers);
    if (!organic.length) {
      const skipped = pubmedUse?.status === "ok" && pubmedUse.note?.startsWith("PubMed пропущен");
      return { kind: "not_found", headline: skipped ? `${pubmedUse?.note}: публикацию (${asked}) не искали.` : `В PubMed нет публикации по ${asked}. Проверьте идентификатор или вставьте ссылку на статью в PubMed.`, studies: [], trust, practice: practiceFor(0), limitations, totalFound: 0 };
    }
    const study = digests[0];
    const result = study.effect ? `Основной результат по тексту статьи: ${study.effect}.` : study.conclusion ? "Величину эффекта в тексте найти не удалось — ниже вывод авторов." : "Текст статьи прочитать не удалось — доступны только данные PubMed.";
    return { kind: "study", headline: `${study.design ? `${study.design[0].toLocaleUpperCase("ru-RU")}${study.design.slice(1)}, ` : ""}${study.journal}${study.year ? `, ${study.year}` : ""}. ${result}`, studies: digests.slice(0, 4), trust, practice: practiceFor(read.length), limitations, totalFound: organic.length };
  }
  if (!organic.length) {
    const noTopic = pubmedUse?.status === "partial" && /Нет тем/u.test(pubmedUse.note ?? "");
    // The review's own filters skipped every search: that is the reason, not the question's wording (R1 round 3, B N3-2).
    const skipped = run.toolsUsed.filter(use => (use.tool === "searchPubmed" || use.tool === "searchMedical") && /пропущен/u.test(use.note ?? "")).map(use => (use.note ?? "").replace(/\.$/u, ""));
    const searchedSomewhere = run.toolsUsed.some(use => (use.tool === "searchPubmed" || use.tool === "searchMedical") && (use.status === "ok" || use.status === "partial") && !/пропущен/u.test(use.note ?? ""));
    const headline = noTopic
      ? "Не удалось понять тему вопроса: в PubMed не искали, в каталоге специальности совпадений нет. Назовите заболевание, вмешательство или сравнение, например «ПОАК у пожилых с фибрилляцией предсердий», или вставьте PMID статьи."
      : skipped.length && !searchedSomewhere
        ? `Поиск не выполнялся: ${skipped.join("; ")}. Смените фильтры «Источники» и «Тип» над вопросом, чтобы искать.`
        : "По вопросу ничего не нашлось в выбранных источниках. Уточните заболевание, вмешательство или сравнение, либо расширьте фильтры «Источники» и «Тип» над вопросом.";
    // With nothing found the physician still sees what was searched and what was not («ХСН», not «СНнФВ»).
    return { kind: "not_found", headline, studies: [], trust, practice: practiceFor(0), limitations, totalFound: 0, ...(noTopic ? {} : { conditions: search.conditions, unmatched: search.unmatched }) };
  }
  // The topic search is limited to a list of journals: the first thing read names them.
  const journals = (run.plan ?? []).map(step => step.detail?.match(SEARCHED_JOURNALS)?.[1]?.trim()).find(Boolean) ?? null;
  const journalLine = journals && pubmedCount ? ` Искали в журналах: ${journals}.` : "";
  // The named trial is not among the found titles: say so first, with the way to get it (PMID or DOI search any journal).
  const trial = trialNameIn(question);
  // A secondary or pooled analysis that names the trial («…from the DAPA-HF and DELIVER trials») is not its main publication.
  if (trial && !digests.some(study => squash(study.title).includes(squash(trial)) && !SECONDARY_ANALYSIS.test(study.title))) {
    const headline = `Основную публикацию «${trial}» не нашли: поиск по теме идёт только в журналах из списка${journals ? ` (${journals})` : ""}. Вставьте PMID или DOI — по ним ищем в любом журнале. Ниже — работы шире вопроса.`;
    return { kind: "question", headline, studies: digests.slice(0, 3), trust, practice: practiceFor(read.length), limitations, totalFound: organic.length, conditions: search.conditions, unmatched: search.unmatched, broader: true };
  }
  // A drug the question names («апиксабан», «варфарин») that no found work names in its title or conclusion: no direct answer.
  const askedDrugs = compileIntent(question, run.specialty).entities.drugs;
  const namesDrugs = (study: StudyDigest) => { const words = `${study.title} ${study.conclusion?.text ?? ""} ${study.effectQuote ?? ""}`.toLowerCase(); return askedDrugs.every(drug => words.includes(drug.inn.toLowerCase()) || words.includes(drug.ru.toLowerCase())); };
  if (askedDrugs.length && pubmedCount && !digests.some(namesDrugs)) {
    const headline = `Прямого ответа не нашлось: ни одна найденная работа не называет ${askedDrugs.map(drug => `«${drug.ru}»`).join(" и ")} в названии или выводе.${journalLine} Ниже — работы шире вопроса, их цифры к вопросу не относятся.`;
    return { kind: "question", headline, studies: digests.slice(0, 3), trust, practice: practiceFor(read.length), limitations, totalFound: organic.length, conditions: search.conditions, unmatched: search.unmatched, broader: true };
  }
  const headline = [
    `Нашли ${[pubmedCount ? countLabel(pubmedCount, ["публикацию PubMed", "публикации PubMed", "публикаций PubMed"]) : null, catalogCount ? countLabel(catalogCount, ["материал каталога", "материала каталога", "материалов каталога"]) : null].filter(Boolean).join(" и ")} ${search.unmatched.length ? "по условиям поиска — не по всему вопросу" : "по вопросу"}.${journalLine}`,
    read.length ? `Прочитали ${read.length}${withEffect ? `, величина эффекта указана в ${withEffect}` : ", величину эффекта в тексте найти не удалось"}.` : pubmedDown ? (/исключ/u.test(pubmedUse?.note ?? "") ? "PubMed исключён в вашем профиле: ниже только материалы каталога специальности." : "PubMed не ответил: ниже только материалы каталога специальности.") : (!organic.some(result => result.source.connectorId === "pubmed") ? "Ниже только материалы каталога специальности." : organic.some(result => result.source.connectorId !== "pubmed") ? "Тексты публикаций не читались — ниже только данные PubMed и каталога." : "Тексты публикаций не читались — ниже только данные PubMed."),
  ].join(" ");
  return { kind: "question", headline, studies: digests.slice(0, 3), trust, practice: practiceFor(read.length), limitations, totalFound: organic.length, conditions: search.conditions, unmatched: search.unmatched };
}
