"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { Box, Check, ExternalLink, HeartPulse, ImageIcon, Layers3, ScanLine, ShieldCheck } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { cha2Ds2VaLabel, hasBledLabel, scoreCha2Ds2Va, scoreHasBled } from "@/lib/ui/clinical-calculators";
import { curatedSourcesForSpecialty } from "@/lib/ui/curated-external-tools";

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return <label className={checked ? "tool-check selected" : "tool-check"}><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span className="tool-check-mark">{checked && <Check size={14} />}</span><span>{children}</span></label>;
}

export function ClinicalToolsHub({ specialty }: { specialty: SpecialtyId }) {
  if (specialty === "oncology") return <OncologyExternalTools />;
  return <CardiologyCalculators />;
}

function CardiologyCalculators() {
  const [age, setAge] = useState(65);
  const [cha, setCha] = useState({ heartFailure: false, hypertension: true, diabetes: false, strokeTiaEmbolism: false, vascularDisease: false });
  const [has, setHas] = useState({ hypertension: false, abnormalRenal: false, abnormalLiver: false, stroke: false, bleedingHistory: false, labileInr: false, ageOver65: false, drugs: false, alcohol: false });
  const chaScore = scoreCha2Ds2Va({ ...cha, age });
  const hasScore = scoreHasBled(has);

  return <div className="tools-hub">
    <header className="tools-intro">
      <span className="eyebrow">Кардиология</span>
      <h1>Калькуляторы</h1>
      <p>Два рабочих инструмента для демо. Расчёт выполняется локально в браузере.</p>
    </header>

    <div className="calculator-grid">
      <section className="calculator-card calculator-card-primary" aria-labelledby="cha-title">
        <div className="calculator-card-head"><div><span className="eyebrow">Фибрилляция предсердий</span><h2 id="cha-title">CHA₂DS₂-VA</h2></div><div className="score-orb"><strong>{chaScore}</strong><span>баллов</span></div></div>
        <p className="calculator-lead">Риск инсульта и тромбоэмболии при ФП по шкале ESC 2024.</p>
        <label className="tool-age"><span>Возраст</span><input type="number" min={18} max={110} value={age} onChange={event => setAge(Number(event.target.value) || 0)} /></label>
        <div className="tool-check-grid">
          <Toggle checked={cha.heartFailure} onChange={value => setCha(current => ({ ...current, heartFailure: value }))}>Сердечная недостаточность</Toggle>
          <Toggle checked={cha.hypertension} onChange={value => setCha(current => ({ ...current, hypertension: value }))}>Артериальная гипертензия</Toggle>
          <Toggle checked={cha.diabetes} onChange={value => setCha(current => ({ ...current, diabetes: value }))}>Сахарный диабет</Toggle>
          <Toggle checked={cha.strokeTiaEmbolism} onChange={value => setCha(current => ({ ...current, strokeTiaEmbolism: value }))}>Инсульт / ТИА / эмболия</Toggle>
          <Toggle checked={cha.vascularDisease} onChange={value => setCha(current => ({ ...current, vascularDisease: value }))}>Сосудистое заболевание</Toggle>
        </div>
        <div className="calculator-result"><strong>{cha2Ds2VaLabel(chaScore)}</strong><span>ESC 2024: при 1 балле антикоагуляция рассматривается; при ≥2 рекомендована для подходящих пациентов.</span></div>
        <a className="tool-source-link" href="https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/atrial-fibrillation" target="_blank" rel="noreferrer">Источник · ESC 2024 <ExternalLink size={14} /></a>
      </section>

      <section className="calculator-card" aria-labelledby="has-title">
        <div className="calculator-card-head"><div><span className="eyebrow">Антикоагуляция</span><h2 id="has-title">HAS-BLED</h2></div><div className="score-orb secondary"><strong>{hasScore}</strong><span>баллов</span></div></div>
        <p className="calculator-lead">Факторы риска кровотечения при ФП. Высокий балл не используется сам по себе для отмены антикоагуляции.</p>
        <div className="tool-check-grid compact">
          <Toggle checked={has.hypertension} onChange={value => setHas(current => ({ ...current, hypertension: value }))}>САД &gt;160 мм рт. ст.</Toggle>
          <Toggle checked={has.abnormalRenal} onChange={value => setHas(current => ({ ...current, abnormalRenal: value }))}>Нарушение функции почек</Toggle>
          <Toggle checked={has.abnormalLiver} onChange={value => setHas(current => ({ ...current, abnormalLiver: value }))}>Нарушение функции печени</Toggle>
          <Toggle checked={has.stroke} onChange={value => setHas(current => ({ ...current, stroke: value }))}>Инсульт в анамнезе</Toggle>
          <Toggle checked={has.bleedingHistory} onChange={value => setHas(current => ({ ...current, bleedingHistory: value }))}>Кровотечение / предрасположенность</Toggle>
          <Toggle checked={has.labileInr} onChange={value => setHas(current => ({ ...current, labileInr: value }))}>Лабильное МНО</Toggle>
          <Toggle checked={has.ageOver65} onChange={value => setHas(current => ({ ...current, ageOver65: value }))}>Возраст &gt;65 лет</Toggle>
          <Toggle checked={has.drugs} onChange={value => setHas(current => ({ ...current, drugs: value }))}>Аспирин / НПВП и др.</Toggle>
          <Toggle checked={has.alcohol} onChange={value => setHas(current => ({ ...current, alcohol: value }))}>Избыточное употребление алкоголя</Toggle>
        </div>
        <div className="calculator-result"><strong>{hasBledLabel(hasScore)}</strong><span>При ≥3 важны коррекция модифицируемых факторов и более частый пересмотр.</span></div>
        <a className="tool-source-link" href="https://www.escardio.org/static-file/Escardio/Guidelines/Documents/ehaa612.pdf" target="_blank" rel="noreferrer">Источник · ESC AF <ExternalLink size={14} /></a>
      </section>
    </div>

    <p className="tools-footnote">Справочные инструменты для врача. Результат шкалы не заменяет клиническую оценку и первоисточник.</p>
  </div>;
}

