import type { SpecialtyId } from "@/lib/domain/types";
import type { PortalJob } from "@/lib/portal/jobs";
import { latinTermsIn, normalizeQuery, type DrugEntry, type QueryConcept } from "@/lib/portal/lexicon";
import { routePortalIntent, type PortalRoute } from "@/lib/portal/router";
import { detectDomain, NOSOLOGIES, scenarioFor, type SafetyRuleId } from "./domain-graph";
import { DEFAULT_JOB_FOR_FAMILY, JOB_DEFINITIONS, type EvidenceRequirement, type JobType } from "./jobs";
import type { ModuleFamily } from "./manifest";

/**
 * Intent compiler: physician text → NormalizedIntent.
 *
 *   family routing (portal router, deterministic)
 *   + entities (lexicon: drugs, concepts, populations)
 *   + domain context (skill graph: nosology, subtype, scenario)
 *   → job type + evidence requirements + safety rules + preferred modules
 *
 * No model is involved, and nothing here chooses a source: that is the
 * planner's job. The intent never stores raw text beyond the run's own
 * sanitized input.
 */

export interface NormalizedIntent {
  id: string;
  job: { primary: JobType; family: PortalJob; confidence: number; reasons: string[]; explicit: boolean };
  context: {
    specialty: SpecialtyId;
    nosology: { id: string; label: string; specialty: SpecialtyId } | null;
    subtype: { id: string; label: string } | null;
    populations: string[];
    scenario: string | null;
    /** Words that matched the domain graph (shown in the trace, never logged). */
    matched: string[];
  };
  entities: { drugs: DrugEntry[]; concepts: QueryConcept[]; latin: string[] };
  requirements: EvidenceRequirement[];
  optional: EvidenceRequirement[];
  safety: SafetyRuleId[];
  modules: ModuleFamily[];
  vague: boolean;
  /** Family routing kept for compatibility with existing jobs and telemetry. */
  route: PortalRoute;
}

const L = "(?<![\\p{L}])";
const DISEASE_REFERENCE = new RegExp(`${L}(?:что такое|определени|классификац|критери\\p{L}* диагноз|этиолог|патогенез)`, "u");
const RUSSIAN_ARTICLES = new RegExp(`${L}стат(?:ья|ьи|ью|ей|ьям)`, "u");
const RUSSIAN_SCOPE = new RegExp(`${L}(?:русск|отечествен|российск)`, "u");
const INN_LOOKUP = new RegExp(`${L}(?:аналог|дженерик|какие препараты|торгов\\p{L}* назван|препараты с |препараты на основе)`, "u");
const CURRENT_STATE = new RegExp(`${L}(?:сейчас|актуальн|изменил|нового|обновл|по-прежнему|действующ|последн\\p{L}* верси|пересмотр)`, "u");

