"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Check, ExternalLink, HeartPulse, ImageIcon, Layers3, ScanLine, ShieldCheck } from "lucide-react";
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
      <p>Два демонстрационных справочных инструмента. Расчёт выполняется локально в браузере; введённые значения не отправляются на сервер.</p>
    </header>

    <div className="calculator-grid">
      <section className="calculator-card calculator-card-primary" aria-labelledby="cha-title">
        <div className="calculator-card-head"><div><span className="eyebrow">Фибрилляция предсердий</span><h2 id="cha-title">CHA₂DS₂-VA</h2></div><div className="score-orb"><strong>{chaScore}</strong><span>баллов</span></div></div>
        <p className="calculator-lead">Справочная оценка риска инсульта и тромбоэмболии при ФП по шкале ESC 2024.</p>
        <label className="tool-age"><span>Возраст</span><input type="number" min={18} max={110} value={age} onChange={event => setAge(Number(event.target.value) || 0)} /></label>
        <div className="tool-check-grid">
          <Toggle checked={cha.heartFailure} onChange={value => setCha(current => ({ ...current, heartFailure: value }))}>Сердечная недостаточность</Toggle>
          <Toggle checked={cha.hypertension} onChange={value => setCha(current => ({ ...current, hypertension: value }))}>Артериальная гипертензия</Toggle>
          <Toggle checked={cha.diabetes} onChange={value => setCha(current => ({ ...current, diabetes: value }))}>Сахарный диабет</Toggle>
          <Toggle checked={cha.strokeTiaEmbolism} onChange={value => setCha(current => ({ ...current, strokeTiaEmbolism: value }))}>Инсульт / ТИА / эмболия</Toggle>
          <Toggle checked={cha.vascularDisease} onChange={value => setCha(current => ({ ...current, vascularDisease: value }))}>Сосудистое заболевание</Toggle>
        </div>
        <div className="calculator-result"><strong>{cha2Ds2VaLabel(chaScore)}</strong><span>ESC 2024 использует 1 балл как порог для рассмотрения антикоагуляции, а ≥2 — как порог рекомендации в руководстве. Расчёт не заменяет оценку полного клинического контекста.</span></div>
        <a className="tool-source-link" href="https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/atrial-fibrillation" target="_blank" rel="noreferrer">Первоисточник · ESC 2024 <ExternalLink size={14} /></a>
      </section>

      <section className="calculator-card" aria-labelledby="has-title">
        <div className="calculator-card-head"><div><span className="eyebrow">Антикоагуляция</span><h2 id="has-title">HAS-BLED</h2></div><div className="score-orb secondary"><strong>{hasScore}</strong><span>баллов</span></div></div>
        <p className="calculator-lead">Факторы риска кровотечения при ФП. Сам по себе высокий балл не является основанием для автоматической отмены антикоагуляции.</p>
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
        <div className="calculator-result"><strong>{hasBledLabel(hasScore)}</strong><span>При значении ≥3 руководство акцентирует коррекцию модифицируемых факторов и более частый пересмотр риска. Интерпретация требует клинического контекста.</span></div>
        <a className="tool-source-link" href="https://www.escardio.org/static-file/Escardio/Guidelines/Documents/ehaa612.pdf" target="_blank" rel="noreferrer">Первоисточник · ESC AF <ExternalLink size={14} /></a>
      </section>
    </div>

    <p className="tools-footnote">Справочные инструменты для врача. Результат шкалы не является диагнозом или персональным назначением; сверяйтесь с первоисточником и клиническим контекстом.</p>
  </div>;
}

function OncologyExternalTools() {
  const tools = curatedSourcesForSpecialty("oncology").filter(source => source.category === "Калькуляторы");
  return <div className="tools-hub">
    <header className="tools-intro"><span className="eyebrow">Онкология</span><h1>Калькуляторы</h1><p>Внешние инструменты из собранного реестра. Формулы не копируются в продукт, а методология каждого расчёта проверяется в первоисточнике.</p></header>
    <div className="external-tool-grid">{tools.map(tool => <a key={tool.id} href={tool.url} target="_blank" rel="noreferrer" className="external-tool-card"><span>{tool.category}</span><strong>{tool.name}</strong><p>{tool.note}</p><ExternalLink size={18} /></a>)}</div>
    <p className="tools-footnote">Эти внешние калькуляторы не используются продуктом для персонального прогноза, выбора терапии или автоматического клинического решения.</p>
  </div>;
}

