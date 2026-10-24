import type { SpecialtyId } from "@/lib/domain/types";
import { normalizeQuery } from "@/lib/portal/lexicon";
import type { EvidenceRequirement, JobType } from "./jobs";
import type { ModuleFamily } from "./manifest";

/**
 * Domain Skill Graph: SPECIALTY → NOSOLOGY → SUBTYPE → SCENARIO (job).
 *
 * This is taxonomy, not agent count. One graph node changes how an intent is
 * interpreted (terminology, ICD-10), which evidence is required, which safety
 * rules apply, how results are ranked and which result modules are preferred.
 * It never adds an executor. v0.1 models a handful of high-frequency
 * nosologies across the six launch specialties — not «all diseases».
 *
 * Patterns run on normalizeQuery() text (lowercase, ё → е).
 */

export type SafetyRuleId =
  | "no_prescribing"
  | "jurisdiction_boundary"
  | "pediatric_sections"
  | "pregnancy_sections"
  | "currentness_must_be_shown";

export interface NosologyNode {
  kind: "nosology";
  id: string;
  specialty: SpecialtyId;
  label: string;
  en: string;
  match: readonly string[];
  icd10: readonly string[];
  pubmed: string;
  /** Words of the Russian guideline title, matched against listings of any source. */
  guidelineTitle: readonly string[];
  /** English title words that make a publication on-topic (ranking). */
  rankingTerms: readonly string[];
  safety: readonly SafetyRuleId[];
  /** Topic id in lib/agents/vocabulary.ts, when the specialty vocabulary has one. */
  topicId: string | null;
}

export interface SubtypeNode {
  kind: "subtype";
  id: string;
  nosology: string;
  label: string;
  en: string;
  match: readonly string[];
  pubmed: string;
  /** Russian section-heading words that identify this subtype inside a guideline. */
  sectionTerms: readonly string[];
  rankingTerms: readonly string[];
}

export interface ScenarioNode {
  kind: "scenario";
  id: string;
  job: JobType;
  specialty: SpecialtyId | null;
  nosology: string | null;
  subtype: string | null;
  /** Extra requirements on top of the job's own. */
  requirements: readonly EvidenceRequirement[];
  /** Preferred module families, in policy order. */
  modules: readonly ModuleFamily[];
  safety: readonly SafetyRuleId[];
}

const n = (node: Omit<NosologyNode, "kind" | "safety" | "topicId"> & { safety?: SafetyRuleId[]; topicId?: string | null }): NosologyNode => ({ kind: "nosology", safety: [], topicId: null, ...node });

