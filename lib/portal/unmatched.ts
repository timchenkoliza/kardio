import type { SpecialtyId } from "@/lib/domain/types";
import { pubmedConceptsIn, TOPICS } from "@/lib/agents/vocabulary";
import { askedSections, type AskedSection } from "@/lib/mesh/refine";
import { compileIntent } from "@/lib/mesh/intent";

/**
 * Parts of the physician's question the search did not use («сниженной функцией
 * почек» when the search used «апиксабан · фибрилляция предсердий · пожилые ·
 * безопасность»). A word counts as used when the lexicon recognises it on its
 * own (a disease, drug, population, concept) or when a search condition shares
 * its stem. Consecutive unused words are one phrase. Shown so a dropped
 * condition is never silent; it is not a judgement of relevance.
 */

const STOP = new Set([
  "какая", "какой", "какие", "каков", "каковы", "какова", "что", "чем", "как", "когда", "где", "почему", "зачем", "можно", "нужно", "ли",
  "известно", "известны", "данные", "данных", "вопрос", "уточнение", "если", "при", "для", "или", "это", "есть", "был", "была", "были",
  "после", "перед", "между", "через", "около", "более", "менее", "очень", "сейчас", "новое", "нового", "изменилось", "изменения",
  "рекомендации", "рекомендациях", "рекомендаций", "исследования", "исследований", "показало", "показали", "лучше", "хуже",
  "пациентов", "пациентам", "пациенты", "больных", "лечение", "лечения", "лечении", "лечению", "лечением", "терапия", "терапии", "терапией", "течение", "течении",
  "насколько", "старше", "младше", "моложе", "года", "годы", "лет", "сколько", "стоит", "надо", "ведение", "ведения", "риск", "риска",
  "выбор", "выбора", "выборе", "шкала", "шкалы", "шкале", "шкалой", "оценка", "оценки", "оценке", "оценку",
  "какую", "каким", "какими", "ведению", "ведении", "ведением", "назначать", "назначить", "применять", "использовать", "начинать", "начать",
  // The kind of material asked for, not a condition of the question («Клинические рекомендации по ХОБЛ», «…: систематические обзоры»).
  "клинические", "клинических", "клиническим", "систематические", "систематических", "систематический", "обзоры", "обзор", "обзоров",
  "показаны", "показан", "показана", "показано",
  // English service words of an English question are not conditions («Beta blockers in heart failure»).
  "in", "of", "vs", "versus", "and", "or", "the", "for", "with", "at", "on", "to", "a", "an", "by", "from",
]);

/**
 * An abbreviation in the conditions covers the words it stands for. For «ХБП» the whole phrase is its meaning
 * («сниженной функцией почек»); for a disease name («ХСН», «АГ», «ФП») only the words of the name are used,
 * and the rest of the phrase («с сохранённой фракцией выброса», «острая») is a condition of its own.
 */
const ABBREVIATIONS: ReadonlyArray<{ pattern: RegExp; words: readonly string[]; wholePhrase: boolean }> = [
  { pattern: /(?<![\p{L}])хбп(?![\p{L}])/u, words: ["поч"], wholePhrase: true },
  { pattern: /(?<![\p{L}])хсн(?![\p{L}])/u, words: ["сердеч", "недост", "хрон"], wholePhrase: false },
  { pattern: /(?<![\p{L}])(?:аг|ag)(?![\p{L}])/u, words: ["гипертенз", "гипертон", "давлен", "артериал"], wholePhrase: false },
  { pattern: /(?<![\p{L}])фп(?![\p{L}])/u, words: ["фибрил", "предсерд"], wholePhrase: false },
  // «Кардиоренальные связи» is searched as chronic kidney disease AND cardiovascular.
  { pattern: /кардиоренал/u, words: ["поч"], wholePhrase: true },
];

/**
 * Qualifiers a searched concept already covers: «ablation[tiab]» finds catheter ablation, so «катетерная»
 * before «абляция» is not a lost condition. A short explicit list — any other qualifier («пароксизмальная»,
 * «резистентная», «интенсивное») is a condition of its own and is named when the search did not use it.
 */
