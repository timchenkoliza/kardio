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
  const match = source.supportText.match(/\bprimary\s+(?:endpoint|outcome)(?:\s+(?:was|were|included|comprised|consisted of))?\s*[:,-]?\s*([^.;]{8,180})/iu);
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
    /\b(?:n\s*=\s*(\d{1,3}(?:[,\s]\d{3})+|\d{1,7})|(?:a total of\s+)?(\d{1,3}(?:[,\s]\d{3})+|\d{1,7})\s+(?:patients?|participants?|subjects?|adults?|children|women|men)|(?:enrolled|included|randomi[sz]ed|assigned)\s+(\d{1,3}(?:[,\s]\d{3})+|\d{1,7}))\b/iu,
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
    /\b(?:aged?|age(?:\s+range)?(?:\s+(?:was|of))?)\s*[:=]?\s*(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s*(?:years?)?\b/iu,
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
    // NEJM / Lancet style: «hazard ratio, 0.74» and «hazard ratio (HR) 0.74» state the same value as «HR = 0.74».
    const effectText = decimalText(effect.supportText);
    const effectMatch = effectText.match(/\b(hazard ratio|risk ratio|relative risk|odds ratio|rate ratio|mean difference|HR|RR|OR)\b(?:\s*\((?:HR|RR|OR)\))?\s*(?:was|of|=|:|,)?\s*([−-]?\d+(?:\.\d+)?)/iu);
    const measure = effectMatch?.[1] ? normalizeEffectMeasure(effectMatch[1]) : null;
    const estimate = effectMatch?.[2] ? effectMatch[2].replace("−", "-") : null;
    // A ratio is never zero or negative: such a reading is a parsing error, not a result.
    const ratio = measure === "HR" || measure === "RR" || measure === "OR" || measure === "Rate ratio";
    const plausible = estimate !== null && (!ratio || Number(estimate) > 0);
    if (measure && plausible) fields.effectMeasure = normalizedField(measure, "effect", effect, 0.99);
    if (estimate && plausible) fields.effectEstimate = normalizedField(estimate, "effect", effect, 0.99);

    // The interval and p belong to the estimate only when they follow it in the same sentence: values from another
    // sentence (a secondary endpoint, a mean difference) must never be glued to this ratio.
    const after = effectMatch?.index !== undefined ? effectText.slice(effectMatch.index + effectMatch[0].length) : "";
    const clause = after.split(/(?<=\.)\s+(?=[A-Z])/u)[0].slice(0, 220);
    const ci = clause.match(/\b95%\s*(?:confidence\s+interval|CI)(?:\s*\[CI\])?\s*[,;:=]?\s*([−-]?\d+(?:\.\d+)?)\s*(?:to|[-–])\s*([−-]?\d+(?:\.\d+)?)/iu);
    if (plausible && ci?.[1] && ci?.[2]) {
      const lower = Number(ci[1].replace("−", "-"));
      const upper = Number(ci[2].replace("−", "-"));
      const value = Number(estimate);
      const consistent = lower <= value && value <= upper && (!ratio || lower > 0);
      if (consistent) fields.confidenceInterval = normalizedField(`${ci[1].replace("−", "-")}–${ci[2].replace("−", "-")}`, "effect", effect, 0.99);
    }

    const pValue = clause.match(/\bp\s*(<=|>=|=|<|>|≤|≥)\s*(0?\.\d+|\d+(?:\.\d+)?)\b/iu);
    if (plausible && pValue?.[1] && pValue?.[2]) fields.pValue = normalizedField(`p ${pValue[1]} ${pValue[2]}`, "effect", effect, 0.99);
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
