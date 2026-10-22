import type { SpecialtyId } from "@/lib/domain/types";

export type ExpertTwinsCouncil = "cardiology" | "oncology";

export interface ExpertTwinsCase {
  case_id?: string;
  council: ExpertTwinsCouncil;
  question: string;
  domain_tags?: string[];
  state?: {
    diagnosis?: string;
    stage?: string;
    line_of_therapy?: string;
    risk_group?: string;
    prior_therapy?: string[];
    comorbidities?: string[];
    biomarkers?: string[];
    symptoms?: string[];
    tests?: Record<string, unknown>;
    other?: Record<string, unknown>;
  };
  max_evidence_per_expert?: number;
}

export interface ExpertTwinsEvidence {
  trace_id: string;
  source_id: string;
  score: number;
  evidence_tier: "L1" | "L2" | "L3" | "L4";
  authorship_role: string;
  publication_date?: string | null;
  action: string;
  verbatim_support: string;
  domains: string[];
}

export interface ExpertTwinsDecision {
  expert_id: string;
  expert_name: string;
  status: "ANSWERED" | "ABSTAIN";
  mode: "OBSERVED" | "PREDICTED" | "ABSTAIN";
  decision: string | null;
  rationale: string[];
  confidence: number;
  attribution_notice: string;
  abstention_reason?: string | null;
  evidence: ExpertTwinsEvidence[];
}

export interface ExpertTwinsSynthesis {
  consensus_summary: string;
  agreements: string[];
  disagreements: Array<{
    topic: string;
    positions: Record<string, string>;
    explanation: string;
  }>;
  unresolved_questions: string[];
  safety_notice: string;
}

export interface ExpertTwinsResult {
  case_id: string;
  council: ExpertTwinsCouncil;
  experts: ExpertTwinsDecision[];
  synthesis: ExpertTwinsSynthesis;
  policy_version: string;
  model_version: string;
}

export type ExpertTwinsPanelMember = {
  id: string;
  displayName: string;
  role: string;
  lens: string;
};

export const expertTwinsPanels: Record<ExpertTwinsCouncil, ExpertTwinsPanelMember[]> = {
  cardiology: [
    { id: "cardio_shlyakhto_ev", displayName: "Е. В. Шляхто", role: "Модель эксперта · кардиология", lens: "гипертензия · HFrEF · кардио-рено-метаболический профиль" },
    { id: "cardio_arutyunov_gp", displayName: "Г. П. Арутюнов", role: "Модель эксперта · кардиология", lens: "гипертензия · СН/деконгестия · миокардит/гемодинамика" },
    { id: "cardio_boytsov_sa", displayName: "С. А. Бойцов", role: "Модель эксперта · кардиология", lens: "гипертензия · СН · сердечно-сосудистая профилактика" },
  ],
  oncology: [
    { id: "onco_nosov_da", displayName: "Д. А. Носов", role: "Модель эксперта · онкология", lens: "метастатический ПКР · рак простаты/PSMA" },
    { id: "onco_alekseev_by", displayName: "Б. Я. Алексеев", role: "Модель эксперта · онкология", lens: "метастатический ПКР" },
    { id: "onco_bolotina_lv", displayName: "Л. В. Болотина", role: "Модель эксперта · онкология", lens: "опухоли головы и шеи · PD-L1 · последовательность терапии" },
  ],
};

/** Expert Twins councils exist only for the legacy cardiology and oncology archive. */
export function expertTwinsCouncilForSpecialty(specialty: SpecialtyId): ExpertTwinsCouncil | null {
  return specialty === "cardiology" || specialty === "oncology" ? specialty : null;
}

export function inferExpertTwinsDomainTags(council: ExpertTwinsCouncil, input: string): string[] {
  const text = input.toLocaleLowerCase("ru-RU");
  const rules: Array<[RegExp, string]> = council === "cardiology"
    ? [
        [/гипертенз|артериальн.{0,12}давлен|hypertens/, "hypertension"],
        [/сердечн.{0,12}недостат|hfr?ef|декомпенс/, "heart_failure"],
        [/миокардит/, "myocarditis"],
        [/хбп|ckd|почечн/, "chronic_kidney_disease"],
        [/профилактик|физическ.{0,12}актив|курен|питан/, "cardiovascular_prevention"],
        [/метабол|ожирен|преддиаб/, "cardiorenal_metabolic"],
      ]
    : [
        [/почечноклет|renal cell|\bпкр\b|\brcc\b/, "renal_cell_carcinoma"],
        [/метастат.{0,12}(пкр|rcc)|metastatic.{0,12}rcc/, "metastatic_rcc"],
        [/предстатель|prostate|psma/, "prostate_cancer"],
        [/голов.{0,8}ше|hnscc|head.{0,8}neck/, "head_and_neck_cancer"],
        [/pd[- ]?l1/, "pd_l1"],
      ];

  return [...new Set(rules.filter(([pattern]) => pattern.test(text)).map(([, tag]) => tag))];
}