function chooseJobType(family: PortalJob, text: string, args: { drugs: number; nosology: boolean }): { job: JobType; reason: string | null } {
  const value = normalizeQuery(text);
  switch (family) {
    case "answer":
      if (args.nosology && DISEASE_REFERENCE.test(value)) return { job: "disease_reference", reason: "вопрос о самом заболевании" };
      if (RUSSIAN_ARTICLES.test(value) && RUSSIAN_SCOPE.test(value)) return { job: "professional_article_search", reason: "нужны статьи на русском" };
      return { job: "reference_answer", reason: null };
    case "drug":
      if (INN_LOOKUP.test(value)) return { job: "inn_lookup", reason: "нужны препараты с этим действующим веществом" };
      return { job: "drug_reference", reason: null };
    case "guidelines":
      if (args.drugs) return { job: "guideline_check", reason: "препарат в контексте рекомендаций" };
      if (CURRENT_STATE.test(value)) return { job: "guideline_check", reason: "вопрос о текущем состоянии рекомендаций" };
      return { job: "guideline_discovery", reason: null };
    default:
      return { job: DEFAULT_JOB_FOR_FAMILY[family], reason: null };
  }
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** Deterministic id from the interpreted intent (not from the raw text). */
function intentId(parts: readonly string[]): string {
  let hash = 2166136261;
  for (const char of parts.join("|")) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return `intent-${hash.toString(36)}`;
}

/**
 * `jobType` executes the request as a known job (a matched Skill's `executesAs`):
 * the family follows the job, everything else is compiled exactly as for any request.
 */
export function compileIntent(text: string, specialty: SpecialtyId, options: { job?: PortalJob | null; jobType?: JobType | null } = {}): NormalizedIntent {
  const forced = options.jobType ? JOB_DEFINITIONS[options.jobType].family : null;
  const natural = routePortalIntent(text, specialty, { job: options.job ?? null });
  // A Skill's job keeps the router's own explanation of what was recognised (never «вы выбрали»).
  const route = forced && forced !== natural.job ? { ...routePortalIntent(text, specialty, { job: forced }), reasons: natural.reasons, confidence: natural.confidence } : natural;
  const domain = detectDomain(text, specialty);
  const drugs = route.drugs;
  const { job, reason } = options.jobType ? { job: options.jobType, reason: null } : chooseJobType(route.job, text, { drugs: drugs.length, nosology: Boolean(domain.nosology) });
  const definition = JOB_DEFINITIONS[job];
  const scenario = scenarioFor(job, specialty, domain.nosology?.id ?? null, domain.subtype?.id ?? null);

  const requirements: EvidenceRequirement[] = [...definition.requirements];
  const optional: EvidenceRequirement[] = [...definition.optional];
  // A named drug in a guideline or answer question needs the Russian instruction to be honest.
  if (drugs.length && (job === "guideline_check" || job === "reference_answer")) requirements.push("russian_drug_reference");
  // A clinical question about a recognised disease is incomplete for a Russian physician without the Russian guideline.
  if (domain.nosology && job === "reference_answer") requirements.push("russian_guideline");
  for (const requirement of scenario?.requirements ?? []) {
    // Scenario requirements are «official status» hand-offs and society sources: optional unless the scenario is specific.
    if (scenario?.nosology) requirements.push(requirement);
    else optional.push(requirement);
  }

  const populations = route.concepts.filter(concept => concept.kind === "population").map(concept => concept.id.replace("population:", ""));
  const safety = unique<SafetyRuleId>([
    "no_prescribing",
    ...(domain.nosology?.safety ?? []),
    ...(scenario?.safety ?? []),
    ...(populations.includes("children") ? ["pediatric_sections" as const] : []),
    ...(populations.includes("pregnancy") || populations.includes("lactation") ? ["pregnancy_sections" as const] : []),
    ...(drugs.length ? ["jurisdiction_boundary" as const] : []),
  ]);

  const reasons = [...route.reasons];
  if (reason) reasons.push(`Уточнили задачу: ${reason}`);
  if (domain.nosology) reasons.push(`Тема: ${domain.nosology.label}${domain.subtype ? ` ${domain.subtype.label}` : ""}`);

  const nosologySpecialty = domain.nosology ? NOSOLOGIES.find(node => node.id === domain.nosology!.id)!.specialty : null;
  return {
    // Every recognised condition is part of the identity: two questions that differ in what they ask
    // («длительность» vs «диагностика», «+ нетяжёлое течение») never share a cached answer.
    id: intentId([specialty, job, domain.nosology?.id ?? "", domain.subtype?.id ?? "", ...drugs.map(drug => drug.inn), ...populations, ...route.concepts.map(concept => concept.id).sort(), ...latinTermsIn(text).sort()]),
    job: { primary: job, family: route.job, confidence: route.confidence, reasons, explicit: Boolean(options.job) && !forced },
    context: {
      specialty,
      nosology: domain.nosology && nosologySpecialty ? { id: domain.nosology.id, label: domain.nosology.label, specialty: nosologySpecialty } : null,
      subtype: domain.subtype ? { id: domain.subtype.id, label: domain.subtype.label } : null,
      populations,
      scenario: scenario?.id ?? null,
      matched: domain.evidence,
    },
    entities: { drugs, concepts: route.concepts, latin: latinTermsIn(text) },
    requirements: unique(requirements),
    optional: unique(optional).filter(item => !requirements.includes(item)),
    safety,
    modules: [...(scenario?.modules ?? ["key_takeaway", "evidence", "sources", "next_actions"])],
    vague: route.vague && !domain.nosology,
    route,
  };
}
