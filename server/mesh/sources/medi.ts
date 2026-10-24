import type { SpecialtyId } from "@/lib/domain/types";
import { NOSOLOGIES, nosologyById, subtypeById, titleMatchesNosology, type NosologyNode } from "@/lib/mesh/domain-graph";
import type { EntityRef, NormalizedClaim, NormalizedDocument, SemanticChunk, SourceResult } from "@/lib/mesh/evidence";
import type { NormalizedIntent } from "@/lib/mesh/intent";
import type { SourceDescriptor, SourceStatusReport } from "@/lib/mesh/sources";
import { normalizeQuery, type DrugEntry } from "@/lib/portal/lexicon";
import { absoluteUrl, excerpt, findAll, parseDocument, requireOne, sectionText, sentences, textOf, type DomDocument, type DomElement } from "../browser/dom";
import { HttpDriver, selectDriver, type BrowserDriver, type PageSnapshot } from "../browser/drivers";
import { isSourceToolError, SourceToolError } from "../browser/errors";
import { BrowserSourceTool, type Extractor, type OpenedPage, type SiteProfile } from "../browser/tool";
import { combineFingerprints } from "../fingerprint";
import { coverageOf, drugEntity, emptyResult, invocation, makeChunk, makeClaim, nosologyEntity, polarityOf, subtypeEntity, verifyQuote } from "./common";
import type { SourceAdapter, SourceRequest } from "./types";

/**
 * MEDI (medi.ru) — first browser-capable Russian professional source.
 *
 * What MEDI is for the product: a professional (not official) publisher of
 * Russian instructions «по ГРЛС» and of Minzdrav clinical recommendations,
 * intended for healthcare professionals. Everything taken from it is a
 * secondary copy and is labelled so; official status is checked in ГРЛС and
 * the rubricator (hand-offs).
 *
 * Access rules honoured here (checked 2026-10-21):
 *  - robots.txt disallows /search, /autoload/, /user … for all agents, so the
 *    site's own search is never automated. Recipes use deterministic,
 *    robots-allowed entry pages instead: /analogi-mnn/<inn>/ (INN pages) and
 *    /filters/doc_type/manuals/<specialty>/ (guideline catalogues).
 *  - The terms say the content is for healthcare professionals and is
 *    verbatim instructions/monographs. They grant no reuse licence, so only
 *    short attributed excerpts are kept (never whole pages), every claim links
 *    to its page, and the question of an agreement stays open.
 *
 * Execution is replaceable: today a real browser (or HTTP when none can
 * start); tomorrow an API or another source — downstream sees the same
 * normalized documents. Any change in page structure fails explicitly as
 * `layout_changed`; nothing is guessed.
 */

const ORIGIN = "https://medi.ru";
const EXTRACTOR_VERSION = "2026-10-21";
const MAX_EXCERPT = 700;

export const MEDI_DESCRIPTOR: SourceDescriptor = {
  id: "medi",
  name: "МЕДИ РУ (medi.ru)",
  connectorId: "medi",
  domains: ["drug", "inn", "disease", "guideline", "article"],
  specialties: "all",
  jobs: ["drug_reference", "drug_comparison", "inn_lookup", "disease_reference", "guideline_check", "guideline_discovery", "professional_article_search", "reference_answer", "source_positions"],
  provides: ["russian_drug_reference", "product_listing", "russian_guideline", "professional_article"],
  operations: ["drug_reference", "inn_lookup", "disease_reference", "guideline_discovery", "professional_article_search"],
  authority: "professional",
  execution: "browser",
  freshnessPolicy: { kind: "versioned", reverifyAfterHours: 24 * 7, note: "Инструкции и рекомендации меняются редко: страница перечитывается не чаще раза в 6 часов, а изменения определяются по отпечаткам разделов" },
  cachePolicy: { scope: "knowledge_store", ttlSeconds: 6 * 3600 },
  usagePolicy: {
    robots: {
      url: `${ORIGIN}/robots.txt`,
      checkedAt: "2026-10-21",
      disallow: ["/user", "/auth", "/search", "/subscribe", "/medi/", "/autoload/", "/include/promo/", "/include/cat_incl/", "/include/cat_teaser/", "/*category_subscribe", "/*category_unsubscribe", "/*add_topic", "/*topic_subscribe", "/*topic_unsubscribe", "/*add_comment"],
    },
    terms: { url: `${ORIGIN}/info/terms-of-use_12754/`, checkedAt: "2026-10-21", summary: "Информация предназначена исключительно для специалистов здравоохранения; размещены дословные тексты инструкций и монографий; официальная информация — в листке-вкладыше; права на переиспользование не предоставлены" },
    audience: "healthcare_professionals",
    reuse: "excerpt_with_attribution",
    maxExcerptChars: MAX_EXCERPT,
    attributionRequired: true,
    rateLimitPerMinute: 60,
    agreement: "none",
    jurisdiction: "RU",
    openQuestions: [
      "Нужно ли соглашение с редакцией МЕДИ РУ на автоматическое чтение страниц и показ коротких цитат с атрибуцией",
      "Допустим ли показ выдержек анонимным посетителям: сайт адресован только специалистам здравоохранения, а верификации врача в продукте пока нет",
      "Можно ли хранить отпечатки разделов и короткие выдержки для отслеживания изменений (без копии страниц)",
      "medi.ru отсутствует в листе валидации источников врачами — требуется решение медицинских тренеров",
    ],
  },
  cost: 2,
  handoffUrl: `${ORIGIN}/`,
};

export const MEDI_SITE: SiteProfile = {
  id: "medi",
  origin: ORIGIN,
  robots: MEDI_DESCRIPTOR.usagePolicy.robots!,
  allowedPathPrefixes: ["/analogi-mnn/", "/instrukciya/", "/klinicheskie-rekomendatsii/", "/filters/doc_type/manuals/"],
  userAgent: "KardioSourceBot/0.1 (professional portal for physicians; source adapter)",
  minIntervalMs: 1000,
  cacheTtlSeconds: 6 * 3600,
  timeoutMs: 20_000,
  maxPagesPerInvocation: 6,
};

/* ---------------------------------------------------------------- */
/* Entry points                                                      */
/* ---------------------------------------------------------------- */

