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

/**
 * Line art for the other launch specialties, in the same system: one clinical
 * object per picture, schematic, never diagnostic and never a stock photo.
 */
export type SpecialtyArtKey = "lungs" | "kidney" | "ear" | "thermometer" | "gut" | "pregnancy" | "glucose" | "brain" | "neuron" | "stroke" | "eeg" | "thyroid" | "bone";
export type ArtKey = FeedArtKey | SpecialtyArtKey;

export const SPECIALTY_ART_ALT: Record<SpecialtyArtKey, string> = {
  lungs: "Схема лёгких и бронхиального дерева",
  kidney: "Схема почки с лоханкой и мочеточником",
  ear: "Схема уха: ушная раковина, слуховой проход и барабанная перепонка",
  thermometer: "Схема термометра с повышенной температурой",
  gut: "Схема кишечника: толстая кишка и петли тонкой кишки",
  pregnancy: "Схема матки с плодом",
  glucose: "Схема: капля крови и кривая уровня глюкозы относительно целевого диапазона",
  brain: "Схема головного мозга в боковой проекции",
  neuron: "Схема нейрона с миелиновой оболочкой аксона и участком демиелинизации",
  stroke: "Схема мозговой артерии с участком окклюзии",
  eeg: "Схема электроэнцефалограммы с комплексом пик–волна",
  thyroid: "Схема щитовидной железы на трахее",
  bone: "Схема кости с трабекулярной структурой и участком её разрежения",
};

export function artAlt(key: ArtKey): string {
  return key in ART_ALT ? ART_ALT[key as FeedArtKey] : SPECIALTY_ART_ALT[key as SpecialtyArtKey];
}

/** Topic (Russian glossary label) → specialty art; first match wins, null when no picture fits. */
const TOPIC_ART: ReadonlyArray<{ art: SpecialtyArtKey; pattern: RegExp }> = [
  { art: "stroke", pattern: /инсульт|тромболиз|тромбэктом/u },
  { art: "neuron", pattern: /рассеянн|демиелин|нейропат|миастен|амиотроф/u },
  { art: "eeg", pattern: /эпилепс/u },
  { art: "brain", pattern: /мигрен|головн\p{L}* бол|паркинсон|альцгеймер|деменц/u },
  { art: "pregnancy", pattern: /беремен|преэклампс|роды|родов|кесарев|послеродов/u },
  { art: "glucose", pattern: /диабет|гликем|инсулин|гпп-1|нглт-2/iu },
  { art: "thyroid", pattern: /щитовид|гипотире|гипертире/u },
  { art: "bone", pattern: /остеопороз|перелом/u },
  { art: "kidney", pattern: /почек|почеч/u },
  { art: "ear", pattern: /отит/u },
  { art: "gut", pattern: /гастроэнтерит|кишечн|гэрб|хеликобакт/u },
  { art: "thermometer", pattern: /лихорад/u },
  { art: "lungs", pattern: /хобл|астм|пневмони|бронхиолит|респиратор|грипп|туберкул/iu },
];

export function artForTopics(terms: readonly string[]): SpecialtyArtKey | null {
  const text = terms.join(" ").toLocaleLowerCase("ru-RU");
  return TOPIC_ART.find(item => item.pattern.test(text))?.art ?? null;
}
