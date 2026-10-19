import type { SpecialtyId } from "@/lib/domain/types";

export type CaseAnonymizationStatus = "clean" | "needs_review" | "runtime_required";

export type CaseAttachmentKind = "text" | "pdf" | "dicom" | "image" | "other";

export interface CaseAttachmentRecord {
  id: string;
  kind: CaseAttachmentKind;
  displayName: string;
  mimeType: string;
  size: number;
  anonymizationStatus: CaseAnonymizationStatus;
  redactedText?: string;
  detectedMarkers: string[];
}

export interface ClinicalCase {
  id: string;
  specialty: SpecialtyId;
  title: string;
  question: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  attachments: CaseAttachmentRecord[];
  anonymizationStatus: CaseAnonymizationStatus;
  source: "local_workspace";
}