const COVERED_QUALIFIERS: ReadonlyArray<[RegExp, readonly string[]]> = [
  [/абляц/u, ["катетерн"]],
  // «"cardiovascular prevention"[tiab]» is the prevention topic's own term.
  [/профилакт/u, ["сердечно-сосудист", "заболеван"]],
  [/pcsk9/u, ["ингибитор"]],
  [/диагност/u, ["критери", "диагноз"]],
  // «Кардиоренальные связи» is searched as chronic kidney disease AND cardiovascular.
  [/кардиоренал/u, ["сердечно-сосудист", "заболеван"]],
];

/** A number with its fraction, range and unit («1,4 ммоль/л», «8–60», «5 мг»), not a word starting with a digit («2Б»). */
const NUMBER = "[0-9]+(?:[.,/][0-9]+)?(?:\\s?[-–—]\\s?[0-9]+(?:[.,][0-9]+)?)?(?:-(?:го|й|е|я|х|м|му|ми|ти|летию|летия|летний|летних|летнего))?(?:\\s?(?:%|мг/кг|мг|мкг|мл/кг|мл/мин|мл|ммоль/л|мкмоль/л))?(?![\\p{L}\\p{N}])";

/** An abbreviation typed in capitals, possibly with a number («ИКД», «ПЦСК9»). */
const ABBREVIATION = /^[А-ЯЁ]{2,6}[0-9]*$/u;

/** A word is named as typed for its abbreviations («Д-димер», «стресс-ЭхоКГ», «NT-proBNP»), in lower case otherwise («бета-блокаторы»). */
function shown(token: string): string {
  if (/[A-Za-z]/u.test(token) && !/[А-Яа-яЁё]/u.test(token)) return token;
  return token.split("-").map(part => /\p{Lu}.*\p{Lu}/u.test(part) || /^\p{Lu}$/u.test(part) || /[0-9]/u.test(part) ? part : part.toLocaleLowerCase("ru-RU")).join("-");
}

/** Heart-failure phenotypes: the topic «ХСН» finds them, but not narrowed to the phenotype. */
const PHENOTYPE = /^х?сн(?:н|с|ун|п|сн|р)?фв$/u;

const fold = (word: string) => word.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");

/** «профилактический» is the adjective of «профилактика», «кардиологический» of «кардиология». */
const adjectiveAsNoun = (word: string) => word.replace(/ическ\p{L}*$/u, "ик");

/** A word without its case ending («антибиотики» → «антибиотик»). */
const withoutEnding = (word: string) => word.replace(/(?:ами|ями|ого|его|ому|ему|ов|ев|ей|ой|ий|ый|ая|яя|ое|ее|ые|ие|ую|юю|ом|ем|ам|ям|ах|ях|ым|им|ых|их|а|я|о|е|и|ы|у|ю|ь|й)$/u, "");

/** A compound whose first part is the other word with a linking vowel («антибиотико-терапия» for «антибиотики»). */
function compoundOf(word: string, part: string): boolean {
  if (word.includes("-")) return false;
  const stem = withoutEnding(part);
  // «-терапия» names the use of the drug; «-резистентность», «-профилактика» are other questions.
  return stem.length >= 6 && [`${stem}отерап`, `${stem}етерап`].some(prefix => word.startsWith(prefix));
}

/**
 * A condition word covers its own forms («недостаточность» → «недостаточностью», «острый» → «острая»,
 * «дозирование» → «дозировка», «профилактика» → «профилактические»): the shared stem covers all of the longer
 * word but its last four letters, and at least five. A different word sharing a short stem is not covered:
 * «артериальная» does not cover «артерии», «контрацепция» does not cover «контроль», «гипертензия» not «гипертрофия».
 */
function sameStem(word: string, condition: string): boolean {
  if (word === condition) return true;
  if (compoundOf(word, condition) || compoundOf(condition, word)) return true;
  const [a, b] = [adjectiveAsNoun(word), adjectiveAsNoun(condition)];
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common += 1;
  const longer = Math.max(a.length, b.length);
  // A short adjective or noun changes only its ending («острая» / «острый», «риск» / «риска»).
  if (longer <= 7 && common >= 4 && common >= longer - 2) return true;
  if (a.length < 5 || b.length < 5) return false;
  return common >= Math.max(5, longer - 4);
}

/**
 * Words of a drug-instruction section the search used («доза» for «дозирование», «побочные эффекты» for
 * «безопасность»). A noun after a section word («эффекты», «явления», «действие») belongs to it.
 */
