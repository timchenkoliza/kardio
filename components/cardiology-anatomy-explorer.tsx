"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { Layers3, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { approvedAnatomyMedia } from "@/lib/ui/approved-medical-media";

const cardiologyLayers = [
  { id: "myocardium", label: "Миокард", note: "Мышечная стенка и общая анатомия сердца" },
  { id: "chambers", label: "Камеры", note: "Предсердия и желудочки" },
  { id: "valves", label: "Клапаны", note: "Митральный, аортальный, трикуспидальный и клапан лёгочной артерии" },
  { id: "coronary", label: "Коронарные артерии", note: "Учебная навигация по коронарной анатомии" },
] as const;

export function CardiologyAnatomyExplorer({ specialty }: { specialty: SpecialtyId }) {
  const anatomy = useMemo(() => approvedAnatomyMedia(specialty), [specialty]);
  const [layer, setLayer] = useState<(typeof cardiologyLayers)[number]["id"]>("myocardium");
  const [rotation, setRotation] = useState(-7);
  const [zoom, setZoom] = useState(1);

  if (!anatomy) return null;
  const active = cardiologyLayers.find(item => item.id === layer) ?? cardiologyLayers[0];

  return <section className="anatomy-explorer" aria-labelledby="anatomy-explorer-title">
    <div className="anatomy-explorer-copy">
      <div className="visual-icon"><Layers3 size={22} /></div>
      <span className="eyebrow">Интерактивная анатомия · учебная модель</span>
      <h2 id="anatomy-explorer-title">Сердце</h2>
      <p>Изучайте анатомию по слоям и меняйте ракурс. Это учебная визуализация, а не диагностический 3D-реконструктор.</p>
      <div className="anatomy-layer-list" role="tablist" aria-label="Анатомические слои">
        {cardiologyLayers.map(item => <button key={item.id} type="button" role="tab" aria-selected={layer === item.id} className={layer === item.id ? "active" : ""} onClick={() => setLayer(item.id)}>{item.label}</button>)}
      </div>
      <div className="anatomy-layer-note"><strong>{active.label}</strong><span>{active.note}</span></div>
      <a className="anatomy-credit" href={anatomy.sourceUrl} target="_blank" rel="noreferrer">{anatomy.credit}</a>
    </div>

    <div className="anatomy-stage" data-layer={layer}>
      <div className="anatomy-glow" aria-hidden="true" />
      <img
        src={anatomy.src}
        alt={anatomy.alt}
        style={{ transform: `perspective(900px) rotateY(${rotation}deg) scale(${zoom})` }}
        decoding="async"
      />
      <div className="anatomy-stage-label"><span>{active.label}</span><small>учебная симуляция</small></div>
      <div className="anatomy-controls" aria-label="Управление анатомической моделью">
        <button type="button" onClick={() => setRotation(value => Math.max(-35, value - 7))} aria-label="Повернуть влево"><RotateCcw size={16} /></button>
        <button type="button" onClick={() => setRotation(value => Math.min(35, value + 7))} aria-label="Повернуть вправо"><RotateCw size={16} /></button>
        <button type="button" onClick={() => setZoom(value => Math.min(1.25, Number((value + 0.08).toFixed(2))))} aria-label="Приблизить"><ZoomIn size={16} /></button>
        <button type="button" onClick={() => setZoom(value => Math.max(0.82, Number((value - 0.08).toFixed(2))))} aria-label="Отдалить"><ZoomOut size={16} /></button>
        <button type="button" onClick={() => { setRotation(-7); setZoom(1); setLayer("myocardium"); }}>Сбросить</button>
      </div>
    </div>
  </section>;
}
