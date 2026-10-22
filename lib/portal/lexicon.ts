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

const DRUG_MATCHERS = DRUGS.map(entry => ({ entry, patterns: [...entry.stems.map(stemRegex), stemRegex(entry.inn.toLowerCase())] }));

/** Drugs named in the text, in order of appearance, max 3. */
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
  return found.sort((a, b) => a.at - b.at).map(item => item.entry).slice(0, 3);
}

export function hasDrugCue(text: string): boolean {
  return DRUG_CUES.test(normalizeQuery(text));
}

/** Populations and settings that narrow a literature search. */
const POPULATIONS: ReadonlyArray<{ id: string; label: string; match: RegExp; term: string }> = [
  { id: "children", label: "дети", match: /(?<![\p{L}])(?:дет(?:и|ей|ям|ск)|ребен|ребён|младен|подрост|новорожд)/u, term: "child*[tiab] OR infant*[tiab] OR pediatric*[tiab] OR adolescen*[tiab]" },
  { id: "pregnancy", label: "беременность", match: /(?<![\p{L}])беременн/u, term: "pregnan*[tiab]" },
  { id: "lactation", label: "лактация", match: /(?<![\p{L}])(?:лактац|кормящ|грудн\p{L}* вскармлив)/u, term: "lactation[tiab] OR breastfeeding[tiab]" },
  { id: "elderly", label: "пожилые", match: /(?<![\p{L}])(?:пожил|старше\s*(?:65|70|75|80)|гериатр)/u, term: "elderly[tiab] OR older[tiab] OR aged[tiab]" },
];

export interface QueryConcept {
  id: string;
  label: string;
  term: string;
  kind: "topic" | "concept" | "drug" | "population" | "modifier";
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
  { id: "safety", label: "безопасность", match: /(?<![\p{L}])(?:безопасност|побочн|нежелательн|осложнени)/u, term: "safety[tiab] OR adverse[tiab]" },
  { id: "interactions", label: "взаимодействия", match: /(?<![\p{L}])взаимодейств/u, term: "interaction*[tiab]" },
  { id: "dose", label: "дозирование", match: /(?<![\p{L}])(?:дозир|доз[аыуеой]?(?![\p{L}]))/u, term: "dose[tiab] OR dosing[tiab] OR dosage[tiab]" },
];

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
    if (seenTerms.has(concept.term) || seenLabels.has(labelKey)) return;
    seenTerms.add(concept.term);
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
  for (const concept of PUBMED_CONCEPTS) if (concept.match.test(value)) push({ id: `concept:${concept.id}`, label: concept.label, term: concept.term, kind: "concept" });
  for (const drug of drugsIn(text)) push({ id: `drug:${drug.inn}`, label: drug.ru, term: `"${drug.inn}"[tiab]`, kind: "drug" });
  for (const population of POPULATIONS) if (population.match.test(value)) push({ id: `population:${population.id}`, label: population.label, term: population.term, kind: "population" });
  const subjects = concepts.filter(concept => concept.kind !== "population");
  for (const modifier of MODIFIERS) {
    if (!modifier.match.test(value)) continue;
    // «профилактика» is a modifier only when the question names what to prevent.
    if (modifier.id === "prevention" && concepts.some(concept => concept.id === "cardiology:prevention")) continue;
    if (!subjects.length) continue;
    push({ id: `modifier:${modifier.id}`, label: modifier.label, term: modifier.term, kind: "modifier" });
  }
  return concepts.slice(0, 7);
}

/** Latin words the physician typed (drug names, acronyms, English terms). */
export function latinTermsIn(text: string): string[] {
  return [...new Set((text.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? []).map(word => word.toLowerCase()))]
    .filter(word => !DRUGS.some(drug => drug.inn.toLowerCase() === word))
    .slice(0, 4);
}

/**
 * PubMed term for a question: clinical concepts are AND-ed (each concept is an
 * OR of synonyms). Returns null when nothing searchable was recognised — the
 * caller must say so instead of searching for an empty term.
 */
export function pubmedTermFor(concepts: readonly QueryConcept[], latin: readonly string[] = []): string | null {
  const parts = [
    ...concepts.map(concept => `(${concept.term})`),
    ...latin.map(word => `${word}[tiab]`),
  ];
  return parts.length ? parts.join(" AND ") : null;
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
  const populations = concepts.filter(item => item.kind === "population").map(item => `(${item.term})`);
  return [`(${core.join(" OR ")})`, ...populations].join(" AND ");
}