export const NOSOLOGIES: readonly NosologyNode[] = [
  n({ id: "cardiology/heart_failure", specialty: "cardiology", label: "Хроническая сердечная недостаточность", en: "heart failure", match: ["(?<![\\p{L}])хсн", "сердечн\\p{L}* недостаточн", "heart failure", "(?<![\\p{L}])сн(?:с|н|п)фв"], icd10: ["I50"], pubmed: "\"heart failure\"[tiab]", guidelineTitle: ["сердечная", "недостаточность"], rankingTerms: ["heart failure"], topicId: "hf", safety: ["currentness_must_be_shown"] }),
  n({ id: "cardiology/atrial_fibrillation", specialty: "cardiology", label: "Фибрилляция предсердий", en: "atrial fibrillation", match: ["фибрилляц\\p{L}* предсерд", "мерцательн\\p{L}* аритм", "(?<![\\p{L}])фп(?![\\p{L}])", "atrial fibrillation"], icd10: ["I48"], pubmed: "\"atrial fibrillation\"[tiab]", guidelineTitle: ["фибрилляция", "предсердий"], rankingTerms: ["atrial fibrillation"], topicId: "af" }),
  n({ id: "cardiology/arterial_hypertension", specialty: "cardiology", label: "Артериальная гипертензия", en: "hypertension", match: ["артериальн\\p{L}* гиперт", "(?<![\\p{L}])аг(?![\\p{L}])", "гипертоническ\\p{L}* болезн"], icd10: ["I10", "I11", "I12", "I13", "I15"], pubmed: "hypertension[tiab]", guidelineTitle: ["артериальная", "гипертензия|гипертония"], rankingTerms: ["hypertension"], topicId: "ah" }),
  n({ id: "endocrinology/type2_diabetes", specialty: "endocrinology", label: "Сахарный диабет 2 типа", en: "type 2 diabetes", match: ["сахарн\\p{L}* диабет\\p{L}* 2", "(?<![\\p{L}])сд\\s?2", "диабет\\p{L}* 2 типа", "type 2 diabetes"], icd10: ["E11"], pubmed: "\"type 2 diabetes\"[tiab] OR \"diabetes mellitus, type 2\"[mh]", guidelineTitle: ["сахарный", "диабет", "2 типа"], rankingTerms: ["type 2 diabetes", "diabetes"] }),
  n({ id: "endocrinology/hypothyroidism", specialty: "endocrinology", label: "Гипотиреоз", en: "hypothyroidism", match: ["гипотире"], icd10: ["E03"], pubmed: "hypothyroidism[tiab]", guidelineTitle: ["гипотиреоз"], rankingTerms: ["hypothyroidism"] }),
  n({ id: "therapy/copd", specialty: "therapy", label: "Хроническая обструктивная болезнь лёгких", en: "COPD", match: ["(?<![\\p{L}])хобл", "хроническ\\p{L}* обструктивн", "(?<![\\p{L}])copd"], icd10: ["J44"], pubmed: "\"pulmonary disease, chronic obstructive\"[mh] OR COPD[tiab]", guidelineTitle: ["хроническая", "обструктивная", "болезнь", "легких"], rankingTerms: ["copd", "chronic obstructive"] }),
  n({ id: "therapy/community_acquired_pneumonia", specialty: "therapy", label: "Внебольничная пневмония", en: "community-acquired pneumonia", match: ["внебольничн\\p{L}* пневмон", "пневмони"], icd10: ["J18"], pubmed: "\"community-acquired pneumonia\"[tiab] OR pneumonia[ti]", guidelineTitle: ["внебольничная", "пневмония"], rankingTerms: ["pneumonia"] }),
  n({ id: "pediatrics/acute_otitis_media", specialty: "pediatrics", label: "Острый средний отит", en: "acute otitis media", match: ["средн\\p{L}* отит", "(?<![\\p{L}])отит"], icd10: ["H65", "H66"], pubmed: "\"otitis media\"[tiab]", guidelineTitle: ["отит"], rankingTerms: ["otitis media"], safety: ["pediatric_sections"] }),
  n({ id: "pediatrics/bronchiolitis", specialty: "pediatrics", label: "Бронхиолит", en: "bronchiolitis", match: ["бронхиолит"], icd10: ["J21"], pubmed: "bronchiolitis[tiab]", guidelineTitle: ["бронхиолит"], rankingTerms: ["bronchiolitis"], safety: ["pediatric_sections"] }),
  n({ id: "neurology/migraine", specialty: "neurology", label: "Мигрень", en: "migraine", match: ["мигрен"], icd10: ["G43"], pubmed: "migraine[tiab]", guidelineTitle: ["мигрень"], rankingTerms: ["migraine"] }),
  n({ id: "obgyn/preeclampsia", specialty: "obgyn", label: "Преэклампсия", en: "pre-eclampsia", match: ["преэклампс", "эклампс"], icd10: ["O14", "O15"], pubmed: "\"pre-eclampsia\"[tiab] OR preeclampsia[tiab]", guidelineTitle: ["преэклампсия"], rankingTerms: ["eclampsia", "preeclampsia"], safety: ["pregnancy_sections"] }),
  n({ id: "obgyn/gestational_diabetes", specialty: "obgyn", label: "Гестационный сахарный диабет", en: "gestational diabetes", match: ["гестационн\\p{L}* (?:сахарн\\p{L}* )?диабет", "(?<![\\p{L}])гсд(?![\\p{L}])"], icd10: ["O24.4"], pubmed: "\"gestational diabetes\"[tiab] OR \"diabetes, gestational\"[mh]", guidelineTitle: ["гестационный", "сахарный", "диабет"], rankingTerms: ["gestational diabetes"], safety: ["pregnancy_sections"] }),
];

