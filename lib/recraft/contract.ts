/**
 * Clinical Visual Recraft — contract.
 *
 * SOURCE IMAGE = medical truth. DESIGN SYSTEM = the way it is drawn.
 * Never: SOURCE IMAGE = inspiration for a new picture.
 *
 * The agent runs at the image ↔ article matching stage of the media pipeline:
 * content mapping → match gate → source visual passport (semantic lock) →
 * redraw strategy → design-system translation → image-to-image generation →
 * source-vs-output critic → final derivative. Spec: context/41_CLINICAL_VISUAL_RECRAFT.md.
 */

export type RecraftUsage = "article_card" | "hero" | "digest";

export interface RecraftSourceImage {
  /** Stable media id from the media library (provider item id or manifest id). */
  id: string;
  mimeType: string;
  /** Raw bytes, base64. The pipeline never sends a URL to a model. */
  base64: string;
  role: "clinical_source_of_truth";
  /** Channel / author credit for the original. */
  credit: string | null;
}

export interface ArticleContext {
  contentId: string;
  title: string;
  /** Caption of the original image. When present it outranks the title. */
  caption: string | null;
  clinicalSubject: string | null;
  clinicalJob: string | null;
  excerpt: string | null;
  /** Content Passport from context/31_CARDIO_VISUAL_PROMPT_SYSTEM.md, when one exists. */
  contentPassport: string | null;
}

export interface RecraftInput {
  source: RecraftSourceImage;
  article: ArticleContext;
  target: { format: "2:1"; usage: RecraftUsage; specialty: "cardiology" };
}

/* ---------- Stage 0: cardiology content mapping ---------- */

export type BindingType =
  | "disease"
  | "symptom"
  | "risk"
  | "context"
  | "anatomy"
  | "diagnostic_finding"
  | "intervention"
  | "device_status"
  | "mechanism"
  | "no_code"
  | "prompt_conflict";

export type MappingConfidence = "high" | "medium" | "low";

export interface ContentMapping {
  clinicalTopic: string;
  nosologyOrObject: string;
  /** ICD-10 code only when sufficiently supported, otherwise "NO CODE". */
  icd10: string;
  bindingType: BindingType;
  confidence: MappingConfidence;
  catalogBlock: string | null;
  ambiguity: string | null;
  sourceBasis: string;
  /** Approved semantic statements: every visual element must correspond to one of them. */
  approvedStatements: string[];
}

export type MatchGrade = "EXACT" | "STRONG" | "MEDIUM" | "PARTIAL" | "WEAK_PROXY" | "NO_VALID_MATCH";
export type ProductionRule = "use" | "use_with_caveat" | "secondary_only" | "replace" | "do_not_use";

export const MATCH_PRODUCTION_RULE: Record<MatchGrade, ProductionRule> = {
  EXACT: "use",
  STRONG: "use",
  MEDIUM: "use_with_caveat",
  PARTIAL: "secondary_only",
  WEAK_PROXY: "replace",
  NO_VALID_MATCH: "do_not_use",
};

export interface MappingStageOutput {
  mapping: ContentMapping;
  match: { grade: MatchGrade; reason: string };
}

/* ---------- Stage 1–2: source visual passport = semantic lock ---------- */

export type SourceType =
  | "angiography"
  | "ct_coronary"
  | "ct"
  | "mri"
  | "echocardiography"
  | "ecg"
  | "anatomical_illustration"
  | "pathology_specimen"
  | "diagram"
  | "photo"
  | "other";

/** Diagnostic sources get a much lower transformation strength than editorial ones. */
export const DIAGNOSTIC_SOURCE_TYPES: readonly SourceType[] = ["angiography", "ct_coronary", "ct", "mri", "echocardiography", "ecg"];

export type SourceClass = "editorial" | "diagnostic";

export function sourceClassOf(type: SourceType): SourceClass {
  return DIAGNOSTIC_SOURCE_TYPES.includes(type) ? "diagnostic" : "editorial";
}

