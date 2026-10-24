import type { SpecialtyId } from "@/lib/domain/types";
import { PUBMED_CONCEPTS, TOPICS, topicsMentioned } from "@/lib/agents/vocabulary";

/**
 * Query-understanding lexicon for the portal. It maps Russian (and Latin)
 * wording to search terms for live sources. Entries are search aids, not
 * clinical statements: a wrong mapping produces a worse search, and the
 * result page always shows the exact terms that were searched.
 */

export interface DrugEntry {
  /** English INN as used by openFDA `openfda.generic_name` and PubMed. */
  inn: string;
  /** Russian display name. */
  ru: string;
  /** Russian stem(s) matched on normalized text (lowercase, ё → е). */
  stems: string[];
}

const d = (inn: string, ru: string, ...stems: string[]): DrugEntry => ({ inn, ru, stems: stems.length ? stems : [ru] });

export const DRUGS: readonly DrugEntry[] = [
  // Anticoagulants, antiplatelets
  d("apixaban", "апиксабан"), d("rivaroxaban", "ривароксабан"), d("dabigatran", "дабигатран"), d("edoxaban", "эдоксабан"), d("warfarin", "варфарин"),
  d("clopidogrel", "клопидогрел"), d("ticagrelor", "тикагрелор"), d("prasugrel", "прасугрел"), d("aspirin", "ацетилсалициловая кислота", "ацетилсалицил", "аспирин"),
  d("enoxaparin", "эноксапарин"), d("heparin", "гепарин"),
  // Lipids
  d("atorvastatin", "аторвастатин"), d("rosuvastatin", "розувастатин"), d("simvastatin", "симвастатин"), d("ezetimibe", "эзетимиб"),
  d("evolocumab", "эволокумаб"), d("alirocumab", "алирокумаб"), d("inclisiran", "инклисиран"),
  // Cardiovascular
  d("bisoprolol", "бисопролол"), d("metoprolol", "метопролол"), d("carvedilol", "карведилол"), d("nebivolol", "небиволол"),
  d("amlodipine", "амлодипин"), d("nifedipine", "нифедипин"), d("lisinopril", "лизиноприл"), d("enalapril", "эналаприл"), d("perindopril", "периндоприл"), d("ramipril", "рамиприл"),
  d("losartan", "лозартан"), d("valsartan", "валсартан"), d("telmisartan", "телмисартан"), d("candesartan", "кандесартан"), d("sacubitril", "сакубитрил"),
  d("spironolactone", "спиронолактон"), d("eplerenone", "эплеренон"), d("finerenone", "финеренон"), d("torsemide", "торасемид"), d("furosemide", "фуросемид"),
  d("hydrochlorothiazide", "гидрохлоротиазид"), d("indapamide", "индапамид"), d("amiodarone", "амиодарон"), d("digoxin", "дигоксин"), d("ivabradine", "ивабрадин"),
  d("mavacamten", "мавакамтен"), d("methyldopa", "метилдопа"), d("labetalol", "лабеталол"),
  // Diabetes, endocrine
  d("metformin", "метформин"), d("dapagliflozin", "дапаглифлозин"), d("empagliflozin", "эмпаглифлозин"), d("canagliflozin", "канаглифлозин"),
  d("semaglutide", "семаглутид"), d("liraglutide", "лираглутид"), d("dulaglutide", "дулаглутид"), d("tirzepatide", "тирзепатид"),
  d("sitagliptin", "ситаглиптин"), d("vildagliptin", "вилдаглиптин"), d("gliclazide", "гликлазид"), d("glimepiride", "глимепирид"), d("pioglitazone", "пиоглитазон"),
  d("insulin glargine", "инсулин гларгин", "гларгин"), d("insulin degludec", "инсулин деглудек", "деглудек"), d("insulin aspart", "инсулин аспарт", "аспарт"), d("insulin lispro", "инсулин лизпро", "лизпро"),
  d("levothyroxine", "левотироксин"), d("methimazole", "тиамазол"), d("propylthiouracil", "пропилтиоурацил"),
  d("alendronate", "алендронат", "алендронов"), d("zoledronic acid", "золедроновая кислота", "золедрон"), d("denosumab", "деносумаб"), d("teriparatide", "терипаратид"),
  d("hydrocortisone", "гидрокортизон"), d("cabergoline", "каберголин"), d("orlistat", "орлистат"),
  // Neurology
  d("levetiracetam", "леветирацетам"), d("valproic acid", "вальпроевая кислота", "вальпро"), d("carbamazepine", "карбамазепин"), d("lamotrigine", "ламотриджин"),
  d("topiramate", "топирамат"), d("oxcarbazepine", "окскарбазепин"), d("gabapentin", "габапентин"), d("pregabalin", "прегабалин"),
  d("sumatriptan", "суматриптан"), d("zolmitriptan", "золмитриптан"), d("erenumab", "эренумаб"), d("fremanezumab", "фреманезумаб"), d("galcanezumab", "галканезумаб"),
  d("onabotulinumtoxinA", "ботулинический токсин", "ботулин"), d("levodopa", "леводопа"), d("pramipexole", "прамипексол"), d("ropinirole", "ропинирол"),
  d("donepezil", "донепезил"), d("memantine", "мемантин"), d("rivastigmine", "ривастигмин"), d("alteplase", "алтеплаза"), d("tenecteplase", "тенектеплаза"),
  d("ocrelizumab", "окрелизумаб"), d("natalizumab", "натализумаб"), d("fingolimod", "финголимод"), d("dimethyl fumarate", "диметилфумарат"),
  d("amitriptyline", "амитриптилин"), d("duloxetine", "дулоксетин"), d("sertraline", "сертралин"), d("escitalopram", "эсциталопрам"),
  // General practice, infections, respiratory, pain
  d("omeprazole", "омепразол"), d("pantoprazole", "пантопразол"), d("esomeprazole", "эзомепразол"),
  d("amoxicillin", "амоксициллин"), d("azithromycin", "азитромицин"), d("clarithromycin", "кларитромицин"), d("ceftriaxone", "цефтриаксон"),
  d("levofloxacin", "левофлоксацин"), d("doxycycline", "доксициклин"), d("nitrofurantoin", "нитрофурантоин"), d("fosfomycin", "фосфомицин"), d("oseltamivir", "осельтамивир"),
  d("acetaminophen", "парацетамол"), d("ibuprofen", "ибупрофен"), d("diclofenac", "диклофенак"), d("naproxen", "напроксен"), d("celecoxib", "целекоксиб"),
  d("allopurinol", "аллопуринол"), d("febuxostat", "фебуксостат"), d("colchicine", "колхицин"), d("prednisolone", "преднизолон"),
  d("budesonide", "будесонид"), d("fluticasone", "флутиказон"), d("albuterol", "сальбутамол"), d("tiotropium", "тиотропий"), d("montelukast", "монтелукаст"),
  d("cetirizine", "цетиризин"), d("loratadine", "лоратадин"), d("ondansetron", "ондансетрон"), d("methylphenidate", "метилфенидат"), d("atomoxetine", "атомоксетин"),
  d("palivizumab", "паливизумаб"), d("cholecalciferol", "колекальциферол"),
  // Obstetrics and gynecology
  d("progesterone", "прогестерон"), d("dydrogesterone", "дидрогестерон"), d("letrozole", "летрозол"), d("clomiphene", "кломифен"), d("oxytocin", "окситоцин"),
  d("magnesium sulfate", "магния сульфат", "сульфат магния", "магнезия"), d("tranexamic acid", "транексамовая кислота", "транексам"), d("levonorgestrel", "левоноргестрел"),
  d("estradiol", "эстрадиол"), d("drospirenone", "дроспиренон"), d("folic acid", "фолиевая кислота", "фолиев"), d("mifepristone", "мифепристон"), d("misoprostol", "мизопростол"),
];