export function ImagingWorkspace({ specialty }: { specialty: SpecialtyId }) {
  const [confirmed, setConfirmed] = useState(false);
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inobitec = useMemo(() => curatedSourcesForSpecialty(specialty).find(source => source.id === "inobitec"), [specialty]);
  const isCardiology = specialty === "cardiology";

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !confirmed) return;

    setFileName(file.name);
    const lower = file.name.toLowerCase();
    const detectedFormat = lower.endsWith(".nii.gz")
      ? "NIfTI"
      : lower.endsWith(".dcm") || lower.endsWith(".dicom")
        ? "DICOM"
        : lower.split(".").pop()?.toUpperCase() ?? "FILE";
    setFormat(detectedFormat);

    const browserPreview = /\.(png|jpe?g|webp)$/i.test(file.name);
    setPreviewUrl(browserPreview ? URL.createObjectURL(file) : null);
  }

  return <div className="imaging-hub">
    <header className="tools-intro"><span className="eyebrow">{isCardiology ? "Кардиология" : "Онкология"}</span><h1>Визуализация</h1><p>{isCardiology ? "Локальный просмотр обезличенных или учебных изображений и подготовленное место для будущей 3D-анатомии сердца." : "Локальный просмотр обезличенных или учебных изображений и подготовленное место для будущей 3D-реконструкции и сегментации."}</p></header>

    <div className="imaging-grid">
      <section className="heart-3d-card heart-3d-cold-start">
        <div className="heart-3d-copy"><div className="visual-icon">{isCardiology ? <HeartPulse size={24} /> : <Layers3 size={24} />}</div><span className="eyebrow">3D · пока без модели</span><h2>{isCardiology ? "Анатомия сердца" : "3D и сегментация"}</h2><p>{isCardiology ? "Интерактивная модель пока не подключена. Без лицензированного или собственного 3D-ресурса мы не имитируем работающий просмотрщик." : "Объёмная реконструкция и сегментация пока не подключены. Без специализированного рендерера и проверенного учебного набора мы не имитируем диагностическую функцию."}</p><div className="layer-chips planned-layers" aria-label="Планируемые слои">{isCardiology ? <><span>Миокард</span><span>Камеры</span><span>Клапаны</span><span>Коронарные артерии</span></> : <><span>КТ / МРТ</span><span>Серии</span><span>Контуры</span><span>3D-реконструкция</span></>}</div></div>
        <div className="heart-stage" aria-label={isCardiology ? "3D-модель сердца пока не подключена" : "3D-реконструкция пока не подключена"}><div className="heart-stage-orbit orbit-one" /><div className="heart-stage-orbit orbit-two" /><div className="heart-volume">{isCardiology ? <HeartPulse size={72} /> : <Layers3 size={72} />}</div><span><Layers3 size={15} /> {isCardiology ? "3D-модель пока не подключена" : "3D-реконструкция пока не подключена"}</span></div>
      </section>

      <section className="image-reader-card">
        <div className="image-reader-head"><div><span className="eyebrow">Локально в браузере</span><h2>Просмотр изображения</h2></div><ScanLine size={26} /></div>
        <div className="image-reader-viewports local-preview-grid">
          <div className={previewUrl ? "local-preview has-preview" : "local-preview"} style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}><span>{previewUrl ? "PREVIEW" : "LOCAL"}</span>{!previewUrl && <ImageIcon size={30} />}</div>
          <div className="local-format-state"><span>FORMAT</span><strong>{format || "—"}</strong><small>{fileName ? (previewUrl ? "Предпросмотр готов" : "Файл выбран; рендерер формата не подключён") : "Выберите обезличенный или учебный файл"}</small></div>
        </div>
        <div className="image-reader-controls"><label className="viewer-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><ShieldCheck size={16} /><span>Только обезличенный или учебный файл</span></label><label className={confirmed ? "secondary-button viewer-file" : "secondary-button viewer-file disabled"}>Выбрать локальный файл<input type="file" disabled={!confirmed} accept=".dcm,.dicom,.nii,.nii.gz,.nrrd,.mha,.mhd,.png,.jpg,.jpeg,.webp,.pdf" onChange={selectImage} /></label>{fileName && <div className="viewer-file-state"><strong>{fileName}</strong><span>{format} · локально, без отправки{previewUrl ? " · предпросмотр готов" : " · визуальный рендерер пока не подключён"}</span></div>}</div>
        <div className="viewer-formats">Встроенный предпросмотр: PNG · JPEG · WebP. DICOM · NIfTI · NRRD · MHA/MHD · PDF можно выбрать локально, но специализированный рендерер в прототип пока не встроен.</div>
        {inobitec && <a className="tool-source-link" href={inobitec.url} target="_blank" rel="noreferrer">Референс · {inobitec.name} <ExternalLink size={14} /></a>}
      </section>
    </div>
    <p className="tools-footnote">Просмотрщик не интерпретирует снимок и не выдаёт диагностическое заключение. Для DICOM/NIfTI и других специализированных форматов требуется отдельный медицинский рендерер.</p>
  </div>;
}
