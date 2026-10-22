import type { ResultAttributeValue } from "./types";
import type { ResearchEvidenceField, ResearchEvidenceFieldId, ResearchStructuredEvidence } from "./research-structured-evidence";

export type ResearchStudyFieldId =
  | "sampleSize"
  | "age"
  | "population"
  | "inclusionCriteria"
  | "intervention"
  | "dose"
  | "duration"
  | "comparator"
  | "endpoint"
  | "followUp"
  | "effectMeasure"
  | "effectEstimate"
  | "confidenceInterval"
  | "pValue";

export interface ResearchStudyField {
  value: string;
  supportText: string;
  sourceField: ResearchEvidenceFieldId;
  confidence: number;
}

export interface ResearchStudyNormalization {
  fields: Partial<Record<ResearchStudyFieldId, ResearchStudyField>>;
}

const PREFIX = "studyNormalization";
export const RESEARCH_STUDY_FIELD_IDS: readonly ResearchStudyFieldId[] = [
  "sampleSize",
  "age",
  "population",
  "inclusionCriteria",
  "intervention",
  "dose",
  "duration",
  "comparator",
  "endpoint",
  "followUp",
  "effectMeasure",
  "effectEstimate",
  "confidenceInterval",
  "pValue",
];

function attributeKey(field: ResearchStudyFieldId, suffix: "value" | "support" | "sourceField" | "confidence") {
  return `${PREFIX}.${field}.${suffix}`;
}