/** Words that make a request about a drug even without a recognised INN. */
const DRUG_CUES = /(?<![\p{L}])(?:препарат|лекарств|мнн|инструкци|дозиров|доз[аыуеой]?(?![\p{L}])|дозы|противопоказ|побочн|нежелательн\p{L}* реакц|взаимодейств|совместим|режим при[её]ма|фармакокинет|аналог)/u;

export function normalizeQuery(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function stemRegex(stem: string): RegExp {
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}])${escaped}`, "u");
}

/** A drug comparison takes two to four drugs; a fifth name is not read. */
export const MAX_DRUGS_PER_REQUEST = 4;

const DRUG_MATCHERS = DRUGS.map(entry => ({ entry, patterns: [...entry.stems.map(stemRegex), stemRegex(entry.inn.toLowerCase())] }));

/** Drugs named in the text, in order of appearance, max 4 (a comparison takes two to four). */
export function drugsIn(text: string): DrugEntry[] {
  const value = normalizeQuery(text);
  const found: Array<{ entry: DrugEntry; at: number }> = [];
  for (const { entry, patterns } of DRUG_MATCHERS) {
    let at = -1;
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match?.index !== undefined && (at === -1 || match.index < at)) at = match.index;
    }
    if (at >= 0 && !found.some(item => item.entry.inn === entry.inn)) found.push({ entry, at });
  }
  // «инсулин гларгин» also matches the bare stem of other insulins only when written; keep the most specific.
  return found.sort((a, b) => a.at - b.at).map(item => item.entry).slice(0, MAX_DRUGS_PER_REQUEST);
}

export function hasDrugCue(text: string): boolean {
  return DRUG_CUES.test(normalizeQuery(text));
}

/** Populations and settings that narrow a literature search. */
const POPULATIONS: ReadonlyArray<{ id: string; label: string; match: RegExp; term: string; exclude?: string }> = [
  { id: "children", label: "дети", match: /(?<![\p{L}])(?:дет(?:и|ей|ям|ск)|ребен|ребён|младен|подрост|новорожд)/u, term: "child*[tiab] OR infant*[tiab] OR pediatric*[tiab] OR adolescen*[tiab]" },
  { id: "pregnancy", label: "беременность", match: /(?<![\p{L}])беременн/u, term: "pregnan*[tiab]" },
  { id: "lactation", label: "лактация", match: /(?<![\p{L}])(?:лактац|кормящ|грудн\p{L}* вскармлив)/u, term: "lactation[tiab] OR breastfeeding[tiab]" },
  { id: "elderly", label: "пожилые", match: /(?<![\p{L}])(?:пожил|старше\s*(?:65|70|75|80)|гериатр)/u, term: "elderly[tiab] OR older[tiab] OR aged[tiab]" },
  // «У взрослых» does not require the word in the abstract: it excludes publications about children by title.
  { id: "adults", label: "взрослые", match: /(?<![\p{L}])взросл/u, term: "", exclude: "child*[ti] OR pediatric*[ti] OR paediatric*[ti] OR infant*[ti] OR neonat*[ti] OR adolescen*[ti]" },
];

/**
 * Qualifiers of a named condition that change which publications answer the
 * question («внебольничная» пневмония is not hospital-acquired). They are
 * subjects: kept when the search is relaxed.
 */
const QUALIFIERS: ReadonlyArray<{ id: string; label: string; match: RegExp; term: string }> = [
  { id: "community_acquired", label: "внебольничная", match: /(?<![\p{L}])внебольничн/u, term: "\"community-acquired\"[tiab] OR \"community acquired\"[tiab]" },
  { id: "hospital_acquired", label: "нозокомиальная", match: /(?<![\p{L}])(?:нозокомиальн|госпитальн\p{L}* пневмон)/u, term: "\"hospital-acquired\"[tiab] OR nosocomial[tiab] OR \"ventilator-associated\"[tiab]" },
];

export interface QueryConcept {
  id: string;
  label: string;
  /** OR of synonyms, AND-ed with the other concepts; empty for a concept that only excludes. */
  term: string;
  kind: "topic" | "concept" | "drug" | "population" | "modifier";
  /** Title terms the concept rules out (NOT), e.g. children for a question about adults. */
  exclude?: string;
  /** A modifier that names the information asked for («длительность», «дозирование»), not the context («антибиотики»). */
  asked?: boolean;
}

/**
 * Question modifiers narrow the search to what was asked about a condition
 * (acute vs chronic, prevention, duration, safety). They are AND-ed first and
 * dropped first when the strict search finds too little.
 */
const MODIFIERS: ReadonlyArray<{ id: string; label: string; match: RegExp; term: string }> = [
  { id: "acute", label: "острый", match: /(?<![\p{L}])остр(?:ый|ого|ом|ая|ой|ую|ые|ых|ым)(?![\p{L}])/u, term: "acute[tiab]" },
  { id: "chronic", label: "хронический", match: /(?<![\p{L}])хроническ/u, term: "chronic[tiab]" },
  { id: "antibiotics", label: "антибиотики", match: /(?<![\p{L}])антибиот|(?<![\p{L}])антибактериал/u, term: "antibiotic*[tiab] OR antibacterial[tiab] OR antimicrobial[tiab]" },
  { id: "duration", label: "длительность", match: /(?<![\p{L}])(?:длительност|продолжительност|сколько дней|коротк\p{L}* курс)/u, term: "duration[tiab] OR \"short-course\"[tiab] OR \"short course\"[tiab]" },
  { id: "prevention", label: "профилактика", match: /(?<![\p{L}])(?:профилакт|предупрежд\p{L}* развити)/u, term: "prevention[tiab] OR preventive[tiab] OR prophyla*[tiab]" },
  { id: "screening", label: "скрининг", match: /(?<![\p{L}])скрининг/u, term: "screening[tiab]" },
  { id: "diagnosis", label: "диагностика", match: /(?<![\p{L}])(?:диагности|критери\p{L}* диагноз|дифференциальн)/u, term: "diagnosis[tiab] OR diagnostic[tiab]" },
  { id: "safety", label: "безопасность", match: /(?<![\p{L}])(?:безопас|побочн|нежелательн|осложнени)/u, term: "safety[tiab] OR adverse[tiab]" },
  { id: "interactions", label: "взаимодействия", match: /(?<![\p{L}])взаимодейств/u, term: "interaction*[tiab]" },
  { id: "dose", label: "дозирование", match: /(?<![\p{L}])(?:дозир|доз[аыуеой]?(?![\p{L}]))/u, term: "dose[tiab] OR dosing[tiab] OR dosage[tiab]" },
  { id: "non_severe", label: "нетяжёлое течение", match: /(?<![\p{L}])(?:нетяж[её]л|не\s+тяж[её]л|л[её]гк\p{L}*\s+(?:течени|степен|форм))/u, term: "mild[tiab] OR \"non-severe\"[tiab] OR nonsevere[tiab] OR \"low-risk\"[tiab] OR outpatient*[tiab]" },
  { id: "severe", label: "тяжёлое течение", match: /(?<![\p{L}])(?<!не\s)тяж[её]л/u, term: "severe[tiab] OR \"intensive care\"[tiab] OR ICU[tiab]" },
];

/** Modifiers that name what is asked about the condition, as opposed to its context. */
const ASKED_MODIFIERS: ReadonlySet<string> = new Set(["duration", "dose", "safety", "interactions", "diagnosis", "screening", "prevention"]);

/**
 * Concepts named in a question, across all specialties' topic vocabularies:
 * a pediatrician asking about metformin or a therapist asking about migraine
 * is still searched correctly. The physician's own specialty is tried first.
 */
export function conceptsIn(text: string, specialty: SpecialtyId): QueryConcept[] {
  const value = normalizeQuery(text);
  const concepts: QueryConcept[] = [];
  const seenTerms = new Set<string>();
  const seenLabels = new Set<string>();
  const push = (concept: QueryConcept) => {
    const labelKey = concept.label.toLocaleLowerCase("ru-RU");
    if ((concept.term && seenTerms.has(concept.term)) || seenLabels.has(labelKey)) return;
    if (concept.term) seenTerms.add(concept.term);
    seenLabels.add(labelKey);
    concepts.push(concept);
  };

  const order: SpecialtyId[] = [specialty, ...(Object.keys(TOPICS) as SpecialtyId[]).filter(id => id !== specialty)];
  const topicLabelsSeen = new Set<string>();
  const topicKeywords = new Set<string>();
  for (const id of order) {
    for (const topicId of topicsMentioned(id, text)) {
      const topic = TOPICS[id].find(item => item.id === topicId);
      if (!topic || topicLabelsSeen.has(topic.label)) continue;
      // A specialty-framed topic never leaks into another specialty's question.
      if (topic.specialtyBound && id !== specialty) continue;
      // The same disease named in two vocabularies (e.g. asthma) is searched once.
      const keywordKey = [...topic.keywords].sort().join("|");
      if (topicKeywords.has(keywordKey)) continue;
      topicKeywords.add(keywordKey);
      topicLabelsSeen.add(topic.label);
      push({ id: `${id}:${topic.id}`, label: topic.label, term: topic.pubmed, kind: "topic" });
    }
  }
  for (const concept of PUBMED_CONCEPTS) if (concept.match.test(value) || concept.cased?.test(text.normalize("NFKC"))) push({ id: `concept:${concept.id}`, label: concept.label, term: concept.term, kind: "concept" });
  for (const drug of drugsIn(text)) push({ id: `drug:${drug.inn}`, label: drug.ru, term: `"${drug.inn}"[tiab]`, kind: "drug" });
  for (const qualifier of QUALIFIERS) if (qualifier.match.test(value) && concepts.length) push({ id: `concept:${qualifier.id}`, label: qualifier.label, term: qualifier.term, kind: "concept" });
  for (const population of POPULATIONS) if (population.match.test(value)) push({ id: `population:${population.id}`, label: population.label, term: population.term, kind: "population", ...(population.exclude ? { exclude: population.exclude } : {}) });
  const subjects = concepts.filter(concept => concept.kind !== "population");
  for (const modifier of MODIFIERS) {
    if (!modifier.match.test(value)) continue;
    // «профилактика» is a modifier only when the question names what to prevent.
    if (modifier.id === "prevention" && concepts.some(concept => concept.id === "cardiology:prevention")) continue;
    if (!subjects.length) continue;
    push({ id: `modifier:${modifier.id}`, label: modifier.label, term: modifier.term, kind: "modifier", ...(ASKED_MODIFIERS.has(modifier.id) ? { asked: true } : {}) });
  }
  const distinct = withoutImplied(concepts);
  // What is asked («безопасность», «длительность») and the drug it is asked about are never what the limit cuts: the rest give way first.
  const kept = (concept: QueryConcept) => Boolean(concept.asked) || concept.kind === "drug";
  const fixed = distinct.filter(kept);
  const rest = distinct.filter(concept => !kept(concept)).slice(0, Math.max(0, 7 - fixed.length));
  return distinct.filter(concept => fixed.includes(concept) || rest.includes(concept));
}

/** `inner` is one whole AND/OR operand of `outer` («"chronic kidney disease"[tiab]» in «… OR renal[tiab]»). */
function operandOf(outer: string, inner: string): boolean {
  if (outer === inner) return false;
  const at = outer.indexOf(inner);
  if (at < 0) return false;
  const before = outer.slice(0, at);
  const after = outer.slice(at + inner.length);
  return (!before || /(?:\s(?:AND|OR)\s|\()$/u.test(before)) && (!after || /^(?:\s(?:AND|OR)\s|\))/u.test(after));
}

/**
 * One disease named three ways («ХБП» → «Кардиоренальные связи», «Хроническая
 * болезнь почек», «ХБП») takes one place among the conditions, not three. A
 * condition another one already implies is dropped; the AND of what remains
 * finds the same publications, so the search does not change.
 */
function withoutImplied(concepts: QueryConcept[]): QueryConcept[] {
  const subject = (concept: QueryConcept) => (concept.kind === "topic" || concept.kind === "concept") && Boolean(concept.term);
  const only = (term: string, connective: "AND" | "OR") => term.includes(` ${connective} `) && !term.includes(` ${connective === "AND" ? "OR" : "AND"} `);
  // y implies x: y = x AND z, or x = y OR z.
  const implies = (y: QueryConcept, x: QueryConcept) =>
    (only(y.term, "AND") && operandOf(y.term, x.term)) || (only(x.term, "OR") && operandOf(x.term, y.term));
  const subjects = concepts.filter(subject);
  return concepts.filter(x => !subject(x) || !subjects.some(y => y !== x && implies(y, x)));
}

/** Latin words the physician typed (drug names, acronyms, English terms). */
/** «v2.0», «ver. 3.1», «version 2», «rev. 4» label a document's version: never a search term. */
const VERSION_LABEL = /(?<![A-Za-z])(?:v|ver|version|rev)\.?\s*\d+(?:\.\d+)*/giu;

export function latinTermsIn(text: string): string[] {
  return [...new Set((text.replace(VERSION_LABEL, " ").match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? []).map(word => word.toLowerCase()))]
    .filter(word => !DRUGS.some(drug => drug.inn.toLowerCase() === word))
    .slice(0, 4);
}

/** ` NOT (…)` for the concepts that rule publications out by title, or an empty string. */
function exclusionFor(concepts: readonly QueryConcept[]): string {
  const excluded = concepts.map(concept => concept.exclude).filter((value): value is string => Boolean(value));
  return excluded.length ? ` NOT (${excluded.join(" OR ")})` : "";
}

/**
 * PubMed term for a question: clinical concepts are AND-ed (each concept is an
 * OR of synonyms); a population that excludes («взрослые») becomes NOT. Returns
 * null when nothing searchable was recognised — the caller must say so instead
 * of searching for an empty term.
 */
export function pubmedTermFor(concepts: readonly QueryConcept[], latin: readonly string[] = []): string | null {
  const parts = [
    ...concepts.filter(concept => concept.term).map(concept => `(${concept.term})`),
    ...latin.map(word => `${word}[tiab]`),
  ];
  return parts.length ? `${parts.join(" AND ")}${exclusionFor(concepts)}` : null;
}

/** Relaxed search: the question's subjects and populations without its modifiers. */
export function pubmedCoreTermFor(concepts: readonly QueryConcept[], latin: readonly string[] = []): string | null {
  const core = concepts.filter(concept => concept.kind !== "modifier");
  if (core.length === concepts.length && !latin.length) return null;
  return pubmedTermFor(core, latin);
}

/** Broader fallback: the same concepts OR-ed, populations kept as filters. */
export function pubmedBroadTermFor(concepts: readonly QueryConcept[], latin: readonly string[] = []): string | null {
  const core = [...concepts.filter(item => item.kind !== "population" && item.kind !== "modifier").map(item => `(${item.term})`), ...latin.map(word => `${word}[tiab]`)];
  if (core.length < 2) return null;
  const populations = concepts.filter(item => item.kind === "population" && item.term).map(item => `(${item.term})`);
  return `${[`(${core.join(" OR ")})`, ...populations].join(" AND ")}${exclusionFor(concepts)}`;
}
