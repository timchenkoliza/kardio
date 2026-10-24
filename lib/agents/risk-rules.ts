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
];

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
  return {
    prescribing: PRESCRIBING.some(pattern => pattern.test(value)),
    imageInterpretation: IMAGE_INTERPRETATION.some(pattern => pattern.test(value)),
    emergency: EMERGENCY.some(pattern => pattern.test(value)),
    patientSpecific: PATIENT_SPECIFIC.some(pattern => pattern.test(value)),
  };
}

export function containsDirectiveLanguage(text: string): boolean {
  return DIRECTIVE_OUTPUT.some(pattern => pattern.test(text));
}

export const RISK_COPY = {
  prescribing: "Подбор терапии и дозировок для конкретного пациента агенты не делают. Покажем справочную информацию и источники — решение остаётся за вами.",
  imageInterpretation: "Интерпретация медицинских изображений не поддерживается. Можно сохранить файл как учебный материал без анализа.",
  emergency: "Это не инструмент для неотложных ситуаций. Действуйте по протоколу неотложной помощи вашего учреждения.",
  patientSpecific: "Опишите вопрос в общем виде, без данных конкретного пациента. Личные данные мы маскируем до обработки.",
  identifiers: "В тексте были персональные данные — мы их замаскировали и не сохраняем исходный вариант.",
} as const;
