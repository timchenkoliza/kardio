/**
 * Clinical Visual Recraft — deterministic gates.
 *
 * Models propose; these functions decide. Every rule here is checkable without
 * a model so a provider can never talk the pipeline into a looser result.
 */
import {
  DESIGN_LOCK,
  FIDELITY_RULES,
  MATCH_PRODUCTION_RULE,
  sourceClassOf,
  type ArticleContext,
  type BindingType,
  type ContentMapping,
  type CriticReport,
  type MatchGrade,
  type ProductionRule,
  type RecraftStatus,
  type RecraftUsage,
  type RedrawStrategy,
  type SourceClass,
  type SourceVisualPassport,
} from "./contract";

export const NO_CODE = "NO CODE";
const ICD10 = /^[A-TV-Z]\d{2}(?:\.\d{1,2})?$/u;

/** Bindings that may never carry a nosology code. */
const CODELESS_BINDINGS: readonly BindingType[] = ["context", "mechanism", "no_code", "prompt_conflict"];

/** Lower-level bindings that a mapping must not silently upgrade to a disease. */
const UPGRADE_FROM: Record<string, RegExp> = {
  risk: /(?<![\p{L}])(?:риск\p{L}*|фактор\p{L}* риска|профилакт\p{L}*|скрининг\p{L}*|предраспол\p{L}*|risk|prevention|screening)(?![\p{L}])/iu,
  symptom: /(?<![\p{L}])(?:симптом\p{L}*|жалоб\p{L}*|одышк\p{L}*|бол\p{L}* в груди|сердцебиени\p{L}*|отёк\p{L}*|отек\p{L}*|symptom\p{L}*)(?![\p{L}])/iu,
  context: /(?<![\p{L}])(?:образ жизни|питани\p{L}*|диет\p{L}*|физическ\p{L}* активност\p{L}*|сон|стресс\p{L}*|lifestyle|diet)(?![\p{L}])/iu,
  device_status: /(?<![\p{L}])(?:имплант\p{L}*|стент\p{L}*|кардиостимулятор\p{L}*|протез\p{L}*|device)(?![\p{L}])/iu,
};

/** Explicit diagnosis cues that justify a disease binding. */
const DIAGNOSIS_CUE = /(?<![\p{L}])(?:диагноз\p{L}*|заболевани\p{L}*|болезн\p{L}*|синдром\p{L}*|инфаркт\p{L}*|недостаточност\p{L}*|фибрилляц\p{L}*|стеноз\p{L}*|кардиомиопати\p{L}*|гипертензи\p{L}*|гипертони\p{L}*|ишеми\p{L}*|тромбоз\p{L}*|эмболи\p{L}*|аневризм\p{L}*|миокардит\p{L}*|перикардит\p{L}*|диагностирован\p{L}*|disease|infarction|failure|fibrillation|stenosis|cardiomyopathy|hypertension)(?![\p{L}])/iu;

function sourceText(article: ArticleContext): string {
  return [article.caption, article.title, article.clinicalSubject, article.clinicalJob, article.excerpt, article.contentPassport]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" \n ");
}

export interface MappingCheck {
  mapping: ContentMapping;
  violations: string[];
  /** True when the mapping can no longer support generation. */
  blocking: boolean;
}

/**
 * Normalises a model-proposed mapping against the CARDIOLOGY CONTENT MAPPING rules:
 * intersection of sources, no upgrades, ICD-10 only when supported, specificity,
 * and the conflict rule (prompt_conflict → low confidence, NO CODE, no generation).
 */
export function checkMapping(proposed: ContentMapping, article: ArticleContext): MappingCheck {
  const violations: string[] = [];
  const mapping: ContentMapping = { ...proposed, approvedStatements: proposed.approvedStatements.map(item => item.trim()).filter(Boolean) };
  const text = sourceText(article);

  if (mapping.bindingType === "prompt_conflict") {
    mapping.confidence = "low";
    mapping.icd10 = NO_CODE;
    violations.push("Изображение, подпись и статья описывают разное — нужна сверка источника");
    return { mapping, violations, blocking: true };
  }

  if (mapping.icd10 !== NO_CODE && !ICD10.test(mapping.icd10)) {
    violations.push(`Некорректный код МКБ-10 «${mapping.icd10}» заменён на NO CODE`);
    mapping.icd10 = NO_CODE;
  }
  if (CODELESS_BINDINGS.includes(mapping.bindingType) && mapping.icd10 !== NO_CODE) {
    violations.push("Для контекста или механизма код МКБ-10 не ставится");
    mapping.icd10 = NO_CODE;
  }
  if (mapping.confidence === "low" && mapping.icd10 !== NO_CODE) {
    violations.push("При низкой уверенности код МКБ-10 не ставится");
    mapping.icd10 = NO_CODE;
  }

  if (mapping.bindingType === "disease" && !DIAGNOSIS_CUE.test(text)) {
    const lower = Object.entries(UPGRADE_FROM).find(([, pattern]) => pattern.test(text))?.[0] as BindingType | undefined;
    violations.push(`Повышение уровня запрещено: в источниках нет диагноза, только ${lower ?? "контекст"}`);
    mapping.bindingType = lower ?? "context";
    mapping.icd10 = NO_CODE;
    mapping.confidence = "low";
  }

  // Specificity: a subcategory code needs the subcategory to be named in the sources.
  if (/\.\d/u.test(mapping.icd10) && !text.toLocaleLowerCase("ru-RU").includes(mapping.nosologyOrObject.toLocaleLowerCase("ru-RU"))) {
    violations.push("Уточнённый код без уточнения в источниках — оставлена рубрика");
    mapping.icd10 = mapping.icd10.replace(/\.\d+$/u, "");
  }

  if (!mapping.approvedStatements.length) violations.push("Нет утверждённых смысловых утверждений — генерировать нечего");
  if (!mapping.sourceBasis.trim()) violations.push("Не указано, на чём основано сопоставление");

  const blocking = !mapping.approvedStatements.length || !mapping.sourceBasis.trim();
  return { mapping, violations, blocking };
}