/** INN spelling differences between the lexicon (USAN/English) and MEDI's INN pages. null = no unambiguous page. */
const INN_SLUG_EXCEPTIONS: Record<string, string | null> = {
  acetaminophen: "paracetamol",
  albuterol: "salbutamol",
  aspirin: "acetylsalicylic-acid",
  methimazole: "thiamazole",
  levothyroxine: "levothyroxine-sodium",
  onabotulinumtoxinA: "botulinum-toxin",
  "insulin glargine": null,
  "insulin degludec": null,
  "insulin aspart": null,
  "insulin lispro": null,
};

export function mediInnSlug(inn: string): string | null {
  if (inn in INN_SLUG_EXCEPTIONS) return INN_SLUG_EXCEPTIONS[inn];
  return inn.toLowerCase().trim().replace(/\s+/gu, "-");
}

/** MEDI guideline catalogue per specialty (/filters/doc_type/manuals/<slug>/). */
const SPECIALTY_FILTER: Partial<Record<SpecialtyId, string>> = {
  cardiology: "kardiologiya",
  pediatrics: "pediatriya",
  obgyn: "akuscherstvo_i_ginekologiya",
  neurology: "nevrologiya",
  endocrinology: "yendokrinologiya",
  oncology: "onkologiya",
};

/** Therapy is spread across organ catalogues on MEDI. */
const NOSOLOGY_FILTER: Record<string, string> = {
  "therapy/copd": "pulmonologiya",
  "therapy/community_acquired_pneumonia": "pulmonologiya",
};

export function guidelineCatalogueUrl(nosology: NosologyNode, specialty: SpecialtyId): string | null {
  const slug = NOSOLOGY_FILTER[nosology.id] ?? SPECIALTY_FILTER[nosology.specialty] ?? SPECIALTY_FILTER[specialty];
  return slug ? `${ORIGIN}/filters/doc_type/manuals/${slug}/` : null;
}

/* ---------------------------------------------------------------- */
/* Extractors (semantic targets; fail explicitly on layout change)   */
/* ---------------------------------------------------------------- */

const MONTHS: Record<string, string> = { янв: "01", фев: "02", мар: "03", апр: "04", мая: "05", май: "05", июн: "06", июл: "07", авг: "08", сен: "09", окт: "10", ноя: "11", дек: "12" };

export function parseMediDate(text: string): string | null {
  const match = text.match(/(\d{1,2})\s+([а-яё]{3})[а-яё]*\.?\s+(\d{4})/iu);
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : null;
}

export interface ListingItem { title: string; url: string; description: string; date: string | null }
export interface ListingPage { heading: string; items: ListingItem[]; nextUrl: string | null }

export const listingExtractor: Extractor<ListingPage> = {
  id: "medi.listing",
  version: EXTRACTOR_VERSION,
  run(document, page) {
    const heading = requireOne(document, { css: "#content h1", describe: "listing h1" }, "medi.listing", page.finalUrl);
    const tree = document.querySelector("#content .topicsTree");
    if (!tree) throw new SourceToolError("layout_changed", "medi.listing: .topicsTree", page.finalUrl);
    const items = ([...tree.querySelectorAll(".thumbnail")] as DomElement[]).map(card => {
      const link = card.querySelector("h3 a[href]");
      const captions = [...card.querySelectorAll(".caption")] as DomElement[];
      const date = textOf(card.querySelector(".msg-date"));
      return link ? { title: textOf(link), url: absoluteUrl(link.getAttribute("href")!, page.finalUrl), description: textOf(captions[1]), date: parseMediDate(date) } : null;
    }).filter((item): item is ListingItem => Boolean(item?.title));
    const next = findAll(document, { css: ".pagination a[href]", text: /Следующая/u, describe: "next page" })[0];
    const nextUrl = next && !next.closest("li")?.className.includes("disabled") ? absoluteUrl(next.getAttribute("href")!, page.finalUrl) : null;
    return { heading: textOf(heading), items, nextUrl };
  },
};

export interface InstructionSection { id: string; heading: string; text: string; html: string }
export interface InstructionPage {
  title: string;
  inn: string;
  registration: string | null;
  officialNote: string | null;
  prescription: string | null;
  sections: InstructionSection[];
  /** Indication blocks split by their bold sub-headings («Сердечная недостаточность»). */
  indications: Array<{ heading: string | null; text: string }>;
}

/** What a question about a population looks for inside a long section: renal, hepatic, age and weight adjustments. */
const POPULATION_FOCUS = /почеч|почк|клиренс|(?<![\p{L}])КК(?![\p{L}])|рСКФ|пожил|старше\s*\d|печен|масс\p{L}* тела/iu;

/** A verbatim excerpt that starts at the first sentence the question is about, when the section opens with something else. */
function focusedExcerpt(text: string, focus: RegExp | null): { text: string; truncated: boolean } {
  if (focus) {
    const at = sentences(text).find(sentence => focus.test(sentence));
    const from = at ? text.indexOf(at) : -1;
    if (from > 0) {
      // It stops before the next numbered indication («3. Лечение тромбоза…»): that text is about another condition.
      const rest = text.slice(from);
      const next = rest.slice(1).search(/\s\d{1,2}\.\s+[А-ЯЁ]/u);
      return { text: excerpt(next > 0 ? rest.slice(0, next + 1).trim() : rest, MAX_EXCERPT).text, truncated: true };
    }
  }
  return excerpt(text, MAX_EXCERPT);
}

/** Populations a question names: «беременность» may be recognised as a search concept rather than a population. */
export function populationsNamed(intent: NormalizedIntent): string[] {
  const fromConcepts = intent.entities.concepts.filter(concept => concept.id === "concept:pregnancy").map(() => "pregnancy");
  return [...new Set([...intent.context.populations, ...fromConcepts])];
}

/** Instruction sections that answer each asked section of a question (`askedSections`). */
const SECTIONS_ASKED: Readonly<Record<string, readonly string[]>> = {
  contraindications: ["contraindications"],
  indications: ["indications"],
  dosing: ["dosing"],
  interactions: ["interactions"],
  safety: ["warnings", "caution", "adverse"],
  // Renal, hepatic and age adjustments are stated under dosing and «С осторожностью»; pregnancy and children
  // sections are kept only when the question names that population.
  populations: ["dosing", "caution"],
};

