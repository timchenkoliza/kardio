"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { cha2Ds2VaLabel, hasBledLabel, scoreCha2Ds2Va, scoreHasBled } from "@/lib/ui/clinical-calculators";

/**
 * Reference risk scores computed in the browser; nothing is sent to the
 * server. A score is never a diagnosis or a prescription.
 */

function Check({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: string }) {
  return <label className="pt-calc-check"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span className="pt-calc-box" aria-hidden="true" /><span>{children}</span></label>;
}

export function CardiologyCalculators() {
  const [age, setAge] = useState(65);
  const [cha, setCha] = useState({ heartFailure: false, hypertension: true, diabetes: false, strokeTiaEmbolism: false, vascularDisease: false });
  const [has, setHas] = useState({ hypertension: false, abnormalRenal: false, abnormalLiver: false, stroke: false, bleedingHistory: false, labileInr: false, ageOver65: false, drugs: false, alcohol: false });
  const chaScore = scoreCha2Ds2Va({ ...cha, age });
  const hasScore = scoreHasBled(has);
  return <div className="pt-calcs">
    <section className="pt-calc" aria-labelledby="pt-calc-cha">
      <div className="pt-calc-head"><div><p className="pt-agent-role">Фибрилляция предсердий</p><h2 id="pt-calc-cha" className="pt-subtitle">CHA₂DS₂-VA</h2></div><output className="pt-calc-score" aria-live="polite"><strong>{chaScore}</strong><span>баллов</span></output></div>
      <p className="ws-muted">Справочная оценка риска инсульта и тромбоэмболии при ФП по шкале ESC 2024.</p>
      <label className="pt-calc-age"><span>Возраст</span><input type="number" min={18} max={110} value={age} onChange={event => setAge(Number(event.target.value) || 0)} /></label>
      <div className="pt-calc-grid">
        <Check checked={cha.heartFailure} onChange={value => setCha(current => ({ ...current, heartFailure: value }))}>Сердечная недостаточность</Check>
        <Check checked={cha.hypertension} onChange={value => setCha(current => ({ ...current, hypertension: value }))}>Артериальная гипертензия</Check>
        <Check checked={cha.diabetes} onChange={value => setCha(current => ({ ...current, diabetes: value }))}>Сахарный диабет</Check>
        <Check checked={cha.strokeTiaEmbolism} onChange={value => setCha(current => ({ ...current, strokeTiaEmbolism: value }))}>Инсульт / ТИА / эмболия</Check>
        <Check checked={cha.vascularDisease} onChange={value => setCha(current => ({ ...current, vascularDisease: value }))}>Сосудистое заболевание</Check>
      </div>
      <p className="pt-calc-result"><strong>{cha2Ds2VaLabel(chaScore)}</strong> ESC 2024 использует 1 балл как порог для рассмотрения антикоагуляции, а ≥2 — как порог рекомендации. Расчёт не заменяет оценку полного клинического контекста.</p>
      <a className="pt-source-link" href="https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/atrial-fibrillation" target="_blank" rel="noreferrer">Открыть первоисточник<ExternalLink size={13} aria-hidden="true" /></a>
    </section>
    <section className="pt-calc" aria-labelledby="pt-calc-has">
      <div className="pt-calc-head"><div><p className="pt-agent-role">Антикоагуляция</p><h2 id="pt-calc-has" className="pt-subtitle">HAS-BLED</h2></div><output className="pt-calc-score" aria-live="polite"><strong>{hasScore}</strong><span>баллов</span></output></div>
      <p className="ws-muted">Факторы риска кровотечения при ФП. Высокий балл сам по себе не основание для отмены антикоагуляции.</p>
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
      <p className="pt-calc-result"><strong>{hasBledLabel(hasScore)}</strong> При значении ≥3 рекомендации акцентируют коррекцию модифицируемых факторов и более частый пересмотр риска.</p>
      <a className="pt-source-link" href="https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/atrial-fibrillation" target="_blank" rel="noreferrer">Открыть первоисточник<ExternalLink size={13} aria-hidden="true" /></a>
    </section>
  </div>;
}