export interface MatchDecision {
  rule: ProductionRule;
  generate: boolean;
  status: RecraftStatus | null;
  label: string | null;
  reason: string;
}

/** Match gate: EXACT/STRONG → use, MEDIUM → with caveat, PARTIAL → secondary only, WEAK PROXY → replace, NO VALID MATCH → do not use. */
export function decideMatch(grade: MatchGrade, usage: RecraftUsage, reason: string): MatchDecision {
  const rule = MATCH_PRODUCTION_RULE[grade];
  switch (rule) {
    case "use":
      return { rule, generate: true, status: null, label: null, reason };
    case "use_with_caveat":
      return { rule, generate: true, status: null, label: "Иллюстрация к теме, не к конкретному случаю", reason };
    case "secondary_only":
      return usage === "digest"
        ? { rule, generate: true, status: null, label: "Вспомогательная иллюстрация", reason }
        : { rule, generate: false, status: "replace_image", label: null, reason: `Подходит только как вспомогательная иллюстрация: ${reason}` };
    case "replace":
      return { rule, generate: false, status: "replace_image", label: null, reason: `Слабое соответствие статье, нужно другое изображение: ${reason}` };
    case "do_not_use":
      return { rule, generate: false, status: "do_not_use", label: null, reason: `Изображение не соответствует статье: ${reason}` };
  }
}

/** Diagnostic sources are redrawn with much less freedom than editorial ones. */
export function transformationStrength(sourceClass: SourceClass): { min: number; max: number } {
  return sourceClass === "diagnostic" ? { min: 0.2, max: 0.35 } : { min: 0.45, max: 0.6 };
}

export function strategyFor(passport: SourceVisualPassport): RedrawStrategy {
  switch (passport.sourceType) {
    case "angiography":
    case "ct_coronary":
      return "vascular_flow";
    case "echocardiography":
    case "mri":
    case "ct":
      return "cross_section";
    case "pathology_specimen":
      return "macro_pathology";
    case "anatomical_illustration":
      return "anatomical_contour";
    default:
      return "system_view";
  }
}

function fidelityFor(passport: SourceVisualPassport): string[] {
  return [...(FIDELITY_RULES[passport.sourceType] ?? FIDELITY_RULES.heart ?? [])];
}

/** Passport problems that stop the pipeline before any generation. */
export function passportStops(passport: SourceVisualPassport): { status: RecraftStatus; reason: string } | null {
  if (passport.containsPatientIdentifiers) return { status: "needs_deidentification", reason: "На исходном изображении видны данные пациента — сначала обезличьте его" };
  if (!passport.primaryAnchor.trim() || !passport.mustPreserveStructures.length) return { status: "needs_source_verification", reason: "Не удалось зафиксировать главный объект изображения" };
  return null;
}

