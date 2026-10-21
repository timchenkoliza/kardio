import type { SpecialtyId } from "@/lib/domain/types";
import { normalizeQuery } from "@/lib/portal/lexicon";
import { NOSOLOGIES } from "./domain-graph";
import type { NormalizedIntent } from "./intent";
import type { SessionEntity } from "./session-context";
import { clarificationManifestSchema, type ClarificationManifest, type ClarificationOption, type IntentSkill, type SkillMatch } from "./skills/types";

/**
 * Clarification — one compact question, only when the answer changes what
 * will be executed. Never onboarding, never «choose an agent», never «choose
 * your sources». The physician can pick an option or just type; the original
 * question is preserved in the manifest and in the input.
 *
 *   «Семаглутид — что с ним?»   → no question: a drug reference answers it
 *   «Подходит ли семаглутид?»   → which facet: indications, safety, dosing, comparison, new data
 */

const L = "(?<![\\p{L}])";
const SUITABILITY = new RegExp(`${L}(?:подходит\\s+ли|подойдет\\s+ли|годится\\s+ли|стоит\\s+ли\\s+(?:назначать|назначить|применять)|можно\\s+ли\\s+(?:его\\s+|ее\\s+)?(?:назначить|назначать|применять|использовать))`, "u");
/** A facet already named: the question is specific enough to execute. */
const FACET_NAMED = new RegExp(`${L}(?:показани|противопоказ|дозир|дозиров|побочн|взаимодейств|безопасн|беремен|лактац|дет|ребен|пожил|почк|печен|исследован|сравни|аналог)`, "u");
/** The question asks about the drug alone (nothing else recognised but the drug and the facet phrase). */
const MAX_SUITABILITY_LENGTH = 80;

function clarificationId(parts: readonly string[]): string {
  let hash = 2166136261;
  for (const char of parts.join("|")) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return `clarify-${hash.toString(36)}`;
}

function capital(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase("ru-RU")}${value.slice(1)}`;
}

function finish(manifest: ClarificationManifest): ClarificationManifest {
  return clarificationManifestSchema.parse(manifest);
}

/** «Подходит ли X?» with nothing else: the facet decides what is retrieved and shown. */
export function suitabilityClarification(text: string, intent: NormalizedIntent): ClarificationManifest | null {
  const value = normalizeQuery(text);
  if (intent.job.explicit || value.length > MAX_SUITABILITY_LENGTH || !SUITABILITY.test(value)) return null;
  if (intent.entities.drugs.length !== 1 || intent.context.nosology || intent.context.populations.length || FACET_NAMED.test(value)) return null;
  const drug = intent.entities.drugs[0];
  const name = capital(drug.ru);
  const options: ClarificationOption[] = [
    { id: "indications", label: "Показания", effect: { job: "drug", focus: ["indication"], completeText: `${name}: показания к применению` } },
    { id: "safety", label: "Безопасность", effect: { job: "drug", focus: ["contraindication", "warning"], completeText: `${name}: противопоказания и особые указания` } },
    { id: "dosing", label: "Дозирование", effect: { job: "drug", focus: ["dosing"], completeText: `${name}: способ применения и дозы` } },
    { id: "compare", label: "Сравнить препараты", effect: { focus: ["comparison"], completeText: `Сравни ${drug.ru} с `, edit: true } },
    { id: "new_data", label: "Новые данные", effect: { job: "research", focus: ["review_conclusion"], completeText: `${name}: новые исследования` } },
  ];
  return finish({ schema: "kardio.clarification/0.1", id: clarificationId(["suitability", intent.context.specialty, drug.inn]), question: `Что важно уточнить про ${drug.ru}?`, options, allowFreeText: true, reason: "facet_changes_execution", original: { text, specialty: intent.context.specialty } });
}

/** A Skill's job is clearly asked for, but its topic is not named and the session cannot supply it. */
export function missingContextClarification(text: string, specialty: SpecialtyId, skill: IntentSkill, missing: readonly string[]): ClarificationManifest | null {
  if (missing.includes("nosology")) {
    const own = NOSOLOGIES.filter(node => node.specialty === specialty && (!skill.domain.nosologies || skill.domain.nosologies.includes(node.id)));
    if (!own.length) return null;
    const stem = text.trim().replace(/[?？.!…]+$/u, "");
    const options: ClarificationOption[] = own.slice(0, 5).map(node => ({ id: node.id.split("/").at(-1)!, label: node.label.length > 60 ? node.label.slice(0, 59) : node.label, effect: { completeText: `${stem}: ${node.label.toLocaleLowerCase("ru-RU")}` } }));
    return finish({ schema: "kardio.clarification/0.1", id: clarificationId(["topic", specialty, skill.id]), question: "По какой теме?", options, allowFreeText: true, reason: "entity_unresolved", original: { text, specialty } });
  }
  if (missing.includes("drug")) {
    return finish({ schema: "kardio.clarification/0.1", id: clarificationId(["drug", specialty, skill.id]), question: "О каком препарате речь?", options: [], allowFreeText: true, reason: "entity_unresolved", original: { text, specialty } });
  }
  return null;
}

/** «этот препарат» with two recent drugs of similar weight: which one. */
export function referenceClarification(text: string, specialty: SpecialtyId, candidates: readonly SessionEntity[]): ClarificationManifest {
  const kind = candidates[0]?.kind ?? "drug";
  const options: ClarificationOption[] = candidates.slice(0, 4).map(entity => ({ id: entity.id.replace(/[^a-z0-9_]/giu, "_").slice(0, 40), label: capital(entity.label).slice(0, 60), effect: { entity: entity.id, completeText: `${text.trim().replace(/[?？.!…]+$/u, "")} (${entity.label})` } }));
  return finish({ schema: "kardio.clarification/0.1", id: clarificationId(["reference", specialty, ...candidates.map(entity => entity.id)]), question: kind === "drug" ? "О каком препарате речь?" : "О какой теме речь?", options, allowFreeText: true, reason: "entity_unresolved", original: { text, specialty } });
}

/** Two Skills fit and would execute differently, with nearly the same confidence. */
export function skillsDisagreeClarification(text: string, specialty: SpecialtyId, pair: ReadonlyArray<{ match: SkillMatch; skill: IntentSkill }>): ClarificationManifest {
  const options: ClarificationOption[] = pair.map(({ skill }) => ({ id: skill.id.split(".").at(-1)!.slice(0, 40), label: skill.experiencePolicy.explanation.slice(0, 60), effect: { prefer: skill.id } }));
  return finish({ schema: "kardio.clarification/0.1", id: clarificationId(["skills", specialty, ...pair.map(item => item.skill.id)]), question: "Что важнее сейчас?", options, allowFreeText: true, reason: "skills_disagree", original: { text, specialty } });
}

/** The option the physician picked, validated against the manifest the server rebuilds deterministically. */
export function optionOf(manifest: ClarificationManifest, optionId: string | null): ClarificationOption | null {
  return optionId ? manifest.options.find(option => option.id === optionId) ?? null : null;
}