export interface SourceVisualPassport {
  sourceType: SourceType;
  primaryAnchor: string;
  viewProjection: string | null;
  mustPreserveStructures: string[];
  mustPreserveRelationships: string[];
  pathologyFinding: string | null;
  laterality: "left" | "right" | "none" | "not_applicable";
  flowDirection: string | null;
  articleRelationship: string | null;
  read500ms: string;
  mustNotInvent: string[];
  /** Burned-in names, dates of birth, record numbers or other identifiers visible in the source. */
  containsPatientIdentifiers: boolean;
  /** Measurements, waveforms or markers that must never be "improved". */
  diagnosticMarkers: string[];
}

/* ---------- Stage 3–4: strategy and design-system lock ---------- */

export type RedrawStrategy = "anatomical_contour" | "cross_section" | "vascular_flow" | "macro_pathology" | "system_view";

export const DESIGN_LOCK = {
  format: "2:1",
  background: ["#FFFFFF", "#F2F2F2"],
  primary: ["#898BFF", "#7275FF", "#5759EF"],
  secondary: ["#DABDFF", "#AFA2FF"],
  optionalAccent: ["#FDABC1", "#F367D0"],
  brandAttentionMax: 0.2,
  negativeSpace: [0.65, 0.8],
  anchorShare: [0.2, 0.35],
  cropSafe: [0.6, 0.7],
} as const;

/** Hard constraints per cardiology source type (what may never change). */
export const FIDELITY_RULES: Record<string, string[]> = {
  angiography: ["vessel tree topology", "branching", "stenosis / occlusion location", "relative segment length"],
  ct_coronary: ["coronary anatomy", "side", "stenosis / calcification location", "spatial relationships"],
  echocardiography: ["view / projection", "chambers", "valve", "pathologically relevant motion or geometry"],
  mri: ["imaging plane", "chambers", "myocardial geometry", "clinically relevant motion relationship"],
  anatomical_illustration: ["topology", "laterality", "connection points between structures"],
  valve: ["number of leaflets", "orientation", "lesion zone"],
  vessel: ["lumen / wall relationship", "lesion position", "narrowing / dilatation"],
  heart: ["chambers", "vessels", "anatomical connectivity"],
};

/* ---------- Stage 5–6: candidates and critic ---------- */

export interface CriticReport {
  sourceFidelity: { sameStructure: boolean; sameViewOrSide: boolean; sameFindingLocation: boolean; noNewClinicalInformation: boolean };
  semanticFidelity: boolean;
  styleFidelity: boolean;
  hallucinations: string[];
  /** Visual elements the critic sees in the output (used for the semantic-boundary check). */
  depictedElements: string[];
  /** The nine self-reject conditions of the system prompt; true means the condition was hit. */
  selfReject: {
    anatomyDiffers: boolean;
    pathologyMoved: boolean;
    lateralityOrProjectionChanged: boolean;
    structureInvented: boolean;
    genericCardiologyPicture: boolean;
    decorationDominates: boolean;
    differentClinicalConcept: boolean;
    stockAdvertisingLook: boolean;
    outsideVisualSystem: boolean;
  };
  notes: string;
}

export interface RecraftCandidate {
  index: number;
  round: number;
  mimeType: string;
  base64: string;
  critic: CriticReport | null;
  verdict: { pass: boolean; failures: string[] };
}

export type RecraftStatus =
  | "completed"
  | "needs_source_verification"
  | "replace_image"
  | "do_not_use"
  | "needs_deidentification"
  | "rejected_by_critic"
  | "unavailable"
  | "failed";

export interface RecraftResult {
  status: RecraftStatus;
  reason: string;
  input: { sourceId: string; contentId: string; usage: RecraftUsage };
  mapping: ContentMapping | null;
  match: MappingStageOutput["match"] | null;
  productionRule: ProductionRule | null;
  passport: SourceVisualPassport | null;
  sourceClass: SourceClass | null;
  strategy: RedrawStrategy | null;
  promptDigest: string | null;
  candidates: RecraftCandidate[];
  final: { mimeType: string; base64: string; candidateIndex: number } | null;
  /** Shown next to every derivative. */
  label: string | null;
  models: { vision: string | null; image: string | null };
  createdAt: string;
}