/** Design-system translation: the semantic lock plus the visual system, never a free description. */
export function buildRedrawPrompt(passport: SourceVisualPassport, mapping: ContentMapping, strategy: RedrawStrategy, sourceClass: SourceClass): string {
  const strength = transformationStrength(sourceClass);
  const lines = [
    "Redraw the attached source image in the Yandex Med visual system. The source image is the medical truth; the design system is only the way it is drawn.",
    `Source type: ${passport.sourceType}${passport.viewProjection ? `, view ${passport.viewProjection}` : ""}. Redraw strategy: ${strategy}. Transformation strength ${strength.min}–${strength.max}.`,
    `Primary anchor: ${passport.primaryAnchor}.`,
    `Preserve exactly: ${[...passport.mustPreserveStructures, ...passport.mustPreserveRelationships].join("; ")}.`,
    passport.pathologyFinding ? `Keep the finding in the same location: ${passport.pathologyFinding}.` : null,
    passport.laterality !== "not_applicable" && passport.laterality !== "none" ? `Laterality: ${passport.laterality}. Do not mirror.` : "Do not mirror the image.",
    passport.flowDirection ? `Flow direction: ${passport.flowDirection}.` : null,
    passport.diagnosticMarkers.length ? `Do not alter, clean up or improve: ${passport.diagnosticMarkers.join("; ")}.` : null,
    `Hard constraints for this source type: ${fidelityFor(passport).join("; ")}.`,
    `Every visual element must correspond to one of these statements: ${mapping.approvedStatements.join(" | ")}.`,
    `Never add: ${["new structures", "new findings", "text, labels or numbers", "people or faces", ...passport.mustNotInvent].join("; ")}.`,
    `Format ${DESIGN_LOCK.format}. Background ${DESIGN_LOCK.background.join(" / ")}. Primary ${DESIGN_LOCK.primary.join(", ")}; secondary ${DESIGN_LOCK.secondary.join(", ")}; accent only if needed ${DESIGN_LOCK.optionalAccent.join(", ")}.`,
    `Brand colour at most ${Math.round(DESIGN_LOCK.brandAttentionMax * 100)}% of attention. Negative space ${DESIGN_LOCK.negativeSpace.map(value => `${Math.round(value * 100)}%`).join("–")}. Anchor ${DESIGN_LOCK.anchorShare.map(value => `${Math.round(value * 100)}%`).join("–")} of the frame, inside the central ${DESIGN_LOCK.cropSafe.map(value => `${Math.round(value * 100)}%`).join("–")} crop-safe zone.`,
    "No gradients, no glow, no stock or advertising look, no 3D render gloss.",
    `Readable in 500 ms as: ${passport.read500ms}.`,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

const NEUTRAL_ELEMENTS = /(?<![\p{L}])(?:фон\p{L}*|background|negative space|пустое пространство|контур\p{L}*|outline|palette|палитр\p{L}*|shadow|тень)(?![\p{L}])/iu;

function tokens(value: string): Set<string> {
  return new Set(value.toLocaleLowerCase("ru-RU").split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 3).map(word => word.slice(0, 6)));
}

/** Image semantic boundary: every depicted element must map to an approved statement. */
export function outsideSemanticBoundary(depicted: readonly string[], approved: readonly string[]): string[] {
  const approvedTokens = new Set(approved.flatMap(statement => [...tokens(statement)]));
  return depicted.filter(element => {
    if (NEUTRAL_ELEMENTS.test(element)) return false;
    const elementTokens = [...tokens(element)];
    if (!elementTokens.length) return false;
    // Most of the element's words must come from approved statements: «стент в артерии» is not «стеноз артерии».
    const covered = elementTokens.filter(token => approvedTokens.has(token)).length;
    return covered / elementTokens.length < 0.6;
  });
}

const SELF_REJECT_LABEL: Record<keyof CriticReport["selfReject"], string> = {
  anatomyDiffers: "анатомия отличается от источника",
  pathologyMoved: "находка смещена",
  lateralityOrProjectionChanged: "изменены сторона или проекция",
  structureInvented: "добавлена структура, которой нет в источнике",
  genericCardiologyPicture: "получилась типовая картинка про кардиологию",
  decorationDominates: "декор доминирует над смыслом",
  differentClinicalConcept: "изображена другая клиническая идея",
  stockAdvertisingLook: "стоковая или рекламная эстетика",
  outsideVisualSystem: "вне визуальной системы",
};

/** Source-vs-output critic verdict. A candidate passes only when every check passes. */
export function criticVerdict(report: CriticReport, mapping: ContentMapping): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const fidelity = report.sourceFidelity;
  if (!fidelity.sameStructure) failures.push("другая структура");
  if (!fidelity.sameViewOrSide) failures.push("другая проекция или сторона");
  if (!fidelity.sameFindingLocation) failures.push("находка не на месте");
  if (!fidelity.noNewClinicalInformation) failures.push("появилась новая клиническая информация");
  if (!report.semanticFidelity) failures.push("смысл не совпадает со статьёй");
  if (!report.styleFidelity) failures.push("стиль вне дизайн-системы");
  for (const item of report.hallucinations) failures.push(`галлюцинация: ${item}`);
  for (const [key, hit] of Object.entries(report.selfReject) as Array<[keyof CriticReport["selfReject"], boolean]>) {
    if (hit) failures.push(SELF_REJECT_LABEL[key]);
  }
  for (const element of outsideSemanticBoundary(report.depictedElements, mapping.approvedStatements)) failures.push(`вне смысловой границы: ${element}`);
  return { pass: failures.length === 0, failures };
}

export { sourceClassOf };
