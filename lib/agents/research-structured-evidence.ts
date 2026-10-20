import type { ResultAttributeValue } from "./types";

export type ResearchEvidenceTextAccess = "full_text" | "abstract";
export type ResearchEvidenceFieldId = "population" | "intervention" | "comparator" | "endpoint" | "effect";

export interface ResearchEvidenceField {
  value: string;
  supportText: string;
  section: string | null;
  confidence: number;
}

export interface ResearchStructuredEvidence {
  access: ResearchEvidenceTextAccess;
  sourceUrl: string;
  fields: Partial<Record<ResearchEvidenceFieldId, ResearchEvidenceField>>;
}

const PREFIX = "structuredEvidence";
const FIELD_IDS: readonly ResearchEvidenceFieldId[] = ["population", "intervention", "comparator", "endpoint", "effect"];

function key(field: ResearchEvidenceFieldId, suffix: "value" | "support" | "section" | "confidence") {
  return `${PREFIX}.${field}.${suffix}`;
}

export function structuredEvidenceToAttributes(value: ResearchStructuredEvidence): Record<string, ResultAttributeValue> {
  const attributes: Record<string, ResultAttributeValue> = {
    [`${PREFIX}.access`]: value.access,
    [`${PREFIX}.sourceUrl`]: value.sourceUrl,
  };
  for (const fieldId of FIELD_IDS) {
    const field = value.fields[fieldId];
    if (!field) continue;
    attributes[key(fieldId, "value")] = field.value;
    attributes[key(fieldId, "support")] = field.supportText;
    attributes[key(fieldId, "section")] = field.section;
    attributes[key(fieldId, "confidence")] = field.confidence;
  }
  return attributes;
}

function stringValue(value: ResultAttributeValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function structuredEvidenceFromAttributes(attributes: Record<string, ResultAttributeValue>): ResearchStructuredEvidence | null {
  const access = attributes[`${PREFIX}.access`];
  const sourceUrl = stringValue(attributes[`${PREFIX}.sourceUrl`]);
  if ((access !== "full_text" && access !== "abstract") || !sourceUrl) return null;

  const fields: ResearchStructuredEvidence["fields"] = {};
  for (const fieldId of FIELD_IDS) {
    const value = stringValue(attributes[key(fieldId, "value")]);
    const supportText = stringValue(attributes[key(fieldId, "support")]);
    if (!value || !supportText) continue;
    const confidenceRaw = attributes[key(fieldId, "confidence")];
    fields[fieldId] = {
      value,
      supportText,
      section: stringValue(attributes[key(fieldId, "section")]),
      confidence: typeof confidenceRaw === "number" ? Math.max(0, Math.min(1, confidenceRaw)) : 0.5,
    };
  }
  return { access, sourceUrl, fields };
}

export function structuredEvidenceCompleteness(value: ResearchStructuredEvidence | null): number {
  if (!value) return 0;
  return FIELD_IDS.filter(field => Boolean(value.fields[field])).length;
}