const INSTRUCTION_SECTIONS: ReadonlyArray<{ id: string; match: RegExp }> = [
  { id: "indications", match: /^Показания/u },
  { id: "contraindications", match: /^Противопоказания/u },
  { id: "caution", match: /^С осторожностью/u },
  { id: "pregnancy", match: /беременност/u },
  { id: "dosing", match: /^Способ применения/u },
  { id: "adverse", match: /^Побочное действие/u },
  { id: "overdose", match: /^Передозировка/u },
  { id: "interactions", match: /^Взаимодействие/u },
  { id: "warnings", match: /^Особые указания/u },
  { id: "children", match: /у детей|детям/u },
];

function siblingsHtml(heading: DomElement): string {
  const parts: string[] = [];
  let node = heading.nextSibling as unknown as { nodeType: number; tagName?: string; outerHTML?: string; textContent: string | null; nextSibling: unknown } | null;
  while (node) {
    if (node.nodeType === 1 && /^H[1-3]$/u.test(node.tagName ?? "")) break;
    parts.push(node.nodeType === 1 ? node.outerHTML ?? "" : node.textContent ?? "");
    node = node.nextSibling as typeof node;
  }
  return parts.join("");
}

/** Split an indications section into blocks headed by bold sub-headings. */
export function indicationBlocks(html: string): Array<{ heading: string | null; text: string }> {
  const marked = html.replace(/<strong>([\s\S]*?)<\/strong>/giu, (_, inner: string) => `\n§§${inner.replace(/<[^>]+>/gu, "")}§§\n`);
  const text = marked.replace(/<br\s*\/?>/giu, " ").replace(/<\/(?:div|p|li)>/giu, " ").replace(/<[^>]+>/gu, "").replace(/&nbsp;/gu, " ").replace(/&laquo;/gu, "«").replace(/&raquo;/gu, "»").replace(/&quot;/gu, "\"").replace(/&amp;/gu, "&");
  const blocks: Array<{ heading: string | null; text: string }> = [];
  let current: { heading: string | null; text: string } = { heading: null, text: "" };
  for (const piece of text.split(/\n/u)) {
    const head = piece.match(/^§§([\s\S]*)§§$/u);
    if (head) {
      if (current.text.trim() || current.heading) blocks.push(current);
      current = { heading: head[1].replace(/\s+/gu, " ").trim(), text: "" };
    } else current.text += ` ${piece}`;
  }
  if (current.text.trim() || current.heading) blocks.push(current);
  return blocks.map(block => ({ heading: block.heading, text: block.text.replace(/\s+/gu, " ").trim() })).filter(block => block.text);
}

export const instructionExtractor: Extractor<InstructionPage> = {
  id: "medi.instruction",
  version: EXTRACTOR_VERSION,
  run(document, page) {
    const h1 = requireOne(document, { css: "#content h1", text: /инструкция по применению/iu, describe: "h1 «… — инструкция по применению»" }, "medi.instruction", page.finalUrl);
    const inn = textOf(document.querySelector('[itemprop="nonProprietaryName"]'));
    const headings = [...document.querySelectorAll("#content h3")] as DomElement[];
    // Some products (newer EAEU registrations) publish only the patient leaflet. It is a different
    // document for a different reader, not a changed layout, and is never read as an instruction.
    if (headings.some(item => /^Листок[-‐–\s]*вкладыш/iu.test(textOf(item)))) {
      throw new SourceToolError("unsupported_document", "medi.instruction: patient_leaflet", page.finalUrl);
    }
    const sections: InstructionSection[] = [];
    for (const definition of INSTRUCTION_SECTIONS) {
      const heading = headings.find(item => definition.match.test(textOf(item)));
      if (!heading || sections.some(section => section.id === definition.id)) continue;
      const html = siblingsHtml(heading);
      const text = textOf(parseDocument(`<div>${html}</div>`).querySelector("div"));
      if (text) sections.push({ id: definition.id, heading: textOf(heading), text, html });
    }
    if (!sections.some(section => section.id === "indications" || section.id === "contraindications")) {
      throw new SourceToolError("layout_changed", "medi.instruction: sections «Показания»/«Противопоказания»", page.finalUrl);
    }
    const content = textOf(document.querySelector("#content"));
    const registration = content.match(/Регистрационный номер:?\s*([А-ЯЁA-Z]{1,4}[-‐–]?\s?[\d][\d\-/()А-ЯЁA-Z.]*)/u)?.[1]?.trim() ?? null;
    const indications = sections.find(section => section.id === "indications");
    return {
      title: textOf(h1).replace(/\s*-\s*инструкция по применению\s*$/iu, ""),
      inn,
      registration,
      officialNote: textOf(document.querySelector(".offic_grls")) || null,
      prescription: textOf(document.querySelector('[itemprop="prescriptionStatus"]')) || null,
      sections,
      indications: indications ? indicationBlocks(indications.html) : [],
    };
  },
};

export interface GuidelinePage {
  title: string;
  icd10: string | null;
  year: number | null;
  reviewEveryYears: number | null;
  yearText: string | null;
  guidelineId: string | null;
  associations: string[];
  approved: string | null;
  agreed: string | null;
  sections: Array<{ path: string[]; text: string }>;
}

export const guidelineExtractor: Extractor<GuidelinePage> = {
  id: "medi.guideline",
  version: EXTRACTOR_VERSION,
  run(document, page) {
    const title = requireOne(document, { css: "#cr_title", describe: "#cr_title (guideline title)" }, "medi.guideline", page.finalUrl);
    const yearText = textOf(document.querySelector("#cr_year")) || null;
    const year = yearText?.match(/(19|20)\d{2}/u)?.[0];
    const review = yearText?.match(/кажд\p{L}*\s+(\d+)/u)?.[1];
    const headings = ([...document.querySelectorAll("#content h2, #content h3")] as DomElement[]).filter(heading => !heading.closest(".cr_title") && !/^Оглавление$/u.test(textOf(heading)));
    if (!headings.length) throw new SourceToolError("layout_changed", "medi.guideline: section headings h2/h3", page.finalUrl);
    let currentH2 = "";
    const sections: GuidelinePage["sections"] = [];
    for (const heading of headings) {
      const label = textOf(heading);
      if (!label) continue;
      if (heading.tagName === "H2") currentH2 = label;
      const text = sectionText(heading, { ownTextOnly: true });
      if (text) sections.push({ path: heading.tagName === "H2" ? [label] : [currentH2, label].filter(Boolean), text });
    }
    return {
      title: textOf(title),
      icd10: textOf(document.querySelector("#cr_mkb")) || null,
      year: year ? Number(year) : null,
      reviewEveryYears: review ? Number(review) : null,
      yearText,
      guidelineId: textOf(document.querySelector("#cr_id")) || null,
      associations: ([...document.querySelectorAll("#cr_assoc")] as DomElement[]).map(textOf).filter(Boolean),
      approved: textOf(document.querySelector("#cr_appr")) || null,
      agreed: textOf(document.querySelector("#cr_agreed")) || null,
      sections,
    };
  },
};

