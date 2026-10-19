import type { ContentObject, SpecialtyId } from "@/lib/domain/types";

export type ApprovedMedicalModality = "anatomy" | "echo" | "mri" | "angiography" | "ct";

export interface ApprovedMedicalMediaAsset {
  id: string;
  specialty: SpecialtyId;
  modality: ApprovedMedicalModality;
  kind: "image";
  src: string;
  alt: string;
  credit: string;
  license: string;
  sourceUrl: string;
  compactLabel: string;
}

function cloudOrFallback(path: string, fallback: string): string {
  const base = process.env.NEXT_PUBLIC_MEDIA_CLOUD_BASE_URL?.trim().replace(/\/$/u, "");
  return base ? `${base}/${path.replace(/^\//u, "")}` : fallback;
}

const commons = (filename: string) => `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}`;

export const APPROVED_CARDIOLOGY_MEDIA: readonly ApprovedMedicalMediaAsset[] = [
  {
    id: "cardiology-anatomy-heart",
    specialty: "cardiology",
    modality: "anatomy",
    kind: "image",
    src: cloudOrFallback("cardiology/anatomy/heart.svg", commons("Human Heart (NIH BioArt 228 - 630873).svg")),
    alt: "Учебное анатомическое изображение человеческого сердца",
    credit: "NIAID / NIH BioArt · public domain",
    license: "Public domain",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Human_Heart_(NIH_BioArt_228_-_630873).svg",
    compactLabel: "Анатомия",
  },
  {
    id: "cardiology-echo-four-chamber",
    specialty: "cardiology",
    modality: "echo",
    kind: "image",
    src: cloudOrFallback("cardiology/imaging/echo-four-chamber.jpg", commons("Heart tee four chamber view.jpg")),
    alt: "Четырёхкамерное эхокардиографическое изображение сердца",
    credit: "Patrick J. Lynch / C. Carl Jaffe · CC BY 2.5",
    license: "CC BY 2.5",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Heart_tee_four_chamber_view.jpg",
    compactLabel: "ЭхоКГ",
  },
  {
    id: "cardiology-mri-cine",
    specialty: "cardiology",
    modality: "mri",
    kind: "image",
    src: cloudOrFallback("cardiology/imaging/cardiac-mri-cine.gif", commons("4CH cine infarct.gif")),
    alt: "Учебная динамическая серия МРТ сердца в четырёхкамерной проекции",
    credit: "Doregan · CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:4CH_cine_infarct.gif",
    compactLabel: "МРТ · cine",
  },
  {
    id: "cardiology-coronary-angiography",
    specialty: "cardiology",
    modality: "angiography",
    kind: "image",
    src: cloudOrFallback("cardiology/imaging/coronary-angiography.png", commons("Coronary Angiography.png")),
    alt: "Учебное изображение коронарной ангиографии",
    credit: "BruceBlaus · CC BY-SA 4.0",
    license: "CC BY-SA 4.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Coronary_Angiography.png",
    compactLabel: "Коронарография",
  },
  {
    id: "cardiology-coronary-ct",
    specialty: "cardiology",
    modality: "ct",
    kind: "image",
    src: cloudOrFallback("cardiology/imaging/coronary-ct.jpg", commons("Coronary CT Angiography Scan.jpg")),
    alt: "Учебное изображение КТ-ангиографии коронарных артерий",
    credit: "Goleisureintl · CC BY 4.0",
    license: "CC BY 4.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Coronary_CT_Angiography_Scan.jpg",
    compactLabel: "КТ-коронарография",
  },
] as const;

export function approvedImagingMedia(specialty: SpecialtyId): readonly ApprovedMedicalMediaAsset[] {
  return specialty === "cardiology" ? APPROVED_CARDIOLOGY_MEDIA : [];
}

export function approvedAnatomyMedia(specialty: SpecialtyId): ApprovedMedicalMediaAsset | null {
  return approvedImagingMedia(specialty).find(asset => asset.modality === "anatomy") ?? null;
}

export function approvedEditorialMediaForContent(content: ContentObject): ApprovedMedicalMediaAsset | null {
  if (content.specialty !== "cardiology") return null;
  const text = [content.title, content.summary, ...content.tags, ...content.topics].join(" ").toLocaleLowerCase("ru-RU");
  const media = approvedImagingMedia("cardiology");

  if (/эхо|эхокар|узи|ультразв/iu.test(text)) return media.find(asset => asset.modality === "echo") ?? null;
  if (/коронар|стент|чкв|ангиограф/iu.test(text)) return media.find(asset => asset.modality === "angiography") ?? null;
  if (/кт|томограф|аорт|сосуд/iu.test(text)) return media.find(asset => asset.modality === "ct") ?? null;
  if (/мрт|миокард|инфаркт|желудоч/iu.test(text)) return media.find(asset => asset.modality === "mri") ?? null;
  if (content.kind === "clinical" || content.kind === "guideline") return media.find(asset => asset.modality === "anatomy") ?? null;
  return null;
}
