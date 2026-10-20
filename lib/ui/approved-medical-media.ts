import type { ContentObject, SpecialtyId } from "@/lib/domain/types";

export type ApprovedMedicalModality =
  | "anatomy"
  | "echo"
  | "mri"
  | "angiography"
  | "ct"
  | "ecg"
  | "atherosclerosis"
  | "blood_pressure"
  | "pulmonary_hypertension";

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

/**
 * Licensed illustrations from Wikimedia Commons, stored in public/media as 2:1
 * crops (no relabelling, no redraw). A media CDN can serve the same paths via
 * NEXT_PUBLIC_MEDIA_CLOUD_BASE_URL.
 */
function mediaPath(file: string): string {
  const base = process.env.NEXT_PUBLIC_MEDIA_CLOUD_BASE_URL?.trim().replace(/\/$/u, "");
  return base ? `${base}/cardiology/${file}` : `/media/cardiology/${file}`;
}

const commonsPage = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`;

export const APPROVED_CARDIOLOGY_MEDIA: readonly ApprovedMedicalMediaAsset[] = [
  { id: "cardiology-anatomy-heart", specialty: "cardiology", modality: "anatomy", kind: "image", src: mediaPath("heart-anatomy.webp"), alt: "Анатомическая иллюстрация сердца", credit: "RawPixel / Wikimedia Commons · CC0", license: "CC0", sourceUrl: commonsPage("Red_heart_illustration.png"), compactLabel: "Анатомия сердца" },
  { id: "cardiology-echo-four-chamber", specialty: "cardiology", modality: "echo", kind: "image", src: mediaPath("heart-four-chamber.webp"), alt: "Сердце в четырёхкамерной проекции: предсердия, желудочки и клапаны", credit: "Patrick J. Lynch, C. Carl Jaffe · CC BY 2.5", license: "CC BY 2.5", sourceUrl: commonsPage("Heart_tee_four_chamber_view.jpg"), compactLabel: "Четырёхкамерная проекция" },
  { id: "cardiology-mri-cine", specialty: "cardiology", modality: "mri", kind: "image", src: mediaPath("cardiac-mri-cine.webp"), alt: "МРТ сердца в четырёхкамерной проекции при перенесённом нижнем инфаркте", credit: "Doregan · CC BY-SA 4.0", license: "CC BY-SA 4.0", sourceUrl: commonsPage("4CH_cine_infarct.gif"), compactLabel: "МРТ сердца" },
  { id: "cardiology-coronary-angiography", specialty: "cardiology", modality: "angiography", kind: "image", src: mediaPath("coronary-angiography.webp"), alt: "Схема коронарографии: катетер в устье левой коронарной артерии и стеноз на ангиограмме", credit: "BruceBlaus · CC BY-SA 4.0", license: "CC BY-SA 4.0", sourceUrl: commonsPage("Coronary_Angiography.png"), compactLabel: "Коронарография" },
  { id: "cardiology-coronary-ct", specialty: "cardiology", modality: "ct", kind: "image", src: mediaPath("coronary-ct.webp"), alt: "Объёмная реконструкция КТ-коронарографии", credit: "Goleisureintl · CC BY 4.0", license: "CC BY 4.0", sourceUrl: commonsPage("Coronary_CT_Angiography_Scan.jpg"), compactLabel: "КТ-коронарография" },
  { id: "cardiology-ecg-af", specialty: "cardiology", modality: "ecg", kind: "image", src: mediaPath("ecg-atrial-fibrillation.webp"), alt: "ЭКГ в 12 отведениях при фибрилляции предсердий", credit: "Ewingdo · CC BY-SA 4.0", license: "CC BY-SA 4.0", sourceUrl: commonsPage("ECG_Atrial_Fibrillation_98_bpm.jpg"), compactLabel: "ЭКГ · фибрилляция предсердий" },
  { id: "cardiology-atherosclerotic-stenosis", specialty: "cardiology", modality: "atherosclerosis", kind: "image", src: mediaPath("atherosclerotic-stenosis.webp"), alt: "Схема атеросклеротической бляшки при стенозе 50, 75 и 90 %", credit: "K. Michaud, C. Basso, G. d’Amati и соавт. · CC BY 3.0", license: "CC BY 3.0", sourceUrl: commonsPage("Plaque_at_different_degrees_of_atherosclerotic_stenosis.jpg"), compactLabel: "Атеросклеротический стеноз" },
  { id: "cardiology-blood-pressure", specialty: "cardiology", modality: "blood_pressure", kind: "image", src: mediaPath("blood-pressure-monitor.webp"), alt: "Автоматический тонометр с манжетой для измерения артериального давления", credit: "Albarubescens · CC BY-SA 4.0", license: "CC BY-SA 4.0", sourceUrl: commonsPage("Sphygmomanometer,_automatic_blood_pressure_monitor._Oscillometric_measurements,_millimeter_of_mercury_(mmHg)_unit.jpg"), compactLabel: "Измерение АД" },
  { id: "cardiology-pulmonary-hypertension", specialty: "cardiology", modality: "pulmonary_hypertension", kind: "image", src: mediaPath("pulmonary-hypertension.webp"), alt: "Иллюстрация лёгочной гипертензии: правые отделы сердца и лёгочные артерии", credit: "BruceBlaus · CC BY-SA 4.0", license: "CC BY-SA 4.0", sourceUrl: commonsPage("Pulmonary_Hypertension.png"), compactLabel: "Лёгочная гипертензия" },
] as const;

export function approvedImagingMedia(specialty: SpecialtyId): readonly ApprovedMedicalMediaAsset[] {
  return specialty === "cardiology" ? APPROVED_CARDIOLOGY_MEDIA : [];
}

export function approvedAnatomyMedia(specialty: SpecialtyId): ApprovedMedicalMediaAsset | null {
  return approvedImagingMedia(specialty).find(asset => asset.modality === "anatomy") ?? null;
}

export type IllustrationMatchGrade = "STRONG" | "MEDIUM";

export interface IllustrationMatch {
  asset: ApprovedMedicalMediaAsset;
  grade: IllustrationMatchGrade;
}

const word = (stem: string) => `(?<![\\p{L}])${stem}`;

/**
 * Article ↔ illustration matching. Order matters: the most specific clinical
 * object wins (pulmonary hypertension before arterial hypertension, PCI before
 * generic coronary disease). Only STRONG and MEDIUM matches are returned — a weak
 * proxy is not shown at all (match gate: WEAK PROXY → replace, NO VALID MATCH → do not use).
 */
const RULES: ReadonlyArray<{ modality: ApprovedMedicalModality; grade: IllustrationMatchGrade; pattern: RegExp }> = [
  { modality: "pulmonary_hypertension", grade: "STRONG", pattern: new RegExp(`${word("л[её]гочн\\p{L}* (?:артериальн\\p{L}* )?гипертенз")}|${word("ЛАГ")}(?![\\p{L}])|${word("селексипаг")}|${word("риоцигуат")}|${word("мацитентан")}|pulmonary (?:arterial )?hypertension`, "iu") },
  { modality: "blood_pressure", grade: "STRONG", pattern: new RegExp(`${word("гипертенз")}|${word("гипертони")}|${word("артериальн\\p{L}* давлен")}|${word("АД")}(?![\\p{L}])|${word("антигипертенз")}|${word("баксдростат")}|${word("ренальн\\p{L}* денерв")}|hypertension|blood pressure`, "iu") },
  { modality: "ecg", grade: "STRONG", pattern: new RegExp(`${word("фибрилляц")}|${word("трепетани")}|${word("мерцательн")}|${word("аритми")}|${word("ЭКГ")}|${word("тахикард")}|${word("брадикард")}|${word("антиаритм")}|${word("блокад\\p{L}* сердца")}|atrial fibrillation|arrhythm|anticoagul|ablation|QT prolong`, "iu") },
  { modality: "angiography", grade: "STRONG", pattern: new RegExp(`${word("коронарограф")}|${word("ЧКВ")}|${word("стент")}|${word("реваскуляриз")}|${word("ангиопласт")}|${word("шунтирован")}|PCI|angiograph|revasculari[sz]|stent`, "iu") },
  { modality: "mri", grade: "STRONG", pattern: new RegExp(`${word("инфаркт")}|${word("ОКС")}(?![\\p{L}])|${word("остр\\p{L}* коронарн")}|${word("МРТ")}|myocardial infarction`, "iu") },
  { modality: "atherosclerosis", grade: "STRONG", pattern: new RegExp(`${word("атеросклер")}|${word("липид")}|${word("холестерин")}|${word("ЛПНП")}|${word("статин")}|${word("дислипидем")}|${word("инклисиран")}|${word("бемпедо")}|PCSK9|${word("липопротеин")}|cholesterol|lipid|LDL|statin|lipoprotein|atherosclero`, "iu") },
  { modality: "echo", grade: "STRONG", pattern: new RegExp(`${word("кардиомиопати")}|${word("клапан")}|${word("аортальн\\p{L}* стеноз")}|${word("митральн")}|${word("эхокардиограф")}|${word("ЭхоКГ")}|TAVI|TAVR|${word("афикамтен")}|${word("мавакамтен")}|cardiomyopathy|valv|aortic stenosis|mitral|echocardiograph`, "iu") },
  { modality: "echo", grade: "MEDIUM", pattern: new RegExp(`${word("сердечн\\p{L}* недостаточност")}|${word("ХСН")}|${word("СНсФВ")}|${word("СНнФВ")}|${word("фракци\\p{L}* выброса")}|${word("иНГЛТ")}|SGLT2|heart failure|ejection fraction|HFpEF|HFrEF`, "iu") },
  { modality: "ct", grade: "STRONG", pattern: new RegExp(`${word("КТ")}(?![\\p{L}])|${word("компьютерн\\p{L}* томограф")}|${word("кальци\\p{L}* индекс")}|${word("коронарн\\p{L}* кальц")}|coronary CT`, "iu") },
  { modality: "ct", grade: "MEDIUM", pattern: new RegExp(`${word("ИБС")}|${word("ишеми")}|${word("стенокард")}|${word("коронарн")}|${word("аорт")}|${word("антиагрег")}|${word("антитромбоцит")}|coronary|ischemi|angina|aortic|antiplatelet`, "iu") },
];

export function matchCardioIllustration(input: { text: string; kind?: string | null }): IllustrationMatch | null {
  const media = approvedImagingMedia("cardiology");
  for (const rule of RULES) {
    if (!rule.pattern.test(input.text)) continue;
    const asset = media.find(item => item.modality === rule.modality);
    if (asset) return { asset, grade: rule.grade };
  }
  if (input.kind === "guideline" || input.kind === "clinical" || input.kind === "guideline_change") {
    const anatomy = media.find(item => item.modality === "anatomy");
    return anatomy ? { asset: anatomy, grade: "MEDIUM" } : null;
  }
  return null;
}

export function approvedEditorialMediaForContent(content: ContentObject): ApprovedMedicalMediaAsset | null {
  if (content.specialty !== "cardiology") return null;
  return matchCardioIllustration({ text: [content.title, content.summary, ...content.tags, ...content.topics].join(" "), kind: content.kind })?.asset ?? null;
}
