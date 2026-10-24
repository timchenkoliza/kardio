/**
 * Pure policy rules shared by the server RiskCheckService and client previews.
 * The product is reference/education software for physicians: no prescribing,
 * no patient-specific decisions, no medical image interpretation.
 */
import { normalizeText, stemPattern, wordPattern } from "./text";

const PRESCRIBING = [
  stemPattern("назначь|назначить ли|назначить пациент"),
  wordPattern("какую дозу|какая доза|в какой дозе"),
  wordPattern("сколько (?:мг|таблеток)"),
  stemPattern("чем лечить (?:этого |эту |моего |мою )?(?:пациент|больн)"),
  stemPattern("отмени(?:ть)? (?:препарат|терапи|лечени)|прекратить при[её]м"),
  stemPattern("подбери (?:терапи|схем|лечени|дозу)"),
  wordPattern("prescribe|what dose"),
  // R1 C-3: the ways a dose for one patient is asked without «какую дозу».
  stemPattern("(?:стартов|начальн)\\p{L}*\\s+доз"),
  wordPattern("\\d+(?:[.,]\\d+)?\\s*или\\s*\\d+(?:[.,]\\d+)?\\s*мг"),
  stemPattern("отмен\\p{L}*\\s+\\p{L}+\\s+(?:пациент|больн)"),
  // R1 C round 2 (N-5): «сколько апиксабана давать?».
  stemPattern("сколько\\s+(?:\\p{L}+\\s+){0,3}(?:давать|дать|принимать|назначать|назначить|вводить|колоть)"),
];

/** «доза», «дозировка», «дозирование»: a dose question about a described patient is prescribing (R1 C round 2, N-5). */
const DOSE_WORD = stemPattern("доз");

const IMAGE_INTERPRETATION = [
  stemPattern("(?:интерпретир|расшифр|опиши|прочитай|проанализир|оцени)\\p{L}*\\s+(?:этот |эту |мой |мою )?(?:снимок|снимк|экг|кт|мрт|рентген|узи|эхокг|изображени|кадр|скан)"),
  stemPattern("(?:снимок|снимк|экг|рентген|эхокг|скан)\\p{L}*\\s+(?:(?:моего|моей|этого|этой)\\s+)?(?:пациент(?:ки|а|у|ке)?|больн(?:ого|ой))(?![\\p{L}])"),
  wordPattern("dicom"),
  stemPattern("interpret (?:this |the )?(?:ecg|x-?ray|ct|mri|scan|image)"),
];

const EMERGENCY = [
  // One described patient in an acute state; «у пациентов после остановки сердца» is a research question.
  stemPattern("(?:пациент(?:ка|ки|ке|ку|а|у|е|ом)?|больн(?:ой|ая|ого|ому|ую))(?![\\p{L}])[^.!?]{0,40}(?:без сознания|не дышит|остановк[аи] сердца|остановилось сердце)"),
  stemPattern("(?:бол\\p{L}* в груди|без сознания|остановк[аи] сердца|не дышит)[^.!?]*(?:сейчас|что делать|срочно)"),
  stemPattern("(?:сейчас|срочно)[^.!?]*(?:бол\\p{L}* в груди|без сознания|остановк[аи] сердца|не дышит)"),
];

const PATIENT_SPECIFIC = [
  stemPattern("(?:мой|моему|моего|у моего|у моей|моей|мою)\\s+пациент"),
  stemPattern("пациент(?:ка|у|а)?\\s+\\d{1,3}\\s*(?:лет|года|г\\.)"),
  stemPattern("больн(?:ой|ая|ому)\\s+\\d{1,3}\\s*(?:лет|года)"),
  // One described person with an age («Женщина 78 лет», «Мужчина 58 лет»); the plural («у женщин 50 лет») is a population.
  wordPattern("(?:мужчина|женщина|ребенок|девочка|мальчик|пациентка|пациент)\\s+\\d{1,3}\\s*(?:лет|года|год|мес\\p{L}*)"),
  // R1 C round 2 (N-5): the same person in other cases — «у мужчины 58 лет», «пациенту 70 лет», «старик 82 лет».
  // «у женщин 50 лет» and «мужчины 50 лет и старше» stay populations: the singular needs «у» or a singular ending.
  wordPattern("у\\s+(?:мужчины|женщины|пациента|пациентки|больного|больной|старика|старушки|ребенка|девочки|мальчика)\\s+\\d{1,3}\\s*(?:лет|года|год|мес\\p{L}*)"),
  wordPattern("(?:мужчине|женщине|пациенту|пациентке|больному|старику|старушке|ребенку|девочке|мальчику|старик|старушка)\\s+\\d{1,3}\\s*(?:лет|года|год|мес\\p{L}*)"),
  // «Пожилой пациент с КК 25», «пожилая пациентка»: one described person (the plural «у пожилых» is a population).
  wordPattern("пожил(?:ой|ая|ому|ого|ую)\\s+(?:пациент(?:ка|ке|ку|ки|а|у)?|больн(?:ой|ая|ому|ого|ую)|мужчин(?:а|е|у|ы)|женщин(?:а|е|у|ы))"),
  // A weight of one person: «весом 58 кг», «вес 72 кг».
  wordPattern("вес(?:ом)?\\s+\\d{2,3}\\s*кг"),
];

const DIRECTIVE_OUTPUT = [
  stemPattern("(?:мы\\s+)?рекомендуем\\s+(?:вам|пациенту)"),
  wordPattern("назначьте|отмените|прекратите\\s+при[её]м|начните\\s+при[её]м"),
  stemPattern("гарантирован"),
  wordPattern("(?:точный|точно)\\s+диагноз"),
];

export interface RiskSignals {
  prescribing: boolean;
  imageInterpretation: boolean;
  emergency: boolean;
  patientSpecific: boolean;
}

export function detectRiskSignals(text: string): RiskSignals {
  const value = normalizeText(text);
  const patientSpecific = PATIENT_SPECIFIC.some(pattern => pattern.test(value));
  return {
    prescribing: PRESCRIBING.some(pattern => pattern.test(value)) || (patientSpecific && DOSE_WORD.test(value)),
    imageInterpretation: IMAGE_INTERPRETATION.some(pattern => pattern.test(value)),
    emergency: EMERGENCY.some(pattern => pattern.test(value)),
    patientSpecific,
  };
}

export function containsDirectiveLanguage(text: string): boolean {
  return DIRECTIVE_OUTPUT.some(pattern => pattern.test(text));
}

/** «Коротко» and a saved answer open with this line when a dose was asked for a described patient (R1 C-3). */
export const PATIENT_DOSE_LINE = "Дозу для описанного пациента не подбираем. Раздел инструкции о дозировании — справочно, свёрнут в карточке инструкции ниже; решение остаётся за вами.";
export const PATIENT_DOSE_SAVED = "Дозу для описанного пациента не подбираем: раздел инструкции о дозировании — в самой инструкции, по ссылке в источниках; решение остаётся за вами.";

export const RISK_COPY = {
  prescribing: "Подбор терапии и дозировок для конкретного пациента агенты не делают. Покажем справочную информацию и источники — решение остаётся за вами.",
  imageInterpretation: "Интерпретация медицинских изображений не поддерживается. Можно сохранить файл как учебный материал без анализа.",
  emergency: "Это не инструмент для неотложных ситуаций. Действуйте по протоколу неотложной помощи вашего учреждения.",
  patientSpecific: "Опишите вопрос в общем виде, без данных конкретного пациента. Личные данные мы маскируем до обработки.",
  identifiers: "В тексте были персональные данные — мы их замаскировали и не сохраняем исходный вариант.",
} as const;
