import { containsDirectiveLanguage, detectRiskSignals, RISK_COPY, type RiskSignals } from "@/lib/agents/risk-rules";
import { redactDirectIdentifiers } from "@/lib/clinical-case/anonymizer";

/**
 * DeidentificationService — wraps the existing local redaction rules. Text is
 * redacted before any tool sees it; the original is never persisted.
 */
export interface DeidentifiedText {
  text: string;
  redactions: string[];
  needsReview: boolean;
}

export function deidentify(text: string): DeidentifiedText {
  const result = redactDirectIdentifiers(text);
  return { text: result.redactedText, redactions: result.detectedMarkers, needsReview: result.status === "needs_review" };
}

/**
 * RiskCheckService — mandatory cross-cutting gate on inputs and outputs.
 */
export interface InputRiskDecision {
  allowed: boolean;
  blockedReason: string | null;
  notices: string[];
  sanitizedText: string;
  redactions: string[];
  signals: RiskSignals;
}

export function checkInputRisk(text: string): InputRiskDecision {
  const deidentified = deidentify(text);
  const signals = detectRiskSignals(deidentified.text);
  const notices: string[] = [];
  if (deidentified.redactions.length) notices.push(RISK_COPY.identifiers);
  if (signals.patientSpecific || deidentified.needsReview) notices.push(RISK_COPY.patientSpecific);
  if (signals.prescribing) notices.push(RISK_COPY.prescribing);
  if (signals.imageInterpretation) {
    return { allowed: false, blockedReason: RISK_COPY.imageInterpretation, notices: [...notices, RISK_COPY.imageInterpretation], sanitizedText: deidentified.text, redactions: deidentified.redactions, signals };
  }
  if (signals.emergency) {
    return { allowed: false, blockedReason: RISK_COPY.emergency, notices: [...notices, RISK_COPY.emergency], sanitizedText: deidentified.text, redactions: deidentified.redactions, signals };
  }
  return { allowed: true, blockedReason: null, notices: [...new Set(notices)], sanitizedText: deidentified.text, redactions: deidentified.redactions, signals };
}

export interface OutputRiskDecision {
  allowed: boolean;
  reason: string | null;
}

/** Generated or curated output must never read as a treatment order. */
export function checkOutputRisk(texts: readonly string[]): OutputRiskDecision {
  const offending = texts.find(text => containsDirectiveLanguage(text));
  return offending ? { allowed: false, reason: "Формулировка звучит как назначение — результат скрыт" } : { allowed: true, reason: null };
}

const BLOCKED_UPLOAD_EXTENSIONS = /\.(?:dcm|dicom|nii|nrrd|mha|mhd)$/iu;

export function checkUploadRisk(fileName: string, mimeType: string): { allowed: boolean; reason: string | null; imageNotice: string | null } {
  if (BLOCKED_UPLOAD_EXTENSIONS.test(fileName) || /dicom/iu.test(mimeType)) {
    return { allowed: false, reason: "Медицинские изображения (DICOM и подобные) не принимаются: интерпретация снимков не поддерживается", imageNotice: null };
  }
  if (mimeType.startsWith("image/")) {
    return { allowed: true, reason: null, imageNotice: "Изображение сохранено как файл без анализа содержимого" };
  }
  return { allowed: true, reason: null, imageNotice: null };
}
