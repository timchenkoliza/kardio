"use client";

/* eslint-disable @next/next/no-img-element -- source and generated images are shown as-is for review */
import { useState, type ChangeEvent } from "react";
import { Loader2, Upload, Wand2 } from "lucide-react";
import type { RecraftResult, RecraftStatus } from "@/lib/recraft/contract";

export interface RecraftPair {
  contentId: string;
  title: string;
  source: string;
  grade: "STRONG" | "MEDIUM";
  image: { id: string; src: string; alt: string; credit: string; label: string };
}

interface Availability { vision: boolean; image: boolean; visionModel: string | null; imageModel: string | null }

const GRADE_LABEL: Record<RecraftPair["grade"], string> = { STRONG: "Сильное соответствие", MEDIUM: "Соответствие теме" };

const STATUS_COPY: Record<RecraftStatus, string> = {
  completed: "Перерисовка прошла сверку с источником",
  needs_source_verification: "Нужна сверка источника",
  replace_image: "Нужно другое изображение",
  do_not_use: "Изображение не подходит к статье",
  needs_deidentification: "Сначала обезличьте изображение",
  rejected_by_critic: "Перерисовка не прошла сверку с источником",
  unavailable: "Перерисовка недоступна",
  failed: "Перерисовка не выполнена",
};

const BINDING_LABEL: Record<string, string> = {
  disease: "заболевание", symptom: "симптом", risk: "фактор риска", context: "контекст", anatomy: "анатомия",
  diagnostic_finding: "диагностическая находка", intervention: "вмешательство", device_status: "устройство",
  mechanism: "механизм", no_code: "без кода", prompt_conflict: "конфликт источников",
};

const CONFIDENCE_LABEL: Record<string, string> = { high: "высокая", medium: "средняя", low: "низкая" };

type SourceImage = { id: string; src: string; mimeType: string; credit: string | null; caption: string };

