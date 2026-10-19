"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState, type ChangeEvent } from "react";
import { ExternalLink, Image as ImageIcon, ShieldCheck, UploadCloud } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { approvedImagingMedia, type ApprovedMedicalMediaAsset } from "@/lib/ui/approved-medical-media";

export function ProductionMedicalMediaViewer({ specialty }: { specialty: SpecialtyId }) {
  const media = useMemo(() => approvedImagingMedia(specialty).filter(asset => asset.modality !== "anatomy"), [specialty]);
  const [selectedId, setSelectedId] = useState(media[0]?.id ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [localName, setLocalName] = useState("");

  const selected = media.find(asset => asset.id === selectedId) ?? media[0] ?? null;

  function selectAsset(asset: ApprovedMedicalMediaAsset) {
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(null);
    setLocalName("");
    setSelectedId(asset.id);
  }

  function selectLocalMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !confirmed) return;
    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif)$/iu.test(file.name)) return;
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(URL.createObjectURL(file));
    setLocalName(file.name);
  }

  function clearLocalMedia() {
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(null);
    setLocalName("");
  }

  return <section className="production-media-viewer" aria-labelledby="production-media-title">
    <header className="production-media-head">
      <div>
        <span className="eyebrow">Учебный медиабанк</span>
        <h2 id="production-media-title">Снимки и динамические серии</h2>
        <p>Открытые учебные изображения и локальный просмотр обезличенных кадров. Диагностическая интерпретация не выполняется.</p>
      </div>
      <ImageIcon size={24} aria-hidden="true" />
    </header>

    {media.length > 0 ? <>
      <div className="production-media-tabs" role="tablist" aria-label="Тип исследования">
        {media.map(asset => <button key={asset.id} type="button" role="tab" aria-selected={!localUrl && selected?.id === asset.id} className={!localUrl && selected?.id === asset.id ? "active" : ""} onClick={() => selectAsset(asset)}>{asset.compactLabel}</button>)}
      </div>

      <div className="production-media-stage" data-media-treatment="diagnostic">
        <img src={localUrl ?? selected?.src ?? ""} alt={localUrl ? `Локальный обезличенный файл ${localName}` : selected?.alt ?? ""} />
        <div className="production-media-stage-meta">
          <div><strong>{localUrl ? localName : selected?.compactLabel}</strong><span>{localUrl ? "локальный файл · не отправляется на сервер" : "учебный материал · исходная цветопередача"}</span></div>
          {!localUrl && selected && <a href={selected.sourceUrl} target="_blank" rel="noreferrer" aria-label="Открыть источник изображения"><ExternalLink size={16} /></a>}
        </div>
      </div>

      {!localUrl && selected && <p className="production-media-credit">{selected.credit} · {selected.license}</p>}
    </> : <div className="production-media-empty">Для этой специальности учебный медиабанк пока не подключён.</div>}

    <div className="production-media-local">
      <label className="viewer-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><ShieldCheck size={16} /><span>Только обезличенный или учебный файл</span></label>
      <label className={confirmed ? "secondary-button production-media-upload" : "secondary-button production-media-upload disabled"}><UploadCloud size={15} /> Открыть локальный кадр<input type="file" disabled={!confirmed} accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif" onChange={selectLocalMedia} /></label>
      {localUrl && <button type="button" className="secondary-button" onClick={clearLocalMedia}>Вернуться к медиабанку</button>}
    </div>
  </section>;
}