export const SUBTYPES: readonly SubtypeNode[] = [
  { kind: "subtype", id: "cardiology/heart_failure/hfpef", nosology: "cardiology/heart_failure", label: "с сохранённой фракцией выброса", en: "HFpEF", match: ["сохраненн\\p{L}* (?:фв|фракци)", "(?<![\\p{L}])(?:хсн-?)?сфв", "(?<![\\p{L}])снсфв", "hfpef", "preserved ejection", "диастолическ\\p{L}* (?:сердечн|дисфункц)"], pubmed: "\"preserved ejection fraction\"[tiab] OR HFpEF[tiab]", sectionTerms: ["сохраненной фракцией выброса", "сохраненной фв", "хсн–сфв", "хсн-сфв", "диастолическ"], rankingTerms: ["preserved", "hfpef"] },
  { kind: "subtype", id: "cardiology/heart_failure/hfref", nosology: "cardiology/heart_failure", label: "со сниженной фракцией выброса", en: "HFrEF", match: ["сниженн\\p{L}* (?:фв|фракци)", "(?<![\\p{L}])(?:хсн-?)?нфв", "(?<![\\p{L}])снинфв", "hfref", "reduced ejection"], pubmed: "\"reduced ejection fraction\"[tiab] OR HFrEF[tiab]", sectionTerms: ["сниженной фракцией выброса", "сниженной фв", "хсн-нфв", "хсн–нфв"], rankingTerms: ["reduced", "hfref"] },
  { kind: "subtype", id: "cardiology/heart_failure/hfmref", nosology: "cardiology/heart_failure", label: "с умеренно сниженной фракцией выброса", en: "HFmrEF", match: ["умеренно сниженн", "промежуточн\\p{L}* (?:фв|фракци)", "(?<![\\p{L}])(?:хсн-?)?(?:пфв|усфв)", "hfmref"], pubmed: "\"mildly reduced ejection fraction\"[tiab] OR HFmrEF[tiab]", sectionTerms: ["промежуточной фракцией выброса", "умеренно сниженной", "хсн-пфв", "хсн–пфв"], rankingTerms: ["mildly reduced", "hfmref"] },
];

const s = (node: Omit<ScenarioNode, "kind" | "safety"> & { safety?: SafetyRuleId[] }): ScenarioNode => ({ kind: "scenario", safety: [], ...node });

/** Scenario overrides; anything not listed uses the job definition defaults. */
export const SCENARIOS: readonly ScenarioNode[] = [
  s({ id: "cardiology/heart_failure/*/guideline_check", job: "guideline_check", specialty: "cardiology", nosology: "cardiology/heart_failure", subtype: null, requirements: ["specialty_society_guideline", "official_guideline_status"], modules: ["key_takeaway", "recommendation_delta", "conflict", "drug_reference", "evidence", "sources", "handoff", "next_actions"], safety: ["currentness_must_be_shown"] }),
  s({ id: "*/*/*/guideline_check", job: "guideline_check", specialty: null, nosology: null, subtype: null, requirements: ["official_guideline_status"], modules: ["key_takeaway", "recommendation_delta", "conflict", "drug_reference", "evidence", "sources", "handoff", "next_actions"], safety: ["currentness_must_be_shown"] }),
  s({ id: "*/*/*/guideline_discovery", job: "guideline_discovery", specialty: null, nosology: null, subtype: null, requirements: ["official_guideline_status"], modules: ["key_takeaway", "recommendation_delta", "evidence", "sources", "handoff", "next_actions"], safety: ["currentness_must_be_shown"] }),
  s({ id: "*/*/*/drug_reference", job: "drug_reference", specialty: null, nosology: null, subtype: null, requirements: ["official_drug_registration"], modules: ["key_takeaway", "drug_reference", "conflict", "evidence", "sources", "handoff", "next_actions"], safety: ["jurisdiction_boundary"] }),
  s({ id: "*/*/*/drug_comparison", job: "drug_comparison", specialty: null, nosology: null, subtype: null, requirements: ["official_drug_registration"], modules: ["key_takeaway", "comparison", "drug_reference", "conflict", "evidence", "sources", "handoff", "next_actions"], safety: ["jurisdiction_boundary"] }),
  s({ id: "*/*/*/inn_lookup", job: "inn_lookup", specialty: null, nosology: null, subtype: null, requirements: ["official_drug_registration"], modules: ["key_takeaway", "drug_reference", "sources", "handoff", "next_actions"], safety: ["jurisdiction_boundary"] }),
  s({ id: "*/*/*/reference_answer", job: "reference_answer", specialty: null, nosology: null, subtype: null, requirements: [], modules: ["key_takeaway", "drug_reference", "conflict", "evidence", "recommendation_delta", "sources", "handoff", "next_actions"] }),
  s({ id: "*/*/*/disease_reference", job: "disease_reference", specialty: null, nosology: null, subtype: null, requirements: ["official_guideline_status"], modules: ["key_takeaway", "recommendation_delta", "evidence", "sources", "handoff", "next_actions"], safety: ["currentness_must_be_shown"] }),
  s({ id: "*/*/*/professional_article_search", job: "professional_article_search", specialty: null, nosology: null, subtype: null, requirements: [], modules: ["key_takeaway", "evidence", "sources", "handoff", "next_actions"] }),
];