/* ---------------------------------------------------------------- */
/* Normalizers → documents, chunks, claims                           */
/* ---------------------------------------------------------------- */

function containsDrug(text: string, drug: DrugEntry): boolean {
  const value = normalizeQuery(text);
  return drug.stems.some(stem => value.includes(normalizeQuery(stem))) || value.includes(drug.inn.toLowerCase());
}

function quoteClaim(args: { document: Pick<NormalizedDocument, "id" | "url" | "title" | "retrievedAt" | "publishedAt">; chunk: SemanticChunk | null; kind: NormalizedClaim["kind"]; quote: string; entityIds: string[]; covers: string[]; verifyIn: string; level: "regulatory" | "guideline" }): NormalizedClaim {
  const check = verifyQuote({ connectorId: "medi", url: args.document.url, sourceName: `МЕДИ РУ · ${args.document.title}`, statement: args.quote, quote: args.quote, language: "ru", level: args.level, secondary: true, verifyIn: args.verifyIn, retrievedAt: args.document.retrievedAt, publishedAt: args.document.publishedAt });
  return makeClaim({ documentId: args.document.id, chunkId: args.chunk?.id ?? null, kind: args.kind, statement: args.quote, quote: args.quote, language: "ru", polarity: polarityOf(args.quote), entityIds: args.entityIds, covers: args.covers, method: "verbatim", confidence: 1, verification: check.verification, verificationNote: check.note });
}

export function normalizeListing(listing: ListingPage, page: PageSnapshot, drug: DrugEntry): NormalizedDocument {
  const id = `medi:${new URL(page.finalUrl).pathname}`;
  const drugRef = drugEntity(drug.inn, drug.ru);
  const products: EntityRef[] = listing.items.map(item => ({ id: `product:medi:${new URL(item.url).pathname.split("/").filter(Boolean).pop()}`, kind: "product", label: item.title, codes: { inn: drug.inn } }));
  const chunk = makeChunk({ documentId: id, path: [listing.heading], fullText: listing.items.map(item => `${item.title}: ${item.description} (${item.date ?? ""})`).join("\n"), maxChars: MAX_EXCERPT, keepText: true, entityIds: [drugRef.id, ...products.map(product => product.id)] });
  const document: NormalizedDocument = {
    id, sourceId: "medi", kind: "inn_listing", title: listing.heading, url: page.finalUrl, language: "ru", publisher: "МЕДИ РУ", publishedAt: null, retrievedAt: page.fetchedAt,
    version: { fingerprint: combineFingerprints([chunk.fingerprint]), label: null, date: null },
    jurisdiction: "RU", authority: "professional", state: "LIVE",
    attributes: { inn: drug.inn, products: listing.items.length, driver: page.driver, extractor: `${listingExtractor.id}@${listingExtractor.version}` },
    chunks: [chunk], claims: [], entities: [drugRef, ...products],
  };
  document.claims = listing.items.slice(0, 8).map((item, index) => makeClaim({
    documentId: id, chunkId: chunk.id, kind: "product_listing",
    statement: `${item.title}${item.description ? ` — ${excerpt(item.description, 160).text}` : ""}`,
    quote: item.description || item.title, language: "ru", polarity: "neutral", entityIds: [drugRef.id, products[index].id], covers: [], method: "metadata", confidence: 1,
    verification: "PARTIALLY_SUPPORTED", verificationNote: "Список МНН на МЕДИ РУ; регистрацию проверяйте в ГРЛС",
    idParts: [item.url],
  }));
  return document;
}