const SECTION_CONDITION: Readonly<Record<AskedSection, RegExp>> = {
  dosing: /дозир/u,
  safety: /безопасн/u,
  contraindications: /противопоказ/u,
  interactions: /взаимодейств/u,
  indications: /показани/u,
  populations: /(?!)/u,
};
/** «эффекты» after «побочные», not «эффективность». */
const SECTION_NOUN = /^(?:эффект(?!ивн)|явлени|действи|реакци)/u;

/** Which written form of a heart-failure phenotype a searched subtype covers. */
const PHENOTYPE_SUBTYPE: ReadonlyArray<[RegExp, RegExp]> = [
  [/^х?снсфв$/u, /сохраненн/u],
  [/^х?сн(?:сн)?нфв$/u, /(?<!умеренно )сниженн/u],
  [/^х?сн(?:ун|п)фв$/u, /умеренно сниженн|промежуточн/u],
];

/**
 * Words of a multi-word topic key found in the whole question, for the topics among the conditions:
 * «артериальная» in «лёгочная артериальная гипертензия» is part of the searched name, not a lost condition.
 */
function matchedKeyParts(question: string, conditions: readonly string[]): string[] {
  const normalized = fold(question);
  const labels = new Set(conditions.map(fold));
  return Object.values(TOPICS).flat().filter(topic => labels.has(fold(topic.label)))
    .flatMap(topic => topic.keywords.map(keyword => fold(keyword).split(" ")))
    .filter(parts => parts.length > 1 && parts.every(part => normalized.includes(part)))
    .flat()
    .filter(part => part.length >= 4);
}

/** Parts of the PubMed concepts among the conditions, as written in the question («lp», «a» of «Lp(a)»). */
function matchedConceptParts(question: string, conditions: readonly string[]): string[] {
  const normalized = fold(question.normalize("NFKC"));
  const labels = new Set(conditions.map(fold));
  return pubmedConceptsIn(question, Infinity).filter(concept => labels.has(fold(concept.label)))
    .flatMap(concept => (normalized.match(new RegExp(concept.match.source, "gu")) ?? []).flatMap(text => text.split(/[^\p{L}\p{N}-]+/u)))
    .filter(Boolean);
}

/** Latin words the PubMed query takes as typed: the research run's own pattern (`executors.ts`). */
function latinInQuery(question: string): Set<string> {
  return new Set((question.match(/[A-Za-z][A-Za-z0-9\- ]{2,}/gu) ?? []).flatMap(text => text.split(/\s+/u)).flatMap(word => [word, ...word.split("-")]).filter(Boolean));
}

/** The word names a disease, drug or concept that is among the conditions («эдоксабан» beyond the drugs searched is not). */
function recognised(word: string, specialty: SpecialtyId, conditions: readonly string[]): boolean {
  const intent = compileIntent(word, specialty);
  const searched = fold(conditions.join(" · "));
  const among = (label: string) => searched.includes(fold(label));
  // A drug is used only as itself: its class among the conditions («антикоагулянты») does not mean this drug was searched.
  if (intent.entities.drugs.length) return intent.entities.drugs.some(drug => among(drug.ru));
  return Boolean((intent.context.nosology && among(intent.context.nosology.label)) || intent.entities.concepts.some(concept => among(concept.label)));
}

/**
 * `known`: what the search that produced the answer understands. The reference answer searches with the portal's
 * whole lexicon; the research review searches only by its topics and PubMed concepts, so a drug the portal knows
 * («бисопролол») but the review did not search is named, never presumed used.
 */
