"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowRight, FileText, Image as ImageIcon, MessageSquareText, Paperclip, Send, Sparkles, Stethoscope, UploadCloud, UsersRound } from "lucide-react";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { kindLabel, specialtyLabel } from "@/lib/ui/labels";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function WorkspaceCaseSurface({
  specialty,
  recent,
  contextTerms,
}: {
  specialty: SpecialtyId;
  recent: ContentObject[];
  contextTerms: string[];
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState("");
  const [summary, setSummary] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [files, setFiles] = useState<{ name: string; type: string; size: number }[]>([]);
  const [status, setStatus] = useState("");

  const terms = useMemo(() => {
    const fallback = specialty === "cardiology"
      ? ["Артериальная гипертензия", "Фибрилляция предсердий", "Липиды", "ИБС", "Клапаны", "Сердечная недостаточность"]
      : ["Диагностика", "Лекарственная терапия", "Лучевая терапия", "Хирургия", "Наблюдение"];
    return (contextTerms.length ? contextTerms : fallback).slice(0, 6);
  }, [contextTerms, specialty]);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    setStatus("");
    const selected = Array.from(event.target.files ?? []).slice(0, MAX_FILES);
    event.target.value = "";
    if (!selected.length) return;
    const oversized = selected.find(file => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setStatus(`«${oversized.name}» больше 25 МБ. Для прототипа выберите файл меньшего размера.`);
      return;
    }
    setFiles(selected.map(file => ({ name: file.name, type: file.type, size: file.size })));
  }

  function prepareContext() {
    if (!question.trim() && !summary.trim() && !files.length) {
      setStatus("Добавьте вопрос, краткую сводку или файл.");
      return;
    }
    setStatus("Контекст собран локально. Передача через анонимизатор будет подключена отдельным runtime-слоем; сейчас файлы не отправляются на сервер.");
  }

  return <section className="workspace-case-surface" aria-labelledby="workspace-case-title">
    <header className="workspace-case-header">
      <div>
        <span className="eyebrow">{specialtyLabel[specialty]}</span>
        <h1 id="workspace-case-title">Ваши материалы и контекст</h1>
        <p>Соберите материалы, добавьте контекст и продолжите работу над клинической задачей в одном рабочем пространстве.</p>
      </div>
    </header>

    <div className="workspace-case-chips" aria-label="Профессиональный контекст">
      {terms.map(term => <span key={term}><Sparkles size={12} aria-hidden="true" />{term}</span>)}
    </div>

    <div className="workspace-case-grid">
      <div className="workspace-case-main">
        <section className="workspace-case-composer" aria-label="Клинический контекст">
          <textarea
            value={question}
            onChange={event => setQuestion(event.target.value)}
            placeholder="Задайте вопрос или опишите клиническую задачу…"
            maxLength={1600}
            aria-label="Вопрос или клиническая задача"
          />
          <div className="workspace-case-composer-actions">
            <button type="button" className="workspace-case-file-trigger" onClick={() => fileInput.current?.click()}>
              <Paperclip size={16} aria-hidden="true" />
              Добавить файлы (PDF, DICOM, изображения)
            </button>
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              multiple
              accept=".pdf,.dcm,.dicom,application/pdf,application/dicom,image/*"
              onChange={selectFiles}
            />
            <button type="button" className="workspace-case-send" aria-label="Подготовить контекст" onClick={prepareContext}>
              <Send size={18} aria-hidden="true" />
            </button>
          </div>
          {files.length > 0 && <div className="workspace-case-files" aria-label="Выбранные файлы">
            {files.map(file => <span key={`${file.name}:${file.size}`}>{file.type.startsWith("image/") ? <ImageIcon size={13} /> : <FileText size={13} />}{file.name}</span>)}
          </div>}
          {status && <p className="workspace-case-status" role="status">{status}</p>}
        </section>

        <section className="workspace-summary-card">
          <div className="workspace-summary-icon"><Sparkles size={19} aria-hidden="true" /></div>
          <div>
            <strong>Добавить сводку</strong>
            <p>Кратко опишите пациента, ключевые данные и ваш вопрос. Это помогает собрать рабочий контекст до подключения анонимизатора.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setShowSummary(value => !value)}>{showSummary ? "Скрыть" : "Добавить сводку"}</button>
          {showSummary && <textarea value={summary} onChange={event => setSummary(event.target.value)} placeholder="Обезличенная клиническая сводка…" maxLength={3000} aria-label="Обезличенная клиническая сводка" />}
        </section>

        <section className="workspace-recent-materials" aria-labelledby="workspace-recent-title">
          <div className="workspace-case-section-head"><h2 id="workspace-recent-title">Ваши последние материалы</h2><Link href={`/${specialty}?view=saved&shell=workspace`}>Все материалы <ArrowRight size={14} /></Link></div>
          {recent.length ? <div className="workspace-recent-list">
            {recent.slice(0, 5).map(item => <Link key={item.id} href={`/${specialty}/content/${encodeURIComponent(item.id)}?shell=workspace`}>
              <span className="workspace-recent-icon"><FileText size={16} /></span>
              <span><strong>{item.title}</strong><small>{item.source.name} · {kindLabel[item.kind]}</small></span>
              <span className="workspace-recent-date">{item.publicationDate ?? item.publicationYear ?? ""}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>)}
          </div> : <div className="workspace-recent-empty">Здесь появятся сохранённые и недавно открытые материалы.</div>}
        </section>
      </div>

      <aside className="workspace-case-rail" aria-label="Кем обсудить">
        <div className="workspace-case-rail-title"><UsersRound size={20} aria-hidden="true" /><div><h2>Кем обсудить</h2><p>Подбор маршрута по вашей теме и профессиональному сообществу.</p></div></div>
        <Link href={`/${specialty}?view=consilium&shell=workspace`}><Stethoscope size={17} /><span><strong>Клинические случаи</strong><small>Эксперты и коллеги</small></span><ArrowRight size={15} /></Link>
        <Link href={`/${specialty}?kind=article&shell=workspace`}><MessageSquareText size={17} /><span><strong>Обсудить исследования</strong><small>Мнения и интерпретации</small></span><ArrowRight size={15} /></Link>
        <Link href={`/${specialty}?view=consilium&shell=workspace`}><UploadCloud size={17} /><span><strong>Сложные решения</strong><small>Мультидисциплинарный взгляд</small></span><ArrowRight size={15} /></Link>
        <Link className="workspace-community-button" href={`/${specialty}?view=consilium&shell=workspace`}>Перейти к консилиуму</Link>
      </aside>
    </div>
  </section>;
}