export function normalizeInstruction(raw: InstructionPage, page: PageSnapshot, args: { drug: DrugEntry; listingDate: string | null; nosology: NosologyNode | null; safety: readonly string[]; job: string; sections?: readonly string[]; populations?: readonly string[] }): NormalizedDocument {
  const id = `medi:${new URL(page.finalUrl).pathname}`;
  const drugRef = drugEntity(args.drug.inn, args.drug.ru);
  const product: EntityRef = { id: `product:medi:${new URL(page.finalUrl).pathname.split("/").filter(Boolean).pop()}`, kind: "product", label: raw.title, codes: { inn: args.drug.inn, ...(raw.registration ? { registration: raw.registration } : {}) } };
  const wanted = new Set(["indications", "contraindications"]);
  if (args.job === "drug_reference") { wanted.add("dosing"); wanted.add("warnings"); wanted.add("caution"); }
  // A comparison reads the same sections of every instruction, so that rows line up.
  if (args.job === "drug_comparison") for (const section of ["dosing", "warnings", "caution", "pregnancy", "children", "interactions"]) wanted.add(section);
  if (args.safety.includes("pregnancy_sections")) wanted.add("pregnancy");
  if (args.safety.includes("pediatric_sections")) wanted.add("children");
  // The sections the question names are kept, whatever the task («Апиксабан: противопоказания и взаимодействия»).
  for (const section of args.sections ?? []) for (const id of SECTIONS_ASKED[section] ?? []) wanted.add(id);
  // A named population keeps its own section («Апиксабан при беременности» → «Применение при беременности»).
  if (args.populations?.some(population => population === "pregnancy" || population === "lactation")) wanted.add("pregnancy");
  if (args.populations?.includes("children")) wanted.add("children");
  const doc: Pick<NormalizedDocument, "id" | "url" | "title" | "retrievedAt" | "publishedAt"> = { id, url: page.finalUrl, title: raw.title, retrievedAt: page.fetchedAt, publishedAt: args.listingDate };
  const chunks = raw.sections.map(section => makeChunk({ documentId: id, path: [section.heading], fullText: section.text, maxChars: MAX_EXCERPT, keepText: wanted.has(section.id), entityIds: [drugRef.id] }));
  const claims: NormalizedClaim[] = [];
  const indicationChunk = chunks[raw.sections.findIndex(section => section.id === "indications")] ?? null;
  for (const block of raw.indications) {
    const text = block.heading ? `${block.heading}. ${block.text}` : block.text;
    const quote = excerpt(text, MAX_EXCERPT).text;
    // The block heading names the indication; the body may mention other outcomes (e.g. HF hospitalisation in a diabetes indication).
    const subject = block.heading ?? text;
    const nosologyIds = args.nosology && (titleMatchesNosology(subject, args.nosology) || new RegExp(args.nosology.match.join("|"), "u").test(normalizeQuery(subject))) ? [args.nosology.id] : [];
    const entityIds = [drugRef.id, ...nosologyIds.map(nosologyId => `nosology:${nosologyId}`)];
    claims.push(quoteClaim({ document: doc, chunk: indicationChunk, kind: "indication", quote, entityIds, covers: nosologyIds.flatMap(nosologyId => coverageOf(text, nosologyId)), verifyIn: "ГРЛС (grls.rosminzdrav.ru)", level: "regulatory" }));
  }
  const KIND: Record<string, NormalizedClaim["kind"]> = { contraindications: "contraindication", caution: "warning", warnings: "warning", adverse: "warning", overdose: "warning", dosing: "dosing", pregnancy: "warning", children: "warning", interactions: "label_section" };
  raw.sections.forEach((section, index) => {
    if (section.id === "indications" || !wanted.has(section.id)) return;
    // A population question reads dosing and «С осторожностью» from the sentence about that population, not from the section's first line.
    const focus = args.sections?.includes("populations") && (section.id === "dosing" || section.id === "caution") ? POPULATION_FOCUS : null;
    claims.push(quoteClaim({ document: doc, chunk: chunks[index], kind: KIND[section.id] ?? "label_section", quote: focusedExcerpt(section.text, focus).text, entityIds: [drugRef.id], covers: [], verifyIn: "ГРЛС (grls.rosminzdrav.ru)", level: "regulatory" }));
  });
  const nosologyRef = args.nosology ? nosologyEntity(args.nosology.id) : null;
  return {
    id, sourceId: "medi", kind: "drug_instruction", title: raw.title, url: page.finalUrl, language: "ru", publisher: "МЕДИ РУ", publishedAt: args.listingDate, retrievedAt: page.fetchedAt,
    version: { fingerprint: combineFingerprints(chunks.map(chunk => chunk.fingerprint)), label: raw.registration ? `рег. № ${raw.registration}` : null, date: args.listingDate },
    jurisdiction: "RU", authority: "professional", state: "LIVE",
    attributes: { inn: args.drug.inn, innRu: raw.inn || args.drug.ru, registration: raw.registration, mediStatement: raw.officialNote, prescription: raw.prescription, driver: page.driver, extractor: `${instructionExtractor.id}@${instructionExtractor.version}`, sectionTitles: raw.sections.filter(section => wanted.has(section.id)).map(section => section.heading).join("|") },
    chunks, claims, entities: [drugRef, product, ...(nosologyRef ? [nosologyRef] : [])],
  };
}