const compiled = new Map<string, RegExp>();
function re(source: string): RegExp {
  let value = compiled.get(source);
  if (!value) { value = new RegExp(source, "u"); compiled.set(source, value); }
  return value;
}

function matchesAny(text: string, patterns: readonly string[]): string | null {
  for (const pattern of patterns) {
    const found = text.match(re(pattern));
    if (found) return found[0];
  }
  return null;
}

export interface DomainMatch {
  nosology: NosologyNode | null;
  subtype: SubtypeNode | null;
  /** The words that matched (physician-visible explanation). */
  evidence: string[];
}

/**
 * Recognise the nosology and subtype named in a request. All nosologies are
 * searched (a therapist may ask about heart failure); on a tie the
 * physician's own specialty wins. A subtype is accepted only under its
 * nosology — «сохранённая ФВ» alone is not heart failure.
 */
export function detectDomain(text: string, specialty: SpecialtyId): DomainMatch {
  const value = normalizeQuery(text);
  const hits = NOSOLOGIES.map(node => ({ node, word: matchesAny(value, node.match) })).filter(hit => hit.word);
  hits.sort((a, b) => Number(b.node.specialty === specialty) - Number(a.node.specialty === specialty) || value.indexOf(a.word!) - value.indexOf(b.word!));
  const nosology = hits[0]?.node ?? null;
  const evidence = hits[0]?.word ? [hits[0].word] : [];
  let subtype: SubtypeNode | null = null;
  for (const candidate of SUBTYPES) {
    const word = matchesAny(value, candidate.match);
    if (!word) continue;
    if (nosology && candidate.nosology === nosology.id) { subtype = candidate; evidence.push(word); break; }
    if (!nosology) {
      // A subtype written with its own abbreviation (HFpEF, СНсФВ) implies the nosology.
      if (/hf|снс|снн|хсн/u.test(word)) {
        subtype = candidate;
        evidence.push(word);
        return { nosology: NOSOLOGIES.find(node => node.id === candidate.nosology) ?? null, subtype, evidence };
      }
    }
  }
  return { nosology, subtype, evidence };
}

/** Most specific scenario for (job, specialty, nosology, subtype). */
export function scenarioFor(job: JobType, specialty: SpecialtyId, nosology: string | null, subtype: string | null): ScenarioNode | null {
  const candidates = SCENARIOS.filter(item => item.job === job
    && (item.specialty === null || item.specialty === specialty)
    && (item.nosology === null || item.nosology === nosology)
    && (item.subtype === null || item.subtype === subtype));
  const specificity = (item: ScenarioNode) => Number(item.specialty !== null) + Number(item.nosology !== null) * 2 + Number(item.subtype !== null) * 4;
  return candidates.sort((a, b) => specificity(b) - specificity(a))[0] ?? null;
}

export function nosologyById(id: string | null | undefined): NosologyNode | null {
  return NOSOLOGIES.find(node => node.id === id) ?? null;
}

export function subtypeById(id: string | null | undefined): SubtypeNode | null {
  return SUBTYPES.find(node => node.id === id) ?? null;
}

/** Do guideline-title words of a nosology appear in a title? (each entry may be an alternation). */
export function titleMatchesNosology(title: string, nosology: NosologyNode): boolean {
  const value = normalizeQuery(title);
  return nosology.guidelineTitle.every(word => re(`(?:${normalizeQuery(word)})`).test(value));
}