function OncologyExternalTools() {
  const tools = curatedSourcesForSpecialty("oncology").filter(source => source.category === "Калькуляторы");
  return <div className="tools-hub">
    <header className="tools-intro"><span className="eyebrow">Онкология</span><h1>Калькуляторы</h1><p>Внешние инструменты из собранного реестра. Собственные формулы не синтезируем.</p></header>
    <div className="external-tool-grid">{tools.map(tool => <a key={tool.id} href={tool.url} target="_blank" rel="noreferrer" className="external-tool-card"><span>{tool.category}</span><strong>{tool.name}</strong><p>{tool.note}</p><ExternalLink size={18} /></a>)}</div>
  </div>;
}

export function ImagingWorkspace({ specialty }: { specialty: SpecialtyId }) {
  const [activeLayers, setActiveLayers] = useState<string[]>(["Миокард"]);
  const [confirmed, setConfirmed] = useState(false);
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState("");
  const inobitec = useMemo(() => curatedSourcesForSpecialty(specialty).find(source => source.id === "inobitec"), [specialty]);

  function toggleLayer(layer: string) {
    setActiveLayers(current => current.includes(layer) ? current.filter(item => item !== layer) : [...current, layer]);
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !confirmed) return;
    setFileName(file.name);
    const lower = file.name.toLowerCase();
    setFormat(lower.endsWith(".nii.gz") ? "NIfTI" : lower.split(".").pop()?.toUpperCase() ?? "FILE");
  }

  return <div className="imaging-hub">
    <header className="tools-intro"><span className="eyebrow">{specialty === "cardiology" ? "Кардиология" : "Онкология"}</span><h1>Визуализация</h1><p>3D-анатомия и локальный просмотр обезличенных или учебных изображений.</p></header>

    <div className="imaging-grid">
      <section className="heart-3d-card">
        <div className="heart-3d-copy"><div className="visual-icon"><HeartPulse size={24} /></div><span className="eyebrow">3D</span><h2>Сердце</h2><p>Место для интерактивной модели: камеры, клапаны, коронарные артерии и слои.</p><div className="layer-chips">{["Миокард", "Камеры", "Клапаны", "Коронарные артерии"].map(layer => <button key={layer} type="button" className={activeLayers.includes(layer) ? "active" : ""} onClick={() => toggleLayer(layer)}>{layer}</button>)}</div></div>
        <div className="heart-stage" aria-label="Область 3D-визуализации сердца"><div className="heart-stage-orbit orbit-one" /><div className="heart-stage-orbit orbit-two" /><div className="heart-volume"><HeartPulse size={72} /></div><span><Box size={15} /> 3D viewer slot</span></div>
      </section>

      <section className="image-reader-card">
        <div className="image-reader-head"><div><span className="eyebrow">Снимки</span><h2>Чтение изображений</h2></div><ScanLine size={26} /></div>
        <div className="image-reader-viewports"><div><span>AXIAL</span><ImageIcon size={28} /></div><div><span>CORONAL</span><ImageIcon size={28} /></div><div><span>SAGITTAL</span><ImageIcon size={28} /></div><div><span>3D</span><Layers3 size={28} /></div></div>
        <div className="image-reader-controls"><label className="viewer-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><ShieldCheck size={16} /><span>Только обезличенный или учебный файл</span></label><label className={confirmed ? "secondary-button viewer-file" : "secondary-button viewer-file disabled"}>Выбрать снимок<input type="file" disabled={!confirmed} accept=".dcm,.dicom,.nii,.nii.gz,.nrrd,.mha,.mhd,.png,.jpg,.jpeg,.tif,.tiff,.webp,.pdf" onChange={selectImage} /></label>{fileName && <div className="viewer-file-state"><strong>{fileName}</strong><span>{format} · локально, без отправки</span></div>}</div>
        <div className="viewer-formats">DICOM · NIfTI · NRRD · MHA/MHD · PNG/JPEG/TIFF/WebP · PDF</div>
        {inobitec && <a className="tool-source-link" href={inobitec.url} target="_blank" rel="noreferrer">Референс · {inobitec.name} <ExternalLink size={14} /></a>}
      </section>
    </div>
  </div>;
}