export function normalizeGuideline(raw: GuidelinePage, page: PageSnapshot, args: { nosology: NosologyNode; subtypeId: string | null; drugs: readonly DrugEntry[]; now: Date; definition: boolean }): NormalizedDocument {
  const id = `medi:${new URL(page.finalUrl).pathname}`;
  const subtype = subtypeById(args.subtypeId);
  const nosologyRef = nosologyEntity(args.nosology.id)!;
  const subtypeRef = args.subtypeId ? subtypeEntity(args.subtypeId) : null;
  const doc = { id, url: page.finalUrl, title: raw.title, retrievedAt: page.fetchedAt, publishedAt: raw.year ? String(raw.year) : null };

  // Which sections the answer needs (only these keep text; all keep fingerprints).
  const subtypeIndex = subtype ? raw.sections.findIndex(section => subtype.sectionTerms.some(term => normalizeQuery(section.path.at(-1) ?? "").includes(term))) : -1;
  const drugIndexes = new Map<string, number[]>();
  for (const drug of args.drugs) drugIndexes.set(drug.inn, raw.sections.map((section, index) => (containsDrug(section.text, drug) ? index : -1)).filter(index => index >= 0).slice(0, 2));
  const definitionIndex = args.definition ? raw.sections.findIndex(section => /Определение/u.test(section.path.at(-1) ?? "")) : -1;
  const keep = new Set<number>([subtypeIndex, definitionIndex, ...[...drugIndexes.values()].flat()].filter(index => index >= 0));
  const chunks = raw.sections.map((section, index) => makeChunk({ documentId: id, path: section.path, fullText: section.text, maxChars: MAX_EXCERPT, keepText: keep.has(index), entityIds: [nosologyRef.id] }));

  const claims: NormalizedClaim[] = [];
  const metadata = [`«${raw.title}»`, raw.guidelineId ? `ID ${raw.guidelineId}` : null, raw.yearText ? `год утверждения: ${raw.yearText}` : null, raw.icd10 ? `МКБ-10: ${raw.icd10}` : null].filter(Boolean).join("; ");
  claims.push(makeClaim({ documentId: id, chunkId: null, kind: "guideline_metadata", statement: metadata, quote: [raw.title, raw.guidelineId, raw.yearText, raw.icd10].filter(Boolean).join(" "), language: "ru", polarity: "neutral", entityIds: [nosologyRef.id], covers: [], method: "metadata", confidence: 1, verification: "PARTIALLY_SUPPORTED", verificationNote: "Копия документа на МЕДИ РУ; действующую версию и статус проверяйте в рубрикаторе Минздрава" }));

  if (raw.year && raw.reviewEveryYears) {
    const due = raw.year + raw.reviewEveryYears;
    if (due < args.now.getUTCFullYear()) {
      claims.push(makeClaim({ documentId: id, chunkId: null, kind: "currentness", statement: `По собственному графику документа (утверждён в ${raw.year}, пересмотр каждые ${raw.reviewEveryYears} г.) пересмотр ожидался в ${due} году. Эта копия может быть не последней версией.`, quote: raw.yearText, language: "ru", polarity: "neutral", entityIds: [nosologyRef.id], covers: [], method: "rule_derived", confidence: 1, verification: "PARTIALLY_SUPPORTED", verificationNote: "Вычислено из года утверждения и периода пересмотра, указанных в документе; о новой версии здесь не утверждается" }));
    }
  }

  if (subtypeIndex >= 0 && subtype) {
    const section = raw.sections[subtypeIndex];
    const quote = excerpt(sentences(section.text).slice(0, 2).join(" "), MAX_EXCERPT).text;
    claims.push(quoteClaim({ document: doc, chunk: chunks[subtypeIndex], kind: "guideline_statement", quote, entityIds: [nosologyRef.id, ...(subtypeRef ? [subtypeRef.id] : [])], covers: [subtype.id], verifyIn: "рубрикатор клинических рекомендаций Минздрава", level: "guideline" }));
  }

  if (definitionIndex >= 0) {
    const section = raw.sections[definitionIndex];
    claims.push(quoteClaim({ document: doc, chunk: chunks[definitionIndex], kind: "guideline_statement", quote: excerpt(sentences(section.text).slice(0, 2).join(" "), MAX_EXCERPT).text, entityIds: [nosologyRef.id], covers: [], verifyIn: "рубрикатор клинических рекомендаций Минздрава", level: "guideline" }));
  }

  const entities: EntityRef[] = [nosologyRef, ...(subtypeRef ? [subtypeRef] : [])];
  for (const drug of args.drugs) {
    const drugRef = drugEntity(drug.inn, drug.ru);
    entities.push(drugRef);
    const indexes = drugIndexes.get(drug.inn) ?? [];
    if (!indexes.length) {
      claims.push(makeClaim({ documentId: id, chunkId: null, kind: "drug_not_mentioned", statement: `В тексте документа «${raw.title}»${raw.year ? ` (${raw.year})` : ""} ${drug.ru} не упоминается.`, quote: null, language: "ru", polarity: "neutral", entityIds: [drugRef.id, nosologyRef.id], covers: [], method: "absence_check", confidence: 0.9, verification: "PARTIALLY_SUPPORTED", verificationNote: "Проверено поиском по всему тексту страницы; упоминание группы препаратов под другим названием не исключено" }));
      continue;
    }
    for (const index of indexes) {
      const sentence = sentences(raw.sections[index].text).find(item => containsDrug(item, drug)) ?? raw.sections[index].text;
      claims.push(quoteClaim({ document: doc, chunk: chunks[index], kind: "guideline_statement", quote: excerpt(sentence, MAX_EXCERPT).text, entityIds: [drugRef.id, nosologyRef.id], covers: coverageOf(raw.sections[index].text, args.nosology.id), verifyIn: "рубрикатор клинических рекомендаций Минздрава", level: "guideline" }));
    }
  }

  return {
    id, sourceId: "medi", kind: "guideline", title: raw.title, url: page.finalUrl, language: "ru", publisher: "МЕДИ РУ (копия клинических рекомендаций)", publishedAt: raw.year ? String(raw.year) : null, retrievedAt: page.fetchedAt,
    version: { fingerprint: combineFingerprints(chunks.map(chunk => chunk.fingerprint)), label: [raw.guidelineId, raw.year].filter(Boolean).join(" · ") || null, date: raw.year ? String(raw.year) : null },
    jurisdiction: "RU", authority: "professional", state: "LIVE",
    attributes: { guidelineId: raw.guidelineId, year: raw.year, reviewEveryYears: raw.reviewEveryYears, icd10: raw.icd10, associations: raw.associations.join("; ") || null, approved: raw.approved, agreed: raw.agreed, driver: page.driver, extractor: `${guidelineExtractor.id}@${guidelineExtractor.version}`, sections: raw.sections.length },
    chunks, claims, entities,
  };
}

/** Pick the guideline for a nosology from a catalogue page (adult vs children vs pregnancy wording respected). */
export function chooseGuideline(items: readonly ListingItem[], nosology: NosologyNode, args: { children: boolean; pregnancy: boolean }): ListingItem | null {
  const candidates = items.filter(item => titleMatchesNosology(item.title, nosology))
    .filter(item => args.children || !/у детей|детск/iu.test(item.title))
    .filter(item => args.pregnancy || !/беременн/iu.test(item.title));
  const year = (item: ListingItem) => Number(item.title.match(/\((\d{4})\)/u)?.[1] ?? 0);
  return [...candidates].sort((a, b) => year(b) - year(a) || a.title.length - b.title.length)[0] ?? null;
}

/** Mono-component products in preference order: exact INN in parentheses, INN mentioned, then the rest. */
export function rankProducts(items: readonly ListingItem[], drug: DrugEntry): ListingItem[] {
  const ru = normalizeQuery(drug.ru);
  const mono = items.filter(item => !/\+/u.test(item.title) && !/\+/u.test(item.description));
  const pool = mono.length ? mono : [...items];
  const rank = (item: ListingItem) => (normalizeQuery(item.description).includes(`(${ru})`) ? 0 : normalizeQuery(item.description).includes(ru) ? 1 : 2);
  return pool.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(entry => entry.item);
}

/** Instruction pages tried per INN before giving up (patient leaflets are skipped, not read). */
const MAX_INSTRUCTION_ATTEMPTS = 3;
/** A comparison reads at most four instructions (lexicon MAX_DRUGS_PER_REQUEST). */
const MAX_COMPARED_DRUGS = 4;
/** Below this much time before the step deadline the next drug is not started. */
const MIN_MS_PER_DRUG = 4000;

/* ---------------------------------------------------------------- */
/* Adapter                                                           */
/* ---------------------------------------------------------------- */

export interface MediDeps {
  driver?: BrowserDriver | null;
  /** Second execution mode when the browser path hits a gateway error (default: HTTP for a real browser). */
  fallbackDriver?: BrowserDriver | null;
  /** Overrides for tests (politeness interval, budgets). */
  site?: Partial<SiteProfile>;
}

