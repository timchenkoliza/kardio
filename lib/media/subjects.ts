import type { SpecialtyId } from "@/lib/domain/types";
import type { ArtKey } from "@/lib/ui/feed-art";

/**
 * Clinical object of a card or a source image. A derivative is shown on a card
 * only when both name the same object in the same specialty; the art is the
 * in-house fallback for that object. One rule table per specialty, the same
 * engine for all of them; within a table the most specific object comes first.
 */

export type SubjectGrade = "STRONG" | "MEDIUM";

export interface SubjectMatch {
  subject: string;
  grade: SubjectGrade;
  /** In-house art drawn for the same object, used when no approved derivative exists. */
  art: ArtKey | null;
}

interface SubjectRule { subject: string; grade: SubjectGrade; art: ArtKey | null; pattern: RegExp }

const word = (stem: string) => `(?<![\\p{L}])${stem}`;
const rule = (subject: string, grade: SubjectGrade, art: ArtKey | null, ...stems: string[]): SubjectRule => ({ subject, grade, art, pattern: new RegExp(stems.join("|"), "iu") });

/** Documents of these kinds that name no object get the general anatomy of their specialty, as a topic illustration. */
const GENERAL_KINDS = new Set(["guideline", "clinical", "guideline_change"]);
const GENERAL: Partial<Record<SpecialtyId, SubjectMatch>> = {
  cardiology: { subject: "heart_anatomy", grade: "MEDIUM", art: "conduction" },
};

const RULES: Partial<Record<SpecialtyId, readonly SubjectRule[]>> = {
  cardiology: [
    rule("pulmonary_hypertension", "STRONG", "pulmonary", `${word("л[её]гочн")}\\p{L}* (?:артериальн\\p{L}* )?гипертенз`, `${word("ЛАГ")}(?![\\p{L}])`, word("селексипаг"), word("риоцигуат"), word("мацитентан"), "pulmonary (?:arterial )?hypertension"),
    rule("atrial_fibrillation", "STRONG", "ecg_af", `${word("фибрилляц")}\\p{L}* предсерд`, `${word("трепетани")}\\p{L}* предсерд`, word("мерцательн"), `${word("ФП")}(?![\\p{L}])`, "atrial fibrillation"),
    rule("myocardial_infarction", "STRONG", "ventricle", word("инфаркт"), `${word("ОКС")}(?![\\p{L}])`, `${word("остр")}\\p{L}* коронарн\\p{L}* синдром`, "myocardial infarction", "acute coronary syndrome"),
    rule("coronary_artery_disease", "STRONG", "coronary_plaque", `${word("ИБС")}(?![\\p{L}])`, `${word("ишемическ")}\\p{L}* болезн\\p{L}* сердца`, word("стенокард"), `${word("коронарн")}\\p{L}* (?:артери|болезн|стеноз|кальц)`, word("коронарограф"), `${word("ЧКВ")}(?![\\p{L}])`, word("стент"), word("реваскуляриз"), word("шунтирован"), word("ангиопласт"), "coronary artery disease", "\\bPCI\\b", "angina", "revasculari[sz]"),
    rule("atherosclerosis", "STRONG", "coronary_plaque", word("атеросклер"), word("липид"), word("холестерин"), word("ЛПНП"), word("статин"), word("дислипидем"), word("инклисиран"), word("бемпедо"), "PCSK9", word("липопротеин"), "atherosclero", "cholesterol", "\\bLDL\\b", "statin"),
    rule("arterial_hypertension", "STRONG", "artery_pressure", word("гипертенз"), word("гипертони"), `${word("артериальн")}\\p{L}* давлен`, `${word("АД")}(?![\\p{L}])`, word("антигипертенз"), word("баксдростат"), "hypertension", "blood pressure"),
    // The four-chamber source shows normal anatomy: valves, cardiomyopathy and heart failure get it as a topic illustration.
    rule("heart_chambers_valves", "MEDIUM", "echo", word("кардиомиопати"), word("клапан"), `${word("аортальн")}\\p{L}* (?:стеноз|недостаточн)`, `${word("митральн")}`, word("эхокардиограф"), word("ЭхоКГ"), "TAVI", "TAVR", word("мавакамтен"), word("афикамтен"), `${word("сердечн")}\\p{L}* недостаточн`, `${word("ХСН")}(?![\\p{L}])`, `${word("фракци")}\\p{L}* выброса`, "cardiomyopathy", "valv", "heart failure", "ejection fraction"),
    rule("heart_anatomy", "MEDIUM", "conduction", word("аритми"), word("тахикард"), word("брадикард"), `${word("нарушени")}\\p{L}* (?:ритма|проводимост)`, `${word("блокад")}\\p{L}* сердца`, `${word("внезапн")}\\p{L}* (?:сердечн\\p{L}* )?смерт`, word("миокардит"), "arrhythm", "tachycard"),
  ],
  therapy: [
    rule("pneumonia", "STRONG", "lungs", word("пневмони"), "pneumonia"),
    rule("asthma", "STRONG", "lungs", word("астм"), "asthma"),
  ],
  pediatrics: [
    rule("otitis_media", "STRONG", "ear", word("отит"), "otitis"),
    rule("gastroenteritis", "MEDIUM", "gut", word("гастроэнтерит"), "gastroenteritis"),
  ],
  obgyn: [
    rule("preeclampsia", "MEDIUM", "pregnancy", word("преэклампс"), "pre-?eclampsia"),
    rule("preterm_birth", "MEDIUM", "pregnancy", `${word("преждевременн")}\\p{L}* род`, "preterm"),
  ],
  neurology: [
    rule("ischemic_stroke", "STRONG", "stroke", `${word("ишемическ")}\\p{L}* инсульт`, word("тромболиз"), word("тромбэктом"), "isch(?:a)?emic stroke", "thromboly"),
    // Stroke in general (rehabilitation, prevention): the occluded artery illustrates the topic, not the case.
    rule("ischemic_stroke", "MEDIUM", "stroke", word("инсульт"), "\\bstroke\\b"),
    rule("multiple_sclerosis", "STRONG", "neuron", `${word("рассеянн")}\\p{L}* склероз`, word("демиелин"), "multiple sclerosis"),
  ],
  endocrinology: [
    rule("type2_diabetes", "STRONG", "glucose", `${word("диабет")}\\p{L}* 2`, `${word("СД")} ?2`, "type 2 diabetes", word("гипергликеми")),
    rule("osteoporosis", "STRONG", "bone", word("остеопороз"), "osteoporo"),
  ],
};

export function subjectFor(specialty: SpecialtyId, text: string, kind?: string | null): SubjectMatch | null {
  const found = RULES[specialty]?.find(item => item.pattern.test(text));
  if (found) return { subject: found.subject, grade: found.grade, art: found.art };
  return kind && GENERAL_KINDS.has(kind) ? GENERAL[specialty] ?? null : null;
}