function clamp(value: string, max = 220): string {
  const clean = value.replace(/\s+/gu, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function normalizedField(value: string, sourceField: ResearchEvidenceFieldId, source: ResearchEvidenceField, multiplier = 1): ResearchStudyField {
  return {
    value: clamp(value),
    supportText: source.supportText,
    sourceField,
    confidence: Math.round(Math.max(0, Math.min(1, source.confidence * multiplier)) * 100) / 100,
  };
}

/**
 * The Lancet prints decimals with a middle dot («0·72», «p=0·003»). Read as is,
 * «0·72» parses as «0»: a false number. Values are read from a copy where the
 * dot between digits is a decimal point; the quote keeps the original text.
 */
export function decimalText(value: string): string {
  return value.replace(/(\d)\s?[·•]\s?(?=\d)/gu, "$1.");
}

function sentenceMatch(source: ResearchEvidenceField | undefined, sourceField: ResearchEvidenceFieldId, pattern: RegExp, formatter: (match: RegExpMatchArray) => string, multiplier = 1): ResearchStudyField | null {
  if (!source) return null;
  const match = decimalText(source.supportText).match(pattern);
  if (!match) return null;
  return normalizedField(formatter(match), sourceField, source, multiplier);
}

/** A value read from one sentence: that sentence is its quote, not the whole support text. */
function quotedField(value: string, source: ResearchEvidenceField, quote: string): ResearchStudyField {
  return { ...normalizedField(value, "effect", source, 0.99), supportText: quote };
}

// Abbreviations are matched case-sensitively: «12 or 24 months» and «24 hr» are not an odds or hazard ratio.
const MEASURE = "(?:[Hh]azard|[Rr]isk|[Oo]dds|[Rr]ate) [Rr]atios?|[Rr]elative [Rr]isk|[Mm]ean [Dd]ifference|a?HR|RR|a?OR";
const EFFECT = new RegExp(`(?<![A-Za-z])(${MEASURE})(?![A-Za-z])(?:\\s*[([]\\s*(?:a?HR|RR|a?OR)\\s*[)\\]])?\\s*(?:was|of|=|:|,)?\\s*([−-]?\\d+(?:\\.\\d+)?)(?!\\d|\\.\\d|\\s*%|,\\d)`, "u");
const NEXT_MEASURE = new RegExp(`(?<![A-Za-z])(?:${MEASURE})(?![A-Za-z])`, "u");
const INTERVAL = /95%\s*(?:confidence\s+interval|CI)(?:\s*[([]CI[)\]])?\s*[,;:=]?\s*([−-]?\d+(?:\.\d+)?)\s*(?:to|[-–])\s*([−-]?\d+(?:\.\d+)?)(?!\s*%|\d)/iu;
const P_VALUE = /(?<![A-Za-z])[Pp]\s*(<=|>=|=|<|>|≤|≥)\s*(0?\.\d+|\d+(?:\.\d+)?)(?![\d%])/u;

function effectSentences(value: string): string[] {
  return value.replace(/\s+/gu, " ").split(/(?<=[.!?])\s+(?=[A-Z([])/u).filter(sentence => sentence.trim().length > 0);
}

/**
 * The first sentence that states a ratio or a mean difference with its value.
 * The interval and p are read only from the same statement — up to the next
 * effect measure — and kept only when consistent with the estimate. A value
 * followed by «%» or a decimal comma is not read at all.
 */
export function readEffect(text: string): { measure: string; estimate: string; interval: string | null; pValue: string | null; quote: string } | null {
  for (const sentence of effectSentences(text)) {
    const value = decimalText(sentence);
    const match = value.match(EFFECT);
    if (!match || match.index === undefined) continue;
    const measure = normalizeEffectMeasure(match[1].replace(/^a(?=HR|OR)/u, ""));
    const estimate = match[2].replace("−", "-");
    const ratio = measure === "HR" || measure === "RR" || measure === "OR" || measure === "Rate ratio";
    // A ratio is never zero or negative: such a reading is a parsing error, not a result.
    if (ratio && !(Number(estimate) > 0)) continue;
    let clause = value.slice(match.index + match[0].length);
    const next = clause.search(NEXT_MEASURE);
    if (next >= 0) clause = clause.slice(0, next);
    const ci = clause.match(INTERVAL);
    let interval: string | null = null;
    if (ci?.[1] && ci?.[2]) {
      const lower = Number(ci[1].replace("−", "-"));
      const upper = Number(ci[2].replace("−", "-"));
      const point = Number(estimate);
      if (lower <= point && point <= upper && (!ratio || lower > 0)) interval = `${ci[1].replace("−", "-")}–${ci[2].replace("−", "-")}`;
    }
    const p = clause.match(P_VALUE);
    return { measure, estimate, interval, pValue: p ? `p ${p[1]} ${p[2]}` : null, quote: sentence.trim() };
  }
  return null;
}

function normalizeEffectMeasure(value: string): string {
  const key = value.toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  if (key === "hr" || key.includes("hazard ratio")) return "HR";
  if (key === "rr" || key.includes("risk ratio") || key.includes("relative risk")) return "RR";
  if (key === "or" || key.includes("odds ratio")) return "OR";
  if (key.includes("rate ratio")) return "Rate ratio";
  if (key.includes("mean difference")) return "Mean difference";
  return value;
}

function explicitPopulation(source: ResearchEvidenceField | undefined): ResearchStudyField | null {
  if (!source) return null;
  return normalizedField(source.value, "population", source, 0.96);
}

function explicitInclusionCriteria(source: ResearchEvidenceField | undefined): ResearchStudyField | null {
  if (!source) return null;
  const text = source.supportText;
  if (!/\b(inclusion criteria|eligible (?:patients|participants|subjects|adults|children|women|men)|(?:patients?|participants?|subjects?|adults?|children|women|men) (?:were )?eligible|included (?:patients|participants|subjects|adults|children|women|men) with|(?:patients?|participants?|subjects?|adults?|children|women|men) with)\b/iu.test(text)) return null;
  return normalizedField(source.value, "population", source, 0.88);
}

function normalizedIntervention(source: ResearchEvidenceField | undefined): ResearchStudyField | null {
  if (!source) return null;
  const match = source.supportText.match(/\b(?:received|treated with|assigned to|randomi[sz]ed to)\s+(.+?)(?=\s+(?:versus|vs\.?|compared with|or)\b|[.;]|$)/iu);
  return normalizedField(match?.[1] ?? source.value, "intervention", source, match?.[1] ? 0.96 : 0.88);
}

function normalizedComparator(source: ResearchEvidenceField | undefined): ResearchStudyField | null {
  if (!source) return null;
  const known = source.supportText.match(/\b(placebo|usual care|standard care|control group|no treatment)\b/iu);
  if (known?.[1]) return normalizedField(known[1], "comparator", source, 0.98);
  const compared = source.supportText.match(/\b(?:compared with|versus|vs\.?)\s+([^.;,]{2,120})/iu);
  return normalizedField(compared?.[1] ?? source.value, "comparator", source, compared?.[1] ? 0.94 : 0.86);
}

function normalizedEndpoint(source: ResearchEvidenceField | undefined): ResearchStudyField | null {
  if (!source) return null;
  const match = source.supportText.match(/\bprimary(?:\s+(?:efficacy|safety|composite|clinical))?\s+(?:end\s?point|outcome)(?:\s+(?:was|were|included|comprised|consisted of))?\s*[:,-]?\s*([^.;]{8,180})/iu);
  if (match?.[1]) return normalizedField(match[1], "endpoint", source, 0.96);
  // The endpoint field is matched on «follow-up» too: a sentence that never names an endpoint or outcome is not one.
  if (!/\b(?:end\s?points?|outcomes?)\b/iu.test(source.value)) return null;
  return normalizedField(source.value, "endpoint", source, 0.88);
}

function firstFollowUp(structured: ResearchStructuredEvidence): ResearchStudyField | null {
  for (const sourceField of ["effect", "endpoint", "population", "intervention"] as const) {
    const source = structured.fields[sourceField];
    const value = sentenceMatch(
      source,
      sourceField,
      /\b((?:median|mean)\s+)?follow[- ]up(?:\s+(?:was|of))?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|years?)\b/iu,
      match => `${match[2]} ${match[3]}${match[1] ? ` (${match[1].trim().toLocaleLowerCase("en-US")})` : ""}`,
      0.96,
    );
    if (value) return value;
  }
  return null;
}

export function normalizeResearchStudy(structured: ResearchStructuredEvidence | null): ResearchStudyNormalization | null {
  if (!structured) return null;
  const population = structured.fields.population;
  const intervention = structured.fields.intervention;
  const comparator = structured.fields.comparator;
  const endpoint = structured.fields.endpoint;
  const effect = structured.fields.effect;
  const fields: ResearchStudyNormalization["fields"] = {};

  const sampleSize = sentenceMatch(
    population,
    "population",
    // A count is a sample size only after an enrolment word or «n =»: «occurred in 386 patients» is an event count.
    /\b(?:n\s*=\s*(\d{1,3}(?:[,\s]\d{3})+|\d{1,7})|a total of\s+(\d{1,3}(?:[,\s]\d{3})+|\d{1,7})\s+(?:patients?|participants?|subjects?|adults?|children|women|men)|(?:enrolled|included|randomi[sz]ed|assigned|recruited|involving|comprising)\s+(\d{1,3}(?:[,\s]\d{3})+|\d{1,7})(?!\s*:|\d|\s+(?:randomi[sz]ed\s+)?(?:controlled\s+)?(?:trials?|studies|RCTs?|cohorts?|articles|reports)))\b/iu,
    match => {
      const count = match[1] ?? match[2] ?? match[3] ?? "";
      return `N=${count.replace(/[,\s]/gu, "")}`;
    },
    0.98,
  );
  if (sampleSize) fields.sampleSize = sampleSize;

  const meanMedianAge = sentenceMatch(
    population,
    "population",
    /\b(mean|median)\s+age(?:\s+(?:was|of))?\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)\s*(?:years?|yrs?|y)\b/iu,
    match => `${match[2]} years (${match[1].toLocaleLowerCase("en-US")})`,
    0.96,
  );
  const ageRange = meanMedianAge ?? sentenceMatch(
    population,
    "population",
    /\b(?:aged?|age(?:\s+range)?(?:\s+(?:was|of))?)\s*[:=]?\s*(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s*(?:years?|yrs?)\b/iu,
    match => `${match[1]}–${match[2]} years`,
    0.94,
  );
  const ageThreshold = ageRange ?? sentenceMatch(
    population,
    "population",
    /\baged?\s+(\d{1,3})\s+years?\s+(?:or older|and older|or above)\b/iu,
    match => `≥${match[1]} years`,
    0.94,
  );
  if (ageThreshold) fields.age = ageThreshold;

  const populationValue = explicitPopulation(population);
  if (populationValue) fields.population = populationValue;
  const inclusion = explicitInclusionCriteria(population);
  if (inclusion) fields.inclusionCriteria = inclusion;

  const interventionValue = normalizedIntervention(intervention);
  if (interventionValue) fields.intervention = interventionValue;
  const dose = sentenceMatch(
    intervention,
    "intervention",
    /\b(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|g|ml|mL|IU|units?)(?:\s+(?:once|twice|three times)\s+daily|\s+(?:daily|bid|tid|q\d+h))?)/iu,
    match => match[1],
    0.98,
  );
  if (dose) fields.dose = dose;
  const duration = sentenceMatch(
    intervention,
    "intervention",
    /\b(?:for|during|over|treatment duration(?:\s+(?:was|of))?|therapy for)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|years?)\b/iu,
    match => `${match[1]} ${match[2]}`,
    0.94,
  );
  if (duration) fields.duration = duration;

  const comparatorValue = normalizedComparator(comparator);
  if (comparatorValue) fields.comparator = comparatorValue;
  const endpointValue = normalizedEndpoint(endpoint);
  if (endpointValue) fields.endpoint = endpointValue;
  const followUp = firstFollowUp(structured);
  if (followUp) fields.followUp = followUp;

  if (effect) {
    const read = readEffect(effect.supportText);
    if (read) {
      fields.effectMeasure = quotedField(read.measure, effect, read.quote);
      fields.effectEstimate = quotedField(read.estimate, effect, read.quote);
      if (read.interval) fields.confidenceInterval = quotedField(read.interval, effect, read.quote);
      if (read.pValue) fields.pValue = quotedField(read.pValue, effect, read.quote);
    }
  }

  return Object.keys(fields).length ? { fields } : null;
}

export function researchStudyNormalizationToAttributes(value: ResearchStudyNormalization | null): Record<string, ResultAttributeValue> {
  if (!value) return {};
  const attributes: Record<string, ResultAttributeValue> = {};
  for (const fieldId of RESEARCH_STUDY_FIELD_IDS) {
    const field = value.fields[fieldId];
    if (!field) continue;
    attributes[attributeKey(fieldId, "value")] = field.value;
    attributes[attributeKey(fieldId, "support")] = field.supportText;
    attributes[attributeKey(fieldId, "sourceField")] = field.sourceField;
    attributes[attributeKey(fieldId, "confidence")] = field.confidence;
  }
  return attributes;
}

function stringValue(value: ResultAttributeValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function researchStudyNormalizationFromAttributes(attributes: Record<string, ResultAttributeValue>): ResearchStudyNormalization | null {
  const fields: ResearchStudyNormalization["fields"] = {};
  for (const fieldId of RESEARCH_STUDY_FIELD_IDS) {
    const value = stringValue(attributes[attributeKey(fieldId, "value")]);
    const supportText = stringValue(attributes[attributeKey(fieldId, "support")]);
    const sourceField = stringValue(attributes[attributeKey(fieldId, "sourceField")]);
    if (!value || !supportText || !sourceField || !["population", "intervention", "comparator", "endpoint", "effect"].includes(sourceField)) continue;
    const confidenceRaw = attributes[attributeKey(fieldId, "confidence")];
    fields[fieldId] = {
      value,
      supportText,
      sourceField: sourceField as ResearchEvidenceFieldId,
      confidence: typeof confidenceRaw === "number" ? Math.max(0, Math.min(1, confidenceRaw)) : 0.5,
    };
  }
  return Object.keys(fields).length ? { fields } : null;
}

export function researchStudyNormalizationCompleteness(value: ResearchStudyNormalization | null): number {
  if (!value) return 0;
  return RESEARCH_STUDY_FIELD_IDS.filter(field => Boolean(value.fields[field])).length;
}
