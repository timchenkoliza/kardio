import type { SpecialtyId } from "@/lib/domain/types";

/**
 * Medical media publish pipeline (context/41_CLINICAL_VISUAL_RECRAFT.md):
 *
 * source document → candidate source image → article ↔ image match →
 * media eligibility → style transformation into the design system →
 * quality validation → approved derivative → persistent asset → feed / item.
 *
 * A source image and its derivative are different entities. Physician-facing
 * surfaces only ever read approved derivatives (or in-house art); a source
 * image is ingestion material and is never shown as card media.
 */

/** Pixel rectangle in the stored source copy: x, y, width, height. */
export type Rect = readonly [number, number, number, number];

export type MediaMatchGrade = "EXACT" | "STRONG" | "MEDIUM" | "PARTIAL" | "WEAK_PROXY" | "NO_VALID_MATCH";

export type MediaSourceType = "anatomical_illustration" | "diagram" | "photo" | "ecg" | "mri" | "ct";

/** Diagnostic sources carry intensity semantics; editorial ones are drawings. */
export type MediaSourceClass = "editorial" | "diagnostic";

export interface MediaSourcePassport {
  /** Region of the source that carries the clinical subject; null = the whole image. */
  crop: Rect | null;
  /** Labels, captions, watermarks and logos removed entirely (never redrawn). */
  remove: Rect[];
  /** Medically meaningful text kept exactly as drawn and verified after transformation. */
  keepText: Rect[];
  /** Warm and cool colours carry meaning (arteries vs veins): keep them apart. */
  hueSplit: boolean;
  /** Manufacturer or publisher marks inside the subject: such a source is not transformed. */
  brandMarks: boolean;
  /** Burned-in names, dates of birth, record numbers. */
  patientIdentifiers: boolean;
  /** RGB distance that still counts as the source background (default 48). */
  backgroundTolerance?: number;
  /** `trace` for waveforms (ECG): the trace itself is drawn, no fills. Default `tones`. */
  render?: "tones" | "trace";
  /** Cut near-black strokes thinner than 5 px (leader lines, dashed guides) whose labels were removed. */
  removeThinLines?: boolean;
  /** What the transformation must keep (reviewed on the audit page). */
  mustPreserve: string[];
}

export interface MediaSource {
  id: string;
  specialty: SpecialtyId;
  /** Clinical object of the picture (lib/media/subjects.ts). */
  subject: string;
  /** Stored source copy (public path), ingestion material only. */
  file: string;
  sourceType: MediaSourceType;
  sourceClass: MediaSourceClass;
  origin: { url: string; title: string; sha256: string; width: number; height: number; retrievedAt: string; normalization: string };
  credit: string;
  license: string;
  /** What the picture shows, in Russian (becomes the derivative's alt text). */
  alt: string;
  /** The document the image was matched against. */
  document: { id: string; title: string };
  match: { grade: MediaMatchGrade; reason: string };
  passport: MediaSourcePassport;
}

export interface MediaSourceRegistry {
  version: number;
  policy: string;
  sources: MediaSource[];
}

export interface ValidationCheck {
  id: string;
  pass: boolean;
  value: number | string | boolean;
  threshold: string;
}

export type FallbackRef = { kind: "derivative"; ref: string } | { kind: "art"; ref: string } | { kind: "none"; ref: null };

export interface MediaDerivative {
  /** Deterministic: specialty, subject and a hash of source bytes, passport, pipeline and palette. */
  id: string;
  status: "approved" | "rejected";
  specialty: SpecialtyId;
  subject: string;
  /** The stored source copy: its size makes the crop and removed regions reviewable on the audit page. */
  source: { id: string; file: string; url: string; sha256: string; width: number; height: number; credit: string; license: string; crop: Rect | null; remove: Rect[]; keepText: Rect[] };
  document: { id: string; title: string };
  match: { grade: MediaMatchGrade; reason: string };
  transformation: { pipeline: string; version: string; engine: "deterministic"; params: Record<string, number | string | boolean> };
  designSystem: { version: string; palette: string[] };
  /** Approved derivative only. */
  src: string | null;
  /** A transformation that failed validation, kept for the audit page; never rendered on a product surface. */
  attemptSrc: string | null;
  sha256: string | null;
  width: number;
  height: number;
  alt: string;
  /** Attribution shown under the picture. */
  label: string;
  validation: { status: "passed" | "failed"; checks: ValidationCheck[]; failureReason: string | null };
  /** What a card about the same subject shows instead when this derivative is rejected. */
  fallback: FallbackRef;
  createdAt: string;
}

export interface MediaManifest {
  version: number;
  pipeline: { name: string; version: string };
  designSystem: { version: string; palette: string[] };
  derivatives: MediaDerivative[];
}
