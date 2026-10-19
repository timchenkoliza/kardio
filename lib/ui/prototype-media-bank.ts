import type { ContentObject, SpecialtyId } from "@/lib/domain/types";

export type PrototypeMediaKind = "image" | "video";
export type PrototypeMediaModality = "echo" | "mri" | "angiography" | "ct" | "ecg" | "anatomy";
export type PrototypeMediaAvailability = "runtime" | "registered_only" | "excluded";
export type PrototypeMediaRightsStatus = "needs_review" | "approved";

export interface PrototypeMediaAsset {
  id: string;
  specialty: SpecialtyId;
  filename: string;
  kind: PrototypeMediaKind;
  modality: PrototypeMediaModality;
  availability: PrototypeMediaAvailability;
  src: string | null;
  alt: string;
  sourceName: string;
  rightsStatus: PrototypeMediaRightsStatus;
  renderPolicy: "prototype_only_until_rights_verified" | "exclude_from_real_photo_pool";
  contentIds: readonly string[];
}

/**
 * UI-only prototype registry.
 *
 * These records never promote media into the canonical ontology and never weaken
 * Golden Set media eligibility. `runtime` only means bytes are technically
 * available. Rendering additionally requires explicit `rightsStatus = approved`.
 */
export const PROTOTYPE_MEDIA_BANK: readonly PrototypeMediaAsset[] = [
  {
    id: "cardiology-echo-still",
    specialty: "cardiology",
    filename: "cardiology-collection(1).jpg",
    kind: "image",
    modality: "echo",
    availability: "runtime",
    src: "/api/prototype-media/echo",
    alt: "Реальный кадр ультразвукового исследования сердца из прототипного медиабанка",
    sourceName: "User-provided real clinical ultrasound examination photo",
    rightsStatus: "needs_review",
    renderPolicy: "prototype_only_until_rights_verified",
    contentIds: ["fact-ar-echo-2025"],
  },
  {
    id: "cardiology-mr-cine",
    specialty: "cardiology",
    filename: "701_file_701_0.mp4",
    kind: "video",
    modality: "mri",
    availability: "registered_only",
    src: null,
    alt: "Кардиальный MR cine clip из исходного медиабанка",
    sourceName: "User-provided real cardiac MR/cine imaging clip",
    rightsStatus: "needs_review",
    renderPolicy: "prototype_only_until_rights_verified",
    contentIds: [],
  },
  {
    id: "cardiology-angiography-cine",
    specialty: "cardiology",
    filename: "713_file_713_0.mp4",
    kind: "video",
    modality: "angiography",
    availability: "registered_only",
    src: null,
    alt: "Коронарографический cine clip из исходного медиабанка",
    sourceName: "User-provided real coronary angiography clip",
    rightsStatus: "needs_review",
    renderPolicy: "prototype_only_until_rights_verified",
    contentIds: [],
  },
  {
    id: "cardiology-mechanical-support-animation",
    specialty: "cardiology",
    filename: "785_2024-06-21 20.41.49.mp4",
    kind: "video",
    modality: "anatomy",
    availability: "excluded",
    src: null,
    alt: "Synthetic mechanical circulatory-support animation",
    sourceName: "Uploaded synthetic illustration",
    rightsStatus: "needs_review",
    renderPolicy: "exclude_from_real_photo_pool",
    contentIds: [],
  },
] as const;

export function prototypeMediaForContent(content: Pick<ContentObject, "id" | "specialty">): PrototypeMediaAsset | null {
  return PROTOTYPE_MEDIA_BANK.find(asset =>
    asset.specialty === content.specialty
    && asset.availability === "runtime"
    && asset.rightsStatus === "approved"
    && asset.renderPolicy === "prototype_only_until_rights_verified"
    && asset.contentIds.includes(content.id),
  ) ?? null;
}

export function prototypeImagingMedia(specialty: SpecialtyId): readonly PrototypeMediaAsset[] {
  return PROTOTYPE_MEDIA_BANK.filter(asset => asset.specialty === specialty && asset.availability !== "excluded");
}

export function prototypeMediaAwaitingRightsReview(specialty: SpecialtyId): readonly PrototypeMediaAsset[] {
  return prototypeImagingMedia(specialty).filter(asset => asset.rightsStatus === "needs_review");
}

export function extractBundledImageDataUri(source: string): string {
  const match = /^window\.KARDIO_ECHO_IMAGE='(data:image\/jpeg;base64,[A-Za-z0-9+/=]+)';\s*$/u.exec(source.trim());
  if (!match) throw new Error("Invalid prototype echo asset bundle");
  return match[1];
}
