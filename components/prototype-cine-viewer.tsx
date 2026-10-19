"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Film, ImageIcon, Pause, Play, ShieldCheck, Video } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { prototypeImagingMedia, type PrototypeMediaAsset } from "@/lib/ui/prototype-media-bank";

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "00:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function modalityLabel(asset: PrototypeMediaAsset): string {
  return {
    echo: "ЭхоКГ",
    mri: "МРТ · динамика",
    angiography: "Коронарография",
    ct: "КТ",
    ecg: "ЭКГ",
    anatomy: "3D",
  }[asset.modality];
}

export function PrototypeCineViewer({ specialty }: { specialty: SpecialtyId }) {
  const bank = useMemo(() => prototypeImagingMedia(specialty), [specialty]);
  const firstRuntime = bank.find(asset => asset.availability === "runtime") ?? null;
  const [selectedBankId, setSelectedBankId] = useState<string | null>(firstRuntime?.id ?? bank[0]?.id ?? null);
  const [confirmed, setConfirmed] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [localFileName, setLocalFileName] = useState("");
  const [localKind, setLocalKind] = useState<"image" | "video" | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const selectedBank = bank.find(asset => asset.id === selectedBankId) ?? null;
  const mediaSrc = localUrl ?? selectedBank?.src ?? null;
  const mediaKind = localKind ?? selectedBank?.kind ?? null;
  const unavailableBankAsset = !localUrl && selectedBank?.availability === "registered_only";

  useEffect(() => () => {
    if (localUrl) URL.revokeObjectURL(localUrl);
  }, [localUrl]);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [mediaSrc]);

  function clearLocalPreview() {
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(null);
    setLocalFileName("");
    setLocalKind(null);
  }

  function selectBankAsset(id: string) {
    clearLocalPreview();
    setSelectedBankId(id);
  }

  function selectLocalMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !confirmed) return;

    if (localUrl) URL.revokeObjectURL(localUrl);
    const isVideo = /\.(mp4|webm|mov)$/iu.test(file.name) || file.type.startsWith("video/");
    const isImage = /\.(png|jpe?g|webp)$/iu.test(file.name) || file.type.startsWith("image/");
    if (!isVideo && !isImage) return;

    setLocalFileName(file.name);
    setLocalKind(isVideo ? "video" : "image");
    setLocalUrl(URL.createObjectURL(file));
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  function seek(value: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(duration)) return;
    video.currentTime = Math.min(Math.max(value, 0), duration);
    setCurrentTime(video.currentTime);
  }

  return <section className="cine-viewer-card" aria-labelledby="cine-viewer-title">
    <div className="image-reader-head">
      <div><span className="eyebrow">Медиабанк · прототип</span><h2 id="cine-viewer-title">Снимки и динамические серии</h2></div>
      <Film size={26} />
    </div>

    <div className="prototype-media-bank" aria-label="Медиа из прототипного банка">
      {bank.length === 0 && <div className="prototype-media-empty">Для этой специальности медиабанк пока не подключён.</div>}
      {bank.map(asset => <button
        key={asset.id}
        type="button"
        className={selectedBank?.id === asset.id && !localUrl ? "prototype-media-chip active" : "prototype-media-chip"}
        onClick={() => selectBankAsset(asset.id)}
      >
        {asset.kind === "video" ? <Video size={16} /> : <ImageIcon size={16} />}
        <span><strong>{modalityLabel(asset)}</strong><small>{asset.availability === "runtime" ? "доступно" : "файл ещё не подключён"}</small></span>
      </button>)}
    </div>

    <div className={mediaKind === "video" ? "cine-stage has-video" : "cine-stage"} data-media-treatment="diagnostic">
      {mediaSrc && mediaKind === "image" && <img src={mediaSrc} alt={localUrl ? `Локальный файл ${localFileName}` : selectedBank?.alt ?? ""} />}
      {mediaSrc && mediaKind === "video" && <video
        ref={videoRef}
        src={mediaSrc}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Динамическая серия медицинских изображений"
        onLoadedMetadata={event => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />}
      {!mediaSrc && <div className="cine-stage-empty"><Film size={38} /><strong>{unavailableBankAsset ? "Видео зарегистрировано в медиабанке" : "Выберите медиа"}</strong><span>{unavailableBankAsset ? "Файл пока не подключён к просмотру. Мы не заменяем его искусственной анимацией." : "Можно открыть доступный материал банка или локальный обезличенный файл."}</span></div>}

      {mediaSrc && <div className="cine-stage-label">
        <span>{localUrl ? "Локальный файл" : `${modalityLabel(selectedBank!)} · медиабанк`}</span>
        <small>{localUrl ? "не отправляется на сервер" : "права требуют проверки"}</small>
      </div>}

      {mediaSrc && mediaKind === "video" && <div className="cine-controls">
        <button type="button" onClick={() => void togglePlayback()} aria-label={playing ? "Пауза" : "Воспроизвести"}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
        <span>{formatTime(currentTime)}</span>
        <input type="range" min={0} max={duration || 0} step="0.01" value={Math.min(currentTime, duration || 0)} onChange={event => seek(Number(event.target.value))} aria-label="Позиция динамической серии" />
        <span>{formatTime(duration)}</span>
        <span className="cine-loop-label">ЦИКЛ</span>
      </div>}
    </div>

    <div className="cine-local-loader">
      <label className="viewer-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><ShieldCheck size={16} /><span>Только обезличенный или учебный файл</span></label>
      <label className={confirmed ? "secondary-button viewer-file" : "secondary-button viewer-file disabled"}>Проверить локальное видео или кадр<input type="file" disabled={!confirmed} accept="video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp,.mp4,.webm,.mov,.png,.jpg,.jpeg,.webp" onChange={selectLocalMedia} /></label>
      {localFileName && <button type="button" className="secondary-button" onClick={clearLocalPreview}>Вернуться к медиабанку</button>}
    </div>

    <p className="viewer-formats">Реальные КТ, МРТ, УЗИ, ангиография и ЭКГ не перекрашиваются палитрой продукта. Цвет используется только в интерфейсе вокруг диагностического изображения.</p>
  </section>;
}
