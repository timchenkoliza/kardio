import type { ApprovedMedicalModality } from "@/lib/ui/approved-medical-media";

/** In-house line art for the physician feed (components/workspace/feed-art.tsx). */
export type FeedArtKey = "ecg_af" | "echo" | "artery_pressure" | "coronary_plaque" | "ventricle" | "pulmonary" | "conduction";

/** The matcher picks the clinical subject; the art is drawn for that subject. */
export const ART_BY_MODALITY: Record<ApprovedMedicalModality, FeedArtKey> = {
  ecg: "ecg_af",
  echo: "echo",
  blood_pressure: "artery_pressure",
  atherosclerosis: "coronary_plaque",
  angiography: "coronary_plaque",
  ct: "coronary_plaque",
  mri: "ventricle",
  pulmonary_hypertension: "pulmonary",
  anatomy: "conduction",
};

export const ART_ALT: Record<FeedArtKey, string> = {
  ecg_af: "Схема ЭКГ при фибрилляции предсердий: нерегулярные комплексы QRS без зубцов P",
  echo: "Схема эхокардиографии: апикальная четырёхкамерная позиция в секторе датчика",
  artery_pressure: "Схема артерии в поперечном сечении: утолщённая стенка под нагрузкой давления",
  coronary_plaque: "Схема коронарной артерии: бляшка сужает просвет, поток ускоряется и нарушается за ней",
  ventricle: "Схема левого желудочка в продольном сечении с истончённой верхушкой",
  pulmonary: "Схема лёгочных артерий: ствол и ветви с утолщёнными стенками",
  conduction: "Схема проводящей системы сердца и распространения возбуждения",
};

/** Moving pictures: the ECG trace is drawn like a monitor sweep, the echo sector is scanned. */
export const ANIMATED_ART: ReadonlySet<FeedArtKey> = new Set(["ecg_af", "echo"]);
