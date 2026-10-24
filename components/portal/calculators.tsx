"use client";

import { useId, useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { CALCULATORS, type CalculatorDefinition, type CalculatorId } from "@/lib/calculators/catalog";
import { bodyMassIndex, bsaMosteller, ckdEpi2021, cockcroftGault, gestationByLmp, glasgowComaScale, homaIr, schwartzBedside, type CalcOutcome, type CreatinineUnit, type Sex } from "@/lib/calculators/formulas";
import { cha2Ds2VaLabel, hasBledLabel, scoreCha2Ds2Va, scoreHasBled } from "@/lib/ui/clinical-calculators";

/**
 * Reference calculators computed in the browser; nothing is sent to the
 * server. Every card shows its formula, where it applies and the primary
 * source; without valid input there is no result. A value is never a
 * diagnosis, a dose or a prescription.
 */

function Check({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: string }) {
  return <label className="pt-calc-check"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span className="pt-calc-box" aria-hidden="true" /><span>{children}</span></label>;
}

function parse(value: string): number {
  const text = value.trim().replace(",", ".");
  return text ? Number(text) : Number.NaN;
}

function NumberField({ label, unit, value, onChange, step = "any" }: { label: string; unit: string; value: string; onChange: (value: string) => void; step?: string }) {
  const id = useId();
  return <div className="pt-calc-field">
    <label htmlFor={id}>{label}</label>
    <span className="pt-calc-input"><input id={id} inputMode="decimal" type="text" autoComplete="off" value={value} step={step} onChange={event => onChange(event.target.value)} /><span>{unit}</span></span>
  </div>;
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return <fieldset className="pt-calc-choice">
    <legend>{label}</legend>
    <div>{options.map(option => <label key={option.value}><input type="radio" checked={value === option.value} onChange={() => onChange(option.value)} /><span>{option.label}</span></label>)}</div>
  </fieldset>;
}

const SEX_OPTIONS = [{ value: "female", label: "Женский" }, { value: "male", label: "Мужской" }] as const;
const CREATININE_OPTIONS = [{ value: "umol_l", label: "мкмоль/л" }, { value: "mg_dl", label: "мг/дл" }] as const;

function Card({ definition, outcome, empty, children, score }: { definition: CalculatorDefinition; outcome: CalcOutcome | null; empty: boolean; children: ReactNode; score?: ReactNode }) {
  const titleId = `pt-calc-${definition.id}`;
  return <section className="pt-calc" aria-labelledby={titleId} data-calculator={definition.id}>
    <div className="pt-calc-head">
      <div><p className="pt-agent-role">{definition.group}</p><h2 id={titleId} className="pt-subtitle">{definition.title}</h2></div>
      {score ?? <output className="pt-calc-score" aria-live="polite" data-ready={Boolean(outcome?.ok)}>{outcome?.ok ? <><strong>{outcome.display}</strong>{outcome.unit && <span>{outcome.unit}</span>}</> : <strong aria-label="нет результата">—</strong>}</output>}
    </div>
    <p className="ws-muted">{definition.purpose}</p>
    {children}
    {outcome && <p className="pt-calc-result" data-state={outcome.ok ? "result" : empty ? "empty" : "refused"} aria-live="polite">
      {outcome.ok ? outcome.interpretation : empty ? "Введите данные — результат появится здесь." : outcome.reason}
    </p>}
    <details className="pt-calc-about">
      <summary>Формула и применимость</summary>
      <p><strong>Формула.</strong> {definition.formula}</p>
      <p><strong>Применимость.</strong> {definition.applicability}</p>
    </details>
    <ul className="pt-calc-sources">{definition.sources.map(source => <li key={source.url}><a className="pt-source-link" href={source.url} target="_blank" rel="noreferrer">{source.citation}<ExternalLink size={13} aria-hidden="true" /></a></li>)}</ul>
  </section>;
}

function Cha2Ds2Va() {
  const [age, setAge] = useState("65");
  const [cha, setCha] = useState({ heartFailure: false, hypertension: true, diabetes: false, strokeTiaEmbolism: false, vascularDisease: false });
  const years = parse(age);
  const valid = Number.isFinite(years) && years >= 18 && years <= 110;
  const score = valid ? scoreCha2Ds2Va({ ...cha, age: years }) : null;
  return <Card definition={CALCULATORS.cha2ds2va} outcome={null} empty={false} score={<output className="pt-calc-score" aria-live="polite"><strong>{score ?? "—"}</strong><span>баллов</span></output>}>
    <NumberField label="Возраст" unit="лет" value={age} onChange={setAge} />
    <div className="pt-calc-grid">
      <Check checked={cha.heartFailure} onChange={value => setCha(current => ({ ...current, heartFailure: value }))}>Сердечная недостаточность</Check>
      <Check checked={cha.hypertension} onChange={value => setCha(current => ({ ...current, hypertension: value }))}>Артериальная гипертензия</Check>
      <Check checked={cha.diabetes} onChange={value => setCha(current => ({ ...current, diabetes: value }))}>Сахарный диабет</Check>
      <Check checked={cha.strokeTiaEmbolism} onChange={value => setCha(current => ({ ...current, strokeTiaEmbolism: value }))}>Инсульт / ТИА / эмболия</Check>
      <Check checked={cha.vascularDisease} onChange={value => setCha(current => ({ ...current, vascularDisease: value }))}>Сосудистое заболевание</Check>
    </div>
    <p className="pt-calc-result" aria-live="polite">{score === null ? "Введите возраст от 18 лет." : <><strong>{cha2Ds2VaLabel(score)}</strong> ESC 2024 использует 1 балл как порог для рассмотрения антикоагуляции, а ≥2 — как порог рекомендации. Расчёт не заменяет оценку полного клинического контекста.</>}</p>
  </Card>;
}

function HasBled() {
  const [has, setHas] = useState({ hypertension: false, abnormalRenal: false, abnormalLiver: false, stroke: false, bleedingHistory: false, labileInr: false, ageOver65: false, drugs: false, alcohol: false });
  const score = scoreHasBled(has);
  return <Card definition={CALCULATORS.hasbled} outcome={null} empty={false} score={<output className="pt-calc-score" aria-live="polite"><strong>{score}</strong><span>баллов</span></output>}>
    <div className="pt-calc-grid">
      <Check checked={has.hypertension} onChange={value => setHas(current => ({ ...current, hypertension: value }))}>САД &gt;160 мм рт. ст.</Check>
      <Check checked={has.abnormalRenal} onChange={value => setHas(current => ({ ...current, abnormalRenal: value }))}>Нарушение функции почек</Check>
      <Check checked={has.abnormalLiver} onChange={value => setHas(current => ({ ...current, abnormalLiver: value }))}>Нарушение функции печени</Check>
      <Check checked={has.stroke} onChange={value => setHas(current => ({ ...current, stroke: value }))}>Инсульт в анамнезе</Check>
      <Check checked={has.bleedingHistory} onChange={value => setHas(current => ({ ...current, bleedingHistory: value }))}>Кровотечение или предрасположенность</Check>
      <Check checked={has.labileInr} onChange={value => setHas(current => ({ ...current, labileInr: value }))}>Лабильное МНО</Check>
      <Check checked={has.ageOver65} onChange={value => setHas(current => ({ ...current, ageOver65: value }))}>Возраст &gt;65 лет</Check>
      <Check checked={has.drugs} onChange={value => setHas(current => ({ ...current, drugs: value }))}>Аспирин, НПВП и др.</Check>
      <Check checked={has.alcohol} onChange={value => setHas(current => ({ ...current, alcohol: value }))}>Избыточное употребление алкоголя</Check>
    </div>
    <p className="pt-calc-result" aria-live="polite"><strong>{hasBledLabel(score)}</strong> При значении ≥3 рекомендации акцентируют коррекцию модифицируемых факторов и более частый пересмотр риска.</p>
  </Card>;
}

function useCreatinine() {
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<CreatinineUnit>("umol_l");
  const field = <>
    <NumberField label="Креатинин сыворотки" unit={unit === "umol_l" ? "мкмоль/л" : "мг/дл"} value={value} onChange={setValue} />
    <Choice label="Единицы креатинина" value={unit} options={CREATININE_OPTIONS} onChange={setUnit} />
  </>;
  return { value, unit, field };
}

function CkdEpi() {
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<Sex>("female");
  const creatinine = useCreatinine();
  const empty = !age.trim() && !creatinine.value.trim();
  const outcome = ckdEpi2021({ age: parse(age), sex, creatinine: parse(creatinine.value), unit: creatinine.unit });
  return <Card definition={CALCULATORS.ckd_epi_2021} outcome={outcome} empty={empty}>
    <div className="pt-calc-fields"><NumberField label="Возраст" unit="лет" value={age} onChange={setAge} />{creatinine.field}<Choice label="Пол" value={sex} options={SEX_OPTIONS} onChange={setSex} /></div>
  </Card>;
}

function CockcroftGault() {
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [sex, setSex] = useState<Sex>("female");
  const creatinine = useCreatinine();
  const empty = !age.trim() && !weight.trim() && !creatinine.value.trim();
  const outcome = cockcroftGault({ age: parse(age), sex, weightKg: parse(weight), creatinine: parse(creatinine.value), unit: creatinine.unit });
  return <Card definition={CALCULATORS.cockcroft_gault} outcome={outcome} empty={empty}>
    <div className="pt-calc-fields"><NumberField label="Возраст" unit="лет" value={age} onChange={setAge} /><NumberField label="Масса тела" unit="кг" value={weight} onChange={setWeight} />{creatinine.field}<Choice label="Пол" value={sex} options={SEX_OPTIONS} onChange={setSex} /></div>
  </Card>;
}

function Schwartz() {
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const creatinine = useCreatinine();
  const empty = !age.trim() && !height.trim() && !creatinine.value.trim();
  const outcome = schwartzBedside({ ageYears: parse(age), heightCm: parse(height), creatinine: parse(creatinine.value), unit: creatinine.unit });
  return <Card definition={CALCULATORS.schwartz_bedside} outcome={outcome} empty={empty}>
    <div className="pt-calc-fields"><NumberField label="Возраст" unit="лет" value={age} onChange={setAge} /><NumberField label="Рост" unit="см" value={height} onChange={setHeight} />{creatinine.field}</div>
  </Card>;
}

function Anthropometry({ id }: { id: "bmi" | "bsa_mosteller" }) {
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const empty = !height.trim() && !weight.trim();
  const input = { heightCm: parse(height), weightKg: parse(weight) };
  const outcome = id === "bmi" ? bodyMassIndex(input) : bsaMosteller(input);
  return <Card definition={CALCULATORS[id]} outcome={outcome} empty={empty}>
    <div className="pt-calc-fields"><NumberField label="Рост" unit="см" value={height} onChange={setHeight} /><NumberField label="Масса тела" unit="кг" value={weight} onChange={setWeight} /></div>
  </Card>;
}

const GCS_EYE = [[4, "Спонтанно"], [3, "На речь"], [2, "На боль"], [1, "Нет"]] as const;
const GCS_VERBAL = [[5, "Ориентирован"], [4, "Спутанная речь"], [3, "Отдельные слова"], [2, "Нечленораздельные звуки"], [1, "Нет"]] as const;
const GCS_MOTOR = [[6, "Выполняет команды"], [5, "Локализует боль"], [4, "Отдёргивание"], [3, "Патологическое сгибание"], [2, "Разгибание"], [1, "Нет"]] as const;

function GcsSelect({ label, options, value, onChange }: { label: string; options: ReadonlyArray<readonly [number, string]>; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <div className="pt-calc-field">
    <label htmlFor={id}>{label}</label>
    <select id={id} className="pt-calc-select" value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Не выбрано</option>
      {options.map(([score, text]) => <option key={score} value={score}>{score} — {text}</option>)}
    </select>
  </div>;
}

function Gcs() {
  const [eye, setEye] = useState("");
  const [verbal, setVerbal] = useState("");
  const [motor, setMotor] = useState("");
  const empty = !eye && !verbal && !motor;
  const outcome = glasgowComaScale({ eye: parse(eye), verbal: parse(verbal), motor: parse(motor) });
  return <Card definition={CALCULATORS.gcs} outcome={outcome} empty={empty}>
    <div className="pt-calc-fields"><GcsSelect label="Открывание глаз (E)" options={GCS_EYE} value={eye} onChange={setEye} /><GcsSelect label="Речевой ответ (V)" options={GCS_VERBAL} value={verbal} onChange={setVerbal} /><GcsSelect label="Двигательный ответ (M)" options={GCS_MOTOR} value={motor} onChange={setMotor} /></div>
  </Card>;
}

function Homa() {
  const [insulin, setInsulin] = useState("");
  const [glucose, setGlucose] = useState("");
  const empty = !insulin.trim() && !glucose.trim();
  const outcome = homaIr({ insulinMicroUnits: parse(insulin), glucoseMmol: parse(glucose) });
  return <Card definition={CALCULATORS.homa_ir} outcome={outcome} empty={empty}>
    <div className="pt-calc-fields"><NumberField label="Инсулин натощак" unit="мкЕд/мл" value={insulin} onChange={setInsulin} /><NumberField label="Глюкоза натощак" unit="ммоль/л" value={glucose} onChange={setGlucose} /></div>
  </Card>;
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function Gestation() {
  const [lmp, setLmp] = useState("");
  // «Today» is taken when the date is entered (an event, not a render), in the physician's own time zone.
  const [today, setToday] = useState("");
  const id = useId();
  const outcome = gestationByLmp({ lmp, today });
  return <Card definition={CALCULATORS.gestation_lmp} outcome={outcome} empty={!lmp}>
    <div className="pt-calc-fields"><div className="pt-calc-field">
      <label htmlFor={id}>Первый день последней менструации</label>
      <span className="pt-calc-input"><input id={id} type="date" value={lmp} onChange={event => { setLmp(event.target.value); setToday(localDay(new Date())); }} /></span>
    </div></div>
  </Card>;
}

const RENDERERS: Record<CalculatorId, () => ReactNode> = {
  cha2ds2va: () => <Cha2Ds2Va />,
  hasbled: () => <HasBled />,
  ckd_epi_2021: () => <CkdEpi />,
  cockcroft_gault: () => <CockcroftGault />,
  schwartz_bedside: () => <Schwartz />,
  bmi: () => <Anthropometry id="bmi" />,
  bsa_mosteller: () => <Anthropometry id="bsa_mosteller" />,
  gcs: () => <Gcs />,
  homa_ir: () => <Homa />,
  gestation_lmp: () => <Gestation />,
};

export function Calculators({ ids }: { ids: readonly CalculatorId[] }) {
  return <div className="pt-calcs">{ids.map(id => <div key={id} className="pt-calc-slot">{RENDERERS[id]()}</div>)}</div>;
}
