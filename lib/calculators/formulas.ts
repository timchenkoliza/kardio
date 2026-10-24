/**
 * Reference formulas computed in the browser. Each function validates its
 * inputs against the range the formula was derived for and refuses (with a
 * reason) instead of extrapolating. A value is never a diagnosis, a dose or
 * a prescription.
 *
 * Sources are listed with each definition in lib/calculators/catalog.ts and
 * every formula is pinned by worked examples in tests/unit/calculators.test.ts.
 */

export type Sex = "female" | "male";
export type CreatinineUnit = "umol_l" | "mg_dl";

/** µmol/L per mg/dL of creatinine (molar mass 113.12 g/mol). */
export const CREATININE_UMOL_PER_MG_DL = 88.4;

export type CalcOutcome =
  | { ok: true; value: number; display: string; unit: string; interpretation: string | null }
  | { ok: false; reason: string };

const refuse = (reason: string): CalcOutcome => ({ ok: false, reason });

function finite(...values: Array<number | null | undefined>): boolean {
  return values.every(value => typeof value === "number" && Number.isFinite(value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function ru(value: number, digits: number): string {
  return round(value, digits).toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Creatinine in mg/dL, or null outside 0.1–25 mg/dL (≈9–2210 µmol/L): such a value is a typing error, not a patient. */
export function creatinineMgDl(value: number, unit: CreatinineUnit): number | null {
  if (!finite(value) || value <= 0) return null;
  const mg = unit === "mg_dl" ? value : value / CREATININE_UMOL_PER_MG_DL;
  return mg >= 0.1 && mg <= 25 ? mg : null;
}

/** KDIGO GFR categories. A category is not a diagnosis of CKD: that needs ≥3 months and markers of kidney damage. */
export function gfrCategory(egfr: number): string {
  if (egfr >= 90) return "G1 (≥90)";
  if (egfr >= 60) return "G2 (60–89)";
  if (egfr >= 45) return "G3a (45–59)";
  if (egfr >= 30) return "G3b (30–44)";
  if (egfr >= 15) return "G4 (15–29)";
  return "G5 (<15)";
}

/** CKD-EPI 2021 creatinine equation (race-free), adults ≥18 years, IDMS-traceable creatinine. */
export function ckdEpi2021(input: { age: number; sex: Sex; creatinine: number; unit: CreatinineUnit }): CalcOutcome {
  if (!finite(input.age, input.creatinine)) return refuse("Введите возраст и креатинин.");
  if (input.age < 18 || input.age > 110) return refuse("Уравнение CKD-EPI выведено для взрослых 18 лет и старше. Для детей — формула Шварца.");
  const scr = creatinineMgDl(input.creatinine, input.unit);
  if (scr === null) return refuse("Креатинин вне правдоподобного диапазона — проверьте значение и единицы.");
  const female = input.sex === "female";
  const kappa = female ? 0.7 : 0.9;
  const alpha = female ? -0.241 : -0.302;
  const ratio = scr / kappa;
  const egfr = 142 * Math.min(ratio, 1) ** alpha * Math.max(ratio, 1) ** -1.2 * 0.9938 ** input.age * (female ? 1.012 : 1);
  const value = Math.round(egfr);
  return { ok: true, value, display: String(value), unit: "мл/мин/1,73 м²", interpretation: `Категория СКФ по KDIGO: ${gfrCategory(egfr)}` };
}

/** Cockcroft–Gault creatinine clearance, adults; uses actual body weight as entered. */
export function cockcroftGault(input: { age: number; sex: Sex; weightKg: number; creatinine: number; unit: CreatinineUnit }): CalcOutcome {
  if (!finite(input.age, input.weightKg, input.creatinine)) return refuse("Введите возраст, массу тела и креатинин.");
  if (input.age < 18 || input.age > 110) return refuse("Формула Кокрофта–Голта применяется у взрослых.");
  if (input.weightKg < 30 || input.weightKg > 300) return refuse("Масса тела вне диапазона 30–300 кг — проверьте значение.");
  const scr = creatinineMgDl(input.creatinine, input.unit);
  if (scr === null) return refuse("Креатинин вне правдоподобного диапазона — проверьте значение и единицы.");
  const clearance = ((140 - input.age) * input.weightKg) / (72 * scr) * (input.sex === "female" ? 0.85 : 1);
  const value = Math.round(clearance);
  return { ok: true, value, display: String(value), unit: "мл/мин", interpretation: "Клиренс креатинина не нормирован на площадь поверхности тела. Порог для коррекции дозы конкретного препарата указан в его инструкции." };
}

/** Bedside Schwartz (2009) eGFR for children 1–16 years with enzymatic creatinine. */
export function schwartzBedside(input: { ageYears: number; heightCm: number; creatinine: number; unit: CreatinineUnit }): CalcOutcome {
  if (!finite(input.ageYears, input.heightCm, input.creatinine)) return refuse("Введите возраст, рост и креатинин.");
  if (input.ageYears < 1 || input.ageYears > 16) return refuse("Формула Шварца (2009) выведена для детей 1–16 лет. С 18 лет — CKD-EPI.");
  if (input.heightCm < 45 || input.heightCm > 210) return refuse("Рост вне диапазона 45–210 см — проверьте значение.");
  const scr = creatinineMgDl(input.creatinine, input.unit);
  if (scr === null) return refuse("Креатинин вне правдоподобного диапазона — проверьте значение и единицы.");
  const egfr = (0.413 * input.heightCm) / scr;
  const value = Math.round(egfr);
  return { ok: true, value, display: String(value), unit: "мл/мин/1,73 м²", interpretation: "Формула выведена у детей с ХБП (исследование CKiD); у детей без ХБП может занижать СКФ." };
}

/** Body-mass index with the WHO adult categories. */
export function bodyMassIndex(input: { weightKg: number; heightCm: number }): CalcOutcome {
  if (!finite(input.weightKg, input.heightCm)) return refuse("Введите рост и массу тела.");
  if (input.heightCm < 100 || input.heightCm > 250) return refuse("Рост вне диапазона 100–250 см — проверьте значение.");
  if (input.weightKg < 20 || input.weightKg > 400) return refuse("Масса тела вне диапазона 20–400 кг — проверьте значение.");
  const bmi = input.weightKg / (input.heightCm / 100) ** 2;
  return { ok: true, value: round(bmi, 1), display: ru(bmi, 1), unit: "кг/м²", interpretation: `Категория ВОЗ для взрослых: ${bmiCategory(bmi)}. У детей и подростков ИМТ оценивают по центильным кривым ВОЗ для возраста и пола.` };
}

export function bmiCategory(bmi: number): string {
  const value = round(bmi, 1);
  if (value < 18.5) return "недостаточная масса тела (<18,5)";
  if (value < 25) return "нормальная масса тела (18,5–24,9)";
  if (value < 30) return "избыточная масса тела (25–29,9)";
  if (value < 35) return "ожирение I степени (30–34,9)";
  if (value < 40) return "ожирение II степени (35–39,9)";
  return "ожирение III степени (≥40)";
}

/** Body-surface area, Mosteller formula. */
export function bsaMosteller(input: { weightKg: number; heightCm: number }): CalcOutcome {
  if (!finite(input.weightKg, input.heightCm)) return refuse("Введите рост и массу тела.");
  if (input.heightCm < 40 || input.heightCm > 250) return refuse("Рост вне диапазона 40–250 см — проверьте значение.");
  if (input.weightKg < 2 || input.weightKg > 400) return refuse("Масса тела вне диапазона 2–400 кг — проверьте значение.");
  const bsa = Math.sqrt((input.heightCm * input.weightKg) / 3600);
  return { ok: true, value: round(bsa, 2), display: ru(bsa, 2), unit: "м²", interpretation: "Площадь поверхности тела. Расчёт дозы по ППТ — по инструкции препарата и протоколу, а не по этому калькулятору." };
}

/** Glasgow Coma Scale: eye 1–4, verbal 1–5, motor 1–6. */
export function glasgowComaScale(input: { eye: number; verbal: number; motor: number }): CalcOutcome {
  const { eye, verbal, motor } = input;
  if (!finite(eye, verbal, motor)) return refuse("Выберите ответ по каждому из трёх компонентов.");
  if (![eye >= 1 && eye <= 4, verbal >= 1 && verbal <= 5, motor >= 1 && motor <= 6].every(Boolean) || ![eye, verbal, motor].every(Number.isInteger)) return refuse("Недопустимое значение компонента шкалы.");
  const total = eye + verbal + motor;
  const band = total <= 8 ? "тяжёлое нарушение сознания (3–8)" : total <= 12 ? "умеренное нарушение (9–12)" : "лёгкое нарушение или норма (13–15)";
  return { ok: true, value: total, display: String(total), unit: "баллов", interpretation: `E${eye} V${verbal} M${motor}: ${band}. Записывайте компоненты, а не только сумму.` };
}

/** HOMA-IR = fasting insulin (µU/mL) × fasting glucose (mmol/L) / 22.5. No universal cut-off: it depends on the insulin assay and population. */
export function homaIr(input: { insulinMicroUnits: number; glucoseMmol: number }): CalcOutcome {
  if (!finite(input.insulinMicroUnits, input.glucoseMmol)) return refuse("Введите инсулин и глюкозу натощак.");
  if (input.insulinMicroUnits <= 0 || input.insulinMicroUnits > 300) return refuse("Инсулин вне диапазона 0–300 мкЕд/мл — проверьте значение.");
  if (input.glucoseMmol < 2 || input.glucoseMmol > 30) return refuse("Глюкоза вне диапазона 2–30 ммоль/л — проверьте значение.");
  const value = (input.insulinMicroUnits * input.glucoseMmol) / 22.5;
  return { ok: true, value: round(value, 2), display: ru(value, 2), unit: "", interpretation: "Единого порога нет: он зависит от метода определения инсулина и популяции. Сверяйте с референсом своей лаборатории." };
}

const DAY_MS = 86_400_000;

function utcDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

/** Gestational age and estimated date of delivery by the first day of the last menstrual period (LMP + 280 days). */
export function gestationByLmp(input: { lmp: string; today: string }): CalcOutcome & { edd?: string } {
  const lmp = utcDay(input.lmp);
  const today = utcDay(input.today);
  if (lmp === null || today === null) return refuse("Укажите дату первого дня последней менструации.");
  const days = Math.round((today - lmp) / DAY_MS);
  if (days < 0) return refuse("Дата последней менструации позже сегодняшней.");
  if (days > 44 * 7) return refuse("Больше 44 недель от указанной даты — проверьте дату.");
  const edd = new Date(lmp + 280 * DAY_MS).toISOString().slice(0, 10);
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  const eddRu = new Date(`${edd}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return { ok: true, value: days, display: `${weeks} нед. ${rest} дн.`, unit: "", interpretation: `Предполагаемая дата родов: ${eddRu}. Срок по менструации уточняют по УЗИ в I триместре; при расхождении ориентируются на УЗИ.`, edd };
}
