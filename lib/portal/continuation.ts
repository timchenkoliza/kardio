import type { SpecialtyId } from "@/lib/domain/types";
import { compileIntent } from "@/lib/mesh/intent";
import { normalizeQuery } from "./lexicon";

/**
 * A follow-up typed under a result either continues its question («А если
 * течение нетяжёлое?», «а у детей?») or starts a new one («Аторвастатин:
 * противопоказания»). A continuation keeps every condition of the question it
 * continues and adds its own; a new question is executed as typed.
 */

const STUDY_ID = /(?<![\p{L}])(?:pmid|pmcid|doi)(?![\p{L}])|pubmed\.ncbi|(?<!\d)10\.\d{4,9}\//iu;
const CHILDREN = /(?<![\p{L}])(?:дет(?:и|ей|ям|ск)|ребен|ребён|младен|подрост|новорожд)/u;
const ADULTS = /(?<![\p{L}])взросл/u;
const ADULT_PHRASE = /\s*(?:у|для|среди)\s+взросл\p{L}*/giu;
const CHILD_PHRASE = /\s*(?:у|для|среди)\s+(?:дет(?:ей|и|ям)|ребен\p{L}*|ребён\p{L}*|подростк\p{L}*|новорожд\p{L}*)/giu;
const MAX_FOLLOWUP = 160;

/** Does the follow-up depend on the question it was typed under (it names no disease, drug or study of its own)? */
/** «а при беременности?», «а у пожилых?», «а если течение тяжёлое?», «и при ХБП?»: a short add-on to the question above. */
const ADD_ON = /^(?:а|и|ну а)\s+(?:если|при|у|для|в|во|на|после|без|с|со|как насчёт)\s/iu;

export function isDependentFollowup(text: string, specialty: SpecialtyId): boolean {
  const value = text.trim();
  if (!value || value.length > MAX_FOLLOWUP || STUDY_ID.test(value)) return false;
  const intent = compileIntent(value, specialty);
  // A named drug is a new subject; a short add-on («а при ХБП?») adds a condition even when it names a disease.
  if (intent.entities.drugs.length) return false;
  if (ADD_ON.test(value) && value.split(/\s+/u).length <= 8) return true;
  if (intent.context.nosology) return false;
  return !intent.entities.concepts.some(concept => concept.kind === "topic" || concept.kind === "drug");
}

/** The population a follow-up replaces in the question it continues («взрослые → дети»), or null. */
export function replacedCondition(question: string, followup: string): string | null {
  const before = normalizeQuery(question);
  const value = normalizeQuery(followup);
  if (CHILDREN.test(value) && ADULTS.test(before)) return "взрослые → дети";
  if (ADULTS.test(value) && CHILDREN.test(before)) return "дети → взрослые";
  return null;
}

/**
 * The question to execute: the previous question with the follow-up added.
 * A follow-up that names another population replaces the previous one instead
 * of contradicting it («у взрослых» + «а у детей?» → children only).
 */
export function continuedQuestion(question: string, followup: string): string {
  let base = question.trim().replace(/[?？.!…\s]+$/u, "");
  const value = normalizeQuery(followup);
  if (CHILDREN.test(value)) base = base.replace(ADULT_PHRASE, "");
  if (ADULTS.test(value)) base = base.replace(CHILD_PHRASE, "");
  return `${base.trim()}. Уточнение: ${followup.trim()}`.slice(0, 1200);
}