export function createMediAdapter(deps: MediDeps = {}): SourceAdapter {
  const driverPromise = (): Promise<BrowserDriver | null> => (deps.driver !== undefined ? Promise.resolve(deps.driver) : selectDriver());
  const site: SiteProfile = { ...MEDI_SITE, ...deps.site };

  async function status(): Promise<SourceStatusReport> {
    if (process.env.MEDI_DISABLED === "1") return { status: "UNAVAILABLE", reason: "MEDI отключён в окружении", execution: "browser" };
    const driver = await driverPromise();
    if (!driver) return { status: "UNAVAILABLE", reason: "Исполнение браузерных источников выключено (SOURCE_BROWSER=off)", execution: "browser" };
    // Every implemented MEDI recipe reads server-rendered pages (no JavaScript, no interaction), so HTTPS
    // fetch is a full execution mode for them, not a degraded one. A recipe that needs a real browser
    // (interaction, client rendering) would be LIMITED here — none is implemented.
    return driver.kind === "playwright"
      ? { status: "LIVE", reason: "Браузер Chromium", execution: "browser" }
      : { status: "LIVE", reason: "HTTPS-запросы к страницам, которые сервер отдаёт готовыми", execution: "http" };
  }

  async function drugReference(tool: BrowserSourceTool, request: SourceRequest, drug: DrugEntry, withInstruction: boolean): Promise<NormalizedDocument[]> {
    const slug = mediInnSlug(drug.inn);
    if (!slug) throw new SourceToolError("not_found", `inn_unmapped:${drug.inn}`);
    const listingPage = await tool.search(query => `${ORIGIN}/analogi-mnn/${encodeURIComponent(query)}/`, slug);
    if (!listingPage) return [];
    const listing = tool.extract(listingPage, listingExtractor);
    const documents = [normalizeListing(listing, listingPage.snapshot, drug)];
    if (!withInstruction) return documents;
    const candidates = rankProducts(listing.items, drug).slice(0, MAX_INSTRUCTION_ATTEMPTS);
    if (!candidates.length) return documents;
    let skipped: SourceToolError | null = null;
    for (const product of candidates) {
      const page = await tool.open(product.url);
      try {
        const raw = tool.extract(page, instructionExtractor);
        documents.push(normalizeInstruction(raw, page.snapshot, { drug, listingDate: product.date, nosology: nosologyById(request.intent.context.nosology?.id), safety: request.intent.safety, job: request.intent.job.primary, sections: request.intent.sections, populations: populationsNamed(request.intent) }));
        return documents;
      } catch (error) {
        // Only a patient leaflet moves on to the next product; a real layout change fails at once.
        if (!(isSourceToolError(error) && error.code === "unsupported_document")) throw error;
        skipped = error;
      }
    }
    throw skipped ?? new SourceToolError("not_found", "no_instruction");
  }

  /**
   * Instructions of two to four drugs for a comparison. Drugs are read one after
   * another (the site's politeness interval applies anyway); a drug is not started
   * when too little time is left, and is reported as not read instead.
   */
  async function compareInstructions(request: SourceRequest, newTool: () => BrowserSourceTool): Promise<{ documents: NormalizedDocument[]; missing: string[]; tools: BrowserSourceTool[] }> {
    const documents: NormalizedDocument[] = [];
    const missing: string[] = [];
    const tools: BrowserSourceTool[] = [];
    for (const drug of request.intent.entities.drugs.slice(0, MAX_COMPARED_DRUGS)) {
      if (request.deadlineAt && request.deadlineAt - Date.now() < MIN_MS_PER_DRUG) { missing.push(`${drug.ru} (не хватило времени)`); continue; }
      const tool = newTool();
      tools.push(tool);
      try {
        const found = await drugReference(tool, request, drug, true);
        const instruction = found.find(document => document.kind === "drug_instruction");
        if (instruction) documents.push(instruction);
        else missing.push(drug.ru);
      } catch (error) {
        // A layout change is a source failure for everyone, not a missing drug.
        if (isSourceToolError(error) && error.code === "layout_changed") throw error;
        missing.push(drug.ru);
      }
    }
    return { documents, missing, tools };
  }

  async function guideline(tool: BrowserSourceTool, request: SourceRequest, definition: boolean): Promise<NormalizedDocument[]> {
    const nosology = nosologyById(request.intent.context.nosology?.id);
    if (!nosology) throw new SourceToolError("not_found", "nosology_not_recognised");
    const catalogue = guidelineCatalogueUrl(nosology, request.intent.context.specialty);
    if (!catalogue) throw new SourceToolError("not_found", `no_catalogue:${nosology.id}`);
    const children = request.intent.context.populations.includes("children") || request.intent.context.specialty === "pediatrics" || nosology.specialty === "pediatrics";
    const pregnancy = request.intent.context.populations.includes("pregnancy") || nosology.specialty === "obgyn";
    let page: OpenedPage | null = await tool.open(catalogue);
    let chosen: ListingItem | null = null;
    for (let pageIndex = 0; page && pageIndex < 3; pageIndex += 1) {
      const listing = tool.extract(page, listingExtractor);
      chosen = chooseGuideline(listing.items, nosology, { children, pregnancy });
      if (chosen || !listing.nextUrl) break;
      page = await tool.open(listing.nextUrl);
    }
    if (!chosen) return [];
    const opened = await tool.open(chosen.url);
    const raw = tool.extract(opened, guidelineExtractor);
    return [normalizeGuideline(raw, opened.snapshot, { nosology, subtypeId: request.intent.context.subtype?.id ?? null, drugs: request.intent.entities.drugs, now: request.ctx.now, definition })];
  }

  async function execute(request: SourceRequest): Promise<SourceResult> {
    const started = Date.now();
    const report = await status();
    if (request.operation === "professional_article_search") {
      return emptyResult(request, { sourceId: "medi", outcome: "handoff", status: "HANDOFF", execution: "manual-handoff", started, errorCode: "robots_disallow:/search", note: "Поиск статей на МЕДИ РУ закрыт для автоматического доступа (robots.txt) — откройте сайт и найдите статью сами" });
    }
    if (report.status === "UNAVAILABLE") return emptyResult(request, { sourceId: "medi", outcome: "unavailable", status: "UNAVAILABLE", execution: report.execution, started, errorCode: "driver_unavailable", note: report.reason });
    const driver = (await driverPromise())!;
    const fallbackDriver = deps.fallbackDriver !== undefined ? deps.fallbackDriver : driver.kind === "playwright" ? new HttpDriver() : null;
    const tool = new BrowserSourceTool(site, driver, { fallbackDriver, deadlineAt: request.deadlineAt ?? null });
    try {
      let documents: NormalizedDocument[] = [];
      if (request.operation === "drug_reference" && request.intent.job.primary === "drug_comparison" && request.intent.entities.drugs.length > 1) {
        // Each drug is read with its own page budget; one missing instruction never hides the others.
        const compared = await compareInstructions(request, () => new BrowserSourceTool(site, driver, { fallbackDriver, deadlineAt: request.deadlineAt ?? null }));
        const visits = compared.tools.flatMap(item => item.provenance().visits);
        const degraded = report.execution === "browser" && visits.some(visit => !visit.cached && visit.driver === "http");
        const missing = compared.missing.length ? `Не прочитаны инструкции: ${compared.missing.join(", ")}` : null;
        return {
          invocation: invocation(request, { sourceId: "medi", outcome: compared.documents.length ? "ok" : "empty", status: report.status, execution: degraded ? "http" : report.execution, started, note: compared.documents.length ? missing : "Ни одной инструкции на МЕДИ РУ не нашлось", documentIds: compared.documents.map(document => document.id), urls: visits.map(visit => visit.url) }),
          documents: compared.documents,
        };
      }
      if (request.operation === "inn_lookup" || request.operation === "drug_reference") {
        const drug = request.intent.entities.drugs[0];
        if (!drug) return emptyResult(request, { sourceId: "medi", outcome: "empty", status: report.status, execution: report.execution, started, note: "Препарат в запросе не распознан" });
        documents = await drugReference(tool, request, drug, request.operation === "drug_reference");
      } else if (request.operation === "guideline_discovery" || request.operation === "disease_reference") {
        documents = await guideline(tool, request, request.operation === "disease_reference");
      } else {
        return emptyResult(request, { sourceId: "medi", outcome: "blocked", status: report.status, execution: report.execution, started, errorCode: `unsupported_operation:${request.operation}` });
      }
      const provenance = tool.provenance();
      // If any page had to be read without the browser, the execution was limited — and is reported so.
      // Pages read by the HTTP fallback are reported as an HTTP execution (provenance), still LIVE for these recipes.
      const degraded = report.execution === "browser" && provenance.visits.some(visit => !visit.cached && visit.driver === "http");
      return {
        invocation: invocation(request, { sourceId: "medi", outcome: documents.length ? "ok" : "empty", status: report.status, execution: degraded ? "http" : report.execution, started, note: documents.length ? null : "Подходящей страницы на МЕДИ РУ не нашлось", documentIds: documents.map(document => document.id), urls: provenance.visits.map(visit => visit.url) }),
        documents,
      };
    } catch (error) {
      const provenance = tool.provenance();
      if (isSourceToolError(error) && error.code === "not_found") {
        return emptyResult(request, { sourceId: "medi", outcome: "empty", status: report.status, execution: report.execution, started, errorCode: error.machineCode, note: "На МЕДИ РУ нет такой страницы", urls: provenance.visits.map(visit => visit.url) });
      }
      if (isSourceToolError(error) && error.code === "unsupported_document") {
        return emptyResult(request, { sourceId: "medi", outcome: "empty", status: report.status, execution: report.execution, started, errorCode: error.machineCode, note: "На МЕДИ РУ для этого препарата опубликован только листок-вкладыш для пациента, а не инструкция для специалиста", urls: provenance.visits.map(visit => visit.url) });
      }
      const code = isSourceToolError(error) ? error.machineCode : "unexpected";
      const reason: Record<string, string> = { network: "соединение прервалось", timeout: "не ответил вовремя", http_error: "ответил ошибкой", robots_disallow: "страница закрыта для автоматического доступа", page_budget_exceeded: "превышен лимит страниц на запрос", driver_unavailable: "браузер недоступен" };
      const note = isSourceToolError(error) && error.code === "layout_changed" ? "Структура страницы МЕДИ РУ изменилась — источник не прочитан, результат не подставлен" : `МЕДИ РУ: ${isSourceToolError(error) ? reason[error.code] ?? error.code : "ошибка"}`;
      return emptyResult(request, { sourceId: "medi", outcome: "failed", status: report.status, execution: report.execution, started, errorCode: code, note, urls: provenance.visits.map(visit => visit.url) });
    }
  }

  return {
    ...MEDI_DESCRIPTOR,
    status,
    execute,
    async fetch(url, ctx, intent) {
      const driver = await driverPromise();
      if (!driver) return null;
      const tool = new BrowserSourceTool(site, driver);
      // A neutral fetch is a re-verification: it re-reads the source; scenario fetches reuse that fresh page.
      const page = await tool.open(url, { fresh: !intent });
      if (url.includes("/klinicheskie-rekomendatsii/")) {
        const raw = tool.extract(page, guidelineExtractor);
        const nosology = nosologyById(intent?.context.nosology?.id) ?? NOSOLOGIES.find(node => titleMatchesNosology(raw.title, node));
        if (!nosology) return null;
        return normalizeGuideline(raw, page.snapshot, { nosology, subtypeId: intent?.context.subtype?.id ?? null, drugs: intent?.entities.drugs ?? [], now: ctx.now, definition: intent?.job.primary === "disease_reference" });
      }
      if (url.includes("/instrukciya/")) {
        const raw = tool.extract(page, instructionExtractor);
        const drug = intent?.entities.drugs[0] ?? { inn: raw.inn || raw.title, ru: raw.inn || raw.title, stems: [raw.inn || raw.title] };
        return normalizeInstruction(raw, page.snapshot, { drug, listingDate: null, nosology: nosologyById(intent?.context.nosology?.id), safety: intent?.safety ?? [], job: intent?.job.primary ?? "drug_reference", sections: intent?.sections, populations: intent ? populationsNamed(intent) : [] });
      }
      return null;
    },
  };
}

/** Test/fixture helper: run an extractor on HTML without a driver. */
export function extractFromHtml<T>(extractor: Extractor<T>, html: string, url: string): { value: T; page: PageSnapshot; document: DomDocument } {
  const page: PageSnapshot = { requestedUrl: url, finalUrl: url, status: 200, html, fetchedAt: new Date().toISOString(), driver: "http", durationMs: 0 };
  const document = parseDocument(html);
  return { value: extractor.run(document, page), page, document };
}