export function unmatchedWords(question: string, conditions: readonly string[], specialty: SpecialtyId, known: (word: string) => boolean = word => recognised(word, specialty, conditions), options: { latinSearched?: boolean; latinQueried?: ReadonlySet<string> } = {}): string[] {
  // Latin words go into the PubMed query as typed; when PubMed was not used, they were searched nowhere.
  const latinSearched = options.latinSearched ?? true;
  const keyParts = matchedKeyParts(question, conditions);
  const conceptParts = matchedConceptParts(question, conditions);
  // Each path passes the Latin its own query took; the default is the review's pattern.
  const latinQueried = new Set([...(options.latinQueried ?? latinInQuery(question))].map(word => word.toLowerCase()));
  const understood = (word: string) => known(word) || keyParts.some(part => fold(word).includes(part))
    || conceptParts.some(part => part.length >= 4 ? fold(word).includes(part) : fold(word) === part);
  const conditionWords = conditions.flatMap(condition => condition.split(/[^А-Яа-яЁёA-Za-z0-9-]+/u)).filter(word => word.length >= 3).map(fold);
  const covered = { has: (word: string) => conditionWords.some(condition => sameStem(fold(word), condition)) };
  const joined = conditions.join(" ").toLocaleLowerCase("ru-RU");
  const active = ABBREVIATIONS.filter(entry => entry.pattern.test(joined));
  const phraseWords = active.filter(entry => entry.wholePhrase).flatMap(entry => entry.words);
  const nameWords = active.filter(entry => !entry.wholePhrase).flatMap(entry => entry.words);
  const viaAbbreviation = (word: string) => phraseWords.some(prefix => word.startsWith(prefix));
  const inName = (word: string) => nameWords.some(prefix => word.startsWith(prefix));
  const qualifiers = COVERED_QUALIFIERS.filter(([pattern]) => pattern.test(joined)).flatMap(([, prefixes]) => prefixes);
  const qualifierCovered = (word: string) => qualifiers.some(prefix => word.startsWith(prefix));
  const phrases: string[] = [];
  // A run of unused words is one phrase; a phrase an abbreviation stands for («сниженной функцией почек» ↔ «ХБП») is used.
  let current: Array<{ word: string; abbreviated: boolean }> = [];
  // A number belongs to the word after it («АВ-блокада 2 степени», «2 типа»).
  let pendingNumber: string | null = null;
  const close = () => {
    if (current.length && !current.some(item => item.abbreviated)) phrases.push(current.map(item => item.word).join(" "));
    current = [];
    // A number left without a word after it goes with the word before it.
    const number = pendingNumber;
    pendingNumber = null;
    dropNumber(number);
  };
  // Any letters count, Greek included («β-блокаторы»); a number keeps its fraction and range («1,4», «8–60»).
  const tokens = [...question.matchAll(new RegExp(`${NUMBER}|[\\p{L}\\p{N}-]+`, "gu"))];
  // Words of a section named across two words («особые указания», «способ применения»).
  const sectionPairs = new Set<number>();
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    const pair = askedSections(`${tokens[index][0]} ${tokens[index + 1][0]}`);
    const single = new Set([...askedSections(tokens[index][0]), ...askedSections(tokens[index + 1][0])]);
    if (pair.some(id => !single.has(id) && SECTION_CONDITION[id].test(fold(conditions.join(" "))))) { sectionPairs.add(index); sectionPairs.add(index + 1); }
  }
  let lastNamedAbbreviation: number | null = null;
  // A number with no word after it belongs to the word before it, even a searched one («ЛПНП 3,0 ммоль/л»: the value was not searched).
  let previousWord: string | null = null;
  const dropNumber = (number: string | null) => { if (number && previousWord) phrases.push(`${shown(previousWord)} ${number}`); };
  // A disease-name word stands for the abbreviation only next to another word of the name or an abbreviation
  // («сердечная недостаточность», «хроническая СН»), not on its own («дыхательная недостаточность»).
  const nameNear = (index: number) => [tokens[index - 1]?.[0], tokens[index + 1]?.[0]]
    .some(near => near !== undefined && (inName(near.toLocaleLowerCase("ru-RU")) || ABBREVIATION.test(near)));
  let end = 0;
  let afterSection = false;
  let latinBefore = false;
  for (const [index, match] of tokens.entries()) {
    const token = match[0];
    const lower = token.toLocaleLowerCase("ru-RU");
    const wasAfterSection = afterSection;
    afterSection = false;
    const wasLatinBefore = latinBefore;
    latinBefore = false;
    const abbreviationBefore = lastNamedAbbreviation;
    lastNamedAbbreviation = null;
    // Punctuation separates conditions («ЛАГ: риоцигуат»).
    if (/[:;,.!?()]/u.test(question.slice(end, match.index))) close();
    end = match.index + token.length;
    // A lone dash separates too («ФП - кардиоверсия»).
    if (!/[\p{L}\p{N}]/u.test(token)) { close(); continue; }
    // An abbreviation typed in capitals («ИКД», «СРТ») is a condition of its own unless the lexicon or the conditions know it («ПОАК», «ХСН»).
    // A heart-failure phenotype («СНсФВ», «СНнФВ») finds heart failure, but the search does not narrow it to the phenotype: it is named.
    if (PHENOTYPE.test(lower.replace(/-/gu, ""))) {
      close();
      const written = fold(lower.replace(/-/gu, ""));
      if (!PHENOTYPE_SUBTYPE.some(([form, subtype]) => form.test(written) && subtype.test(fold(joined)))) phrases.push(token);
      continue;
    }
    if (ABBREVIATION.test(token)) {
      const number = pendingNumber;
      pendingNumber = null;
      close();
      if (!STOP.has(lower) && !covered.has(token) && !joined.split(/[^а-яё0-9]+/u).includes(lower) && !understood(token)) {
        phrases.push(number ? `${number} ${token}` : token);
        lastNamedAbbreviation = phrases.length - 1;
      } else dropNumber(number);
      previousWord = token;
      continue;
    }
    // A number, a conjunction or a service word («при», «для») separates two conditions («регургитация и стеноз», «АВ-блокада 2 степени»);
    // other short words («с», «по») neither start nor break a phrase.
    // A number after a word belongs to it («омега 3», «ниже 1,4»), otherwise to the word after it («2 типа»).
    if (new RegExp(`^${NUMBER}$`, "u").test(token)) {
      // «2-го» inside «СД 2-го типа» is part of the searched concept.
      if (understood(token)) { close(); continue; }
      if (current.length) current.push({ word: token, abbreviated: false });
      else if (abbreviationBefore !== null) phrases[abbreviationBefore] = `${phrases[abbreviationBefore]} ${token}`;
      else pendingNumber = pendingNumber ? `${pendingNumber} ${token}` : token;
      continue;
    }
    const number = pendingNumber;
    pendingNumber = null;
    const latin = /[A-Za-z]/u.test(token) && !/[А-Яа-яЁё]/u.test(token);
    // An English service word is written in lower case; «типа A», «витамин A» name a type and a vitamin.
    if (/^(?:и|или|либо)$/u.test(lower) || (STOP.has(lower) && (!latin || token === lower))) { dropNumber(number); close(); continue; }
    // A Latin word counts as searched when the PubMed query took it as typed («ST при ИБС»; not «Витамин D»).
    if (latin && latinSearched && latinQueried.has(lower)) { close(); previousWord = token; latinBefore = true; continue; }
    // A short Latin qualifier of a searched Latin word is named with it («NYHA II»), never alone.
    if (latin && latinSearched && wasLatinBefore && token.length <= 2) { close(); phrases.push(`${previousWord} ${token}`); continue; }
    // «доза» when the search used «дозирование», «побочные эффекты» when it used «безопасность».
    const clauseEnd = index === tokens.length - 1 || /[:;,.!?()]/u.test(question.slice(end, tokens[index + 1].index));
    const heading = !/^предупрежд/u.test(lower) || clauseEnd;
    const sectionWord = (heading && askedSections(token).some(id => SECTION_CONDITION[id].test(fold(joined)))) || (/^безопас/u.test(lower) && /безопасн/u.test(joined)) || sectionPairs.has(index);
    const section = sectionWord || (wasAfterSection && SECTION_NOUN.test(lower));
    afterSection = sectionWord && /^(?:побочн|нежелательн)/u.test(lower);
    if (section) { dropNumber(number); close(); previousWord = token; continue; }
    // A word with a digit or a hyphen («Омега-3», «ИЛ-6», «сердечно-лёгочная») is a word like any other.
    if (token.length < 4 && !/[0-9-]/u.test(token) && !latin) { if (number && current.length) current.push({ word: number, abbreviated: false }); else dropNumber(number); continue; }
    // A qualifier the searched concept already covers («катетерная» for «абляция») and the words of an abbreviated disease name are used.
    if (!covered.has(token) && !understood(token) && !qualifierCovered(lower) && !(inName(lower) && nameNear(index))) {
      if (number) current.push({ word: number, abbreviated: false });
      current.push({ word: shown(token), abbreviated: viaAbbreviation(lower) });
    } else { dropNumber(number); close(); }
    previousWord = token;
  }
  close();
  return [...new Set(phrases)];
}