async function toBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export function RecraftReview({ pairs, availability }: { pairs: RecraftPair[]; availability: Availability }) {
  const [selectedId, setSelectedId] = useState(pairs[0]?.contentId ?? "");
  const [upload, setUpload] = useState<SourceImage | null>(null);
  const [caption, setCaption] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RecraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pair = pairs.find(item => item.contentId === selectedId) ?? null;
  const source: SourceImage | null = upload ?? (pair ? { id: pair.image.id, src: pair.image.src, mimeType: "image/webp", credit: pair.image.credit, caption: pair.image.alt } : null);

  function select(contentId: string) {
    setSelectedId(contentId);
    setResult(null);
    setError(null);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !/^image\/(jpeg|png|webp)$/u.test(file.type)) return;
    if (upload) URL.revokeObjectURL(upload.src);
    setUpload({ id: `upload:${file.name}`, src: URL.createObjectURL(file), mimeType: file.type, credit: null, caption: "" });
    setResult(null);
  }

  async function run() {
    if (!pair || !source) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const blob = await (await fetch(source.src)).blob();
      const response = await fetch("/api/media/recraft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentId: pair.contentId,
          usage: "article_card",
          source: { id: source.id, mimeType: source.mimeType, base64: await toBase64(blob), credit: source.credit, caption: (upload ? caption : source.caption) || null },
        }),
      });
      const payload = await response.json() as { ok: boolean; result?: RecraftResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error === "editorial_only" ? "Доступно только редакции" : "Не удалось запустить перерисовку");
      setResult(payload.result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось запустить перерисовку");
    } finally {
      setRunning(false);
    }
  }

  if (!pairs.length) return <p className="ws-empty">Нет статей с подобранными изображениями.</p>;

  const ready = availability.vision && availability.image;

  return <div className="ws-recraft">
    {!ready && <p className="ws-recraft-note">{availability.vision
      ? "Модель перерисовки не подключена: доступна смысловая фиксация без генерации."
      : "Модели анализа и перерисовки изображений не подключены. Подключение: ANTHROPIC_API_KEY и OPENAI_API_KEY в окружении сервера."}</p>}

    <section className="ws-card-block" aria-labelledby="recraft-pairs">
      <h2 id="recraft-pairs" className="ws-section-title">Статья и изображение</h2>
      <label className="ws-field">
        <span>Статья</span>
        <select value={selectedId} onChange={event => select(event.target.value)}>
          {pairs.map(item => <option key={item.contentId} value={item.contentId}>{item.title}</option>)}
        </select>
      </label>
      {pair && <p className="ws-muted">{pair.source} · {pair.image.label} · {GRADE_LABEL[pair.grade]}</p>}
      <div className="ws-recraft-upload">
        <label className="ws-button is-quiet">
          <Upload size={14} aria-hidden="true" />{upload ? "Заменить оригинал" : "Загрузить свой оригинал"}
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} />
        </label>
        {upload && <button type="button" className="ws-button is-quiet" onClick={() => { URL.revokeObjectURL(upload.src); setUpload(null); setCaption(""); }}>Вернуть подобранное</button>}
      </div>
      {upload && <label className="ws-field"><span>Подпись к оригиналу</span><textarea rows={2} value={caption} onChange={event => setCaption(event.target.value)} /></label>}
      <button type="button" className="ws-button is-primary" disabled={!availability.vision || running} onClick={() => void run()}>
        {running ? <Loader2 size={15} className="ws-spin" aria-hidden="true" /> : <Wand2 size={15} aria-hidden="true" />}Перерисовать источник
      </button>
      {error && <p role="alert" className="ws-recraft-error">{error}</p>}
    </section>

    <ol className="ws-recraft-steps" aria-label="Этапы">
      <li className="ws-recraft-step">
        <h3><span>1</span>Оригинал</h3>
        {source && <figure>
          <img src={source.src} alt={pair?.image.alt ?? "Исходное изображение"} />
          <figcaption>{source.credit ?? "Загружено редакцией"}</figcaption>
        </figure>}
      </li>
      <li className="ws-recraft-step">
        <h3><span>2</span>Смысловая фиксация</h3>
        {result?.mapping ? <dl className="ws-recraft-facts">
          <div><dt>Тема</dt><dd>{result.mapping.clinicalTopic}</dd></div>
          <div><dt>Объект</dt><dd>{result.mapping.nosologyOrObject}</dd></div>
          <div><dt>МКБ-10</dt><dd>{result.mapping.icd10}</dd></div>
          <div><dt>Тип привязки</dt><dd>{BINDING_LABEL[result.mapping.bindingType] ?? result.mapping.bindingType}</dd></div>
          <div><dt>Уверенность</dt><dd>{CONFIDENCE_LABEL[result.mapping.confidence]}</dd></div>
          {result.match && <div><dt>Соответствие</dt><dd>{result.match.grade} · {result.match.reason}</dd></div>}
          {result.passport && <>
            <div><dt>Главный объект</dt><dd>{result.passport.primaryAnchor}</dd></div>
            <div><dt>Сохранить</dt><dd>{[...result.passport.mustPreserveStructures, ...result.passport.mustPreserveRelationships].join("; ")}</dd></div>
            {result.passport.mustNotInvent.length > 0 && <div><dt>Не добавлять</dt><dd>{result.passport.mustNotInvent.join("; ")}</dd></div>}
          </>}
        </dl> : <p className="ws-muted">{result ? "Не выполнена" : "Появится после запуска"}</p>}
      </li>
      <li className="ws-recraft-step">
        <h3><span>3</span>Перерисовка</h3>
        {result?.final ? <figure>
          <img src={`data:${result.final.mimeType};base64,${result.final.base64}`} alt={`Перерисовка: ${pair?.image.alt ?? ""}`} />
          <figcaption>{result.label}</figcaption>
        </figure> : result ? <div className="ws-recraft-status">
          <strong>{STATUS_COPY[result.status]}</strong>
          <p>{result.reason}</p>
        </div> : <p className="ws-muted">Появится после сверки с оригиналом</p>}
        {result && result.candidates.length > 0 && <details className="ws-recraft-candidates">
          <summary>Кандидаты · {result.candidates.length}</summary>
          <ul>{result.candidates.map(candidate => <li key={candidate.index}>
            <img src={`data:${candidate.mimeType};base64,${candidate.base64}`} alt={`Кандидат ${candidate.index + 1}`} />
            <span>{candidate.verdict.pass ? "Прошёл сверку" : candidate.verdict.failures.join("; ")}</span>
          </li>)}</ul>
        </details>}
      </li>
    </ol>
  </div>;
}
