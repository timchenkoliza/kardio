"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowRight, FileText, Image as ImageIcon, MessageSquareText, Paperclip, Send, Sparkles, Stethoscope, UploadCloud, UsersRound } from "lucide-react";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { kindLabel, specialtyLabel } from "@/lib/ui/labels";
import { attachmentKind, isLocallyReadableClinicalFile, redactDirectIdentifiers } from "@/lib/clinical-case/anonymizer";
import { listLocalClinicalCases, saveLocalClinicalCase } from "@/lib/clinical-case/local-case-db";
import type { CaseAnonymizationStatus, CaseAttachmentRecord, ClinicalCase } from "@/lib/clinical-case/types";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function statusLabel(status: CaseAnonymizationStatus): string {
  if (status === "clean") return "обезличено локально";
  if (status === "needs_review") return "нужна проверка";
  return "нужен анонимизатор";
}

function safeCaseId(): string {
  return `case-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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
  const [files, setFiles] = useState<CaseAttachmentRecord[]>([]);
  const [cases, setCases] = useState<ClinicalCase[]>([]);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  const terms = useMemo(() => {
    const fallback = specialty === "cardiology"
      ? ["Артериальная гипертензия", "Фибрилляция предсердий", "Липиды", "ИБС", "Клапаны", "Сердечная недостаточность"]
      : ["Диагностика", "Лекарственная терапия", "Лучевая терапия", "Хирургия", "Наблюдение"];
    return (contextTerms.length ? contextTerms : fallback).slice(0, 6);
  }, [contextTerms, specialty]);

  useEffect(() => {
    let cancelled = false;
    void listLocalClinicalCases()
      .then(values => {
        if (!cancelled) setCases(values.filter(item => item.specialty === specialty));
      })
      .catch(() => {
        if (!cancelled) setStatus("Локальная база клинических кейсов недоступна в этом браузере.");
      });
    return () => { cancelled = true; };
  }, [specialty]);

  async function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    setStatus("");
    const selected = Array.from(event.target.files ?? []).slice(0, MAX_FILES);
    event.target.value = "";
    if (!selected.length) return;
    const oversized = selected.find(file => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setStatus("Один из файлов больше 25 МБ. Для прототипа выберите файл меньшего размера.");
      return;
    }

    const prepared: CaseAttachmentRecord[] = [];
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      const kind = attachmentKind(file);
      if (isLocallyReadableClinicalFile(file)) {
        const text = (await file.text()).slice(0, 60_000);
        const redaction = redactDirectIdentifiers(text);
        prepared.push({
          id: `attachment-${Date.now()}-${index}`,
          kind,
          displayName: `Текстовый документ ${index + 1}`,
          mimeType: file.type || "text/plain",
          size: file.size,
          anonymizationStatus: redaction.status,
          redactedText: redaction.redactedText,
          detectedMarkers: redaction.detectedMarkers,
        });
      } else {
        prepared.push({
          id: `attachment-${Date.now()}-${index}`,
          kind,
          displayName: kind === "pdf" ? `PDF ${index + 1}` : kind === "dicom" ? `DICOM ${index + 1}` : kind === "image" ? `Изображение ${index + 1}` : `Документ ${index + 1}`,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          anonymizationStatus: "runtime_required",
          detectedMarkers: [],
        });
      }
    }

    setFiles(prepared);
    const runtimeCount = prepared.filter(item => item.anonymizationStatus === "runtime_required").length;
    const reviewCount = prepared.filter(item => item.anonymizationStatus === "needs_review").length;
    if (runtimeCount) {
      setStatus(`${runtimeCount} файл(а) помещены в локальный карантин: PDF/DICOM/изображения требуют отдельного анонимизатора и не сохраняются как исходники.`);
    } else if (reviewCount) {
      setStatus("Прямые идентификаторы удалены локально, но часть текста требует ручной проверки перед сохранением кейса.");
    } else {
      setStatus("Текстовые данные прошли локальный de-identification preflight. Исходный файл не сохраняется.");
    }
  }

  async function saveCase() {
    if (!question.trim() && !summary.trim() && !files.length) {
      setStatus("Добавьте вопрос, клиническую сводку или файл.");
      return;
    }
    setSaving(true);
    try {
      const redactedQuestion = redactDirectIdentifiers(question.trim());
      const redactedSummary = redactDirectIdentifiers(summary.trim());
      const allStatuses = [redactedQuestion.status, redactedSummary.status, ...files.map(file => file.anonymizationStatus)];
      const anonymizationStatus: CaseAnonymizationStatus = allStatuses.includes("runtime_required")
        ? "runtime_required"
        : allStatuses.includes("needs_review")
          ? "needs_review"
          : "clean";
      const now = new Date().toISOString();
      const clinicalCase: ClinicalCase = {
        id: safeCaseId(),
        specialty,
        title: redactedQuestion.redactedText.slice(0, 96) || redactedSummary.redactedText.slice(0, 96) || `Клинический кейс ${new Date().toLocaleDateString("ru-RU")}`,
        question: redactedQuestion.redactedText,
        summary: redactedSummary.redactedText,
        createdAt: now,
        updatedAt: now,
        attachments: files,
        anonymizationStatus,
        source: "local_workspace",
      };
      await saveLocalClinicalCase(clinicalCase);
      setCases(current => [clinicalCase, ...current]);
      setActiveCaseId(clinicalCase.id);
      setStatus(anonymizationStatus === "clean"
        ? "Кейс сохранён в локальной базе браузера без исходных файлов и готов для продолжения работы."
        : anonymizationStatus === "needs_review"
          ? "Кейс сохранён локально, но перед профессиональным использованием требуется проверить обезличивание."
          : "Карточка кейса сохранена локально. Сырые PDF/DICOM/изображения не сохранены: для них нужен отдельный anonymizer runtime.");
    } catch {
      setStatus("Не удалось сохранить кейс в локальную базу браузера.");
    } finally {
      setSaving(false);
    }
  }

  const activeCase = activeCaseId ? cases.find(item => item.id === activeCaseId) ?? null : null;

  return <section className="workspace-case-surface" aria-labelledby="workspace-case-title">
    <header className="workspace-case-header">
      <div>
        <span className="eyebrow">{specialtyLabel[specialty]} · Рабочее пространство</span>
        <h1 id="workspace-case-title">Ваши материалы и контекст</h1>
        <p>Добавьте данные клинического кейса, обезличьте их и продолжите работу с сохранённым контекстом в инструментах и консилиуме.</p>
      </div>
    </header>

    <div className="workspace-case-chips" aria-label="Профессиональный контекст">
      {terms.map(term => <span key={term}><Sparkles size={12} aria-hidden="true" />{term}</span>)}
    </div>

    <div className="workspace-case-grid">
      <div className="workspace-case-main">
        <section className="workspace-case-composer" aria-label="Новый клинический кейс">
          <div className="workspace-case-anonymizer-label"><span>Локальный анонимизатор</span><small>исходные файлы не попадают в базу</small></div>
          <textarea
            value={question}
            onChange={event => setQuestion(event.target.value)}
            placeholder="Опишите клиническую задачу или вопрос по кейсу…"
            maxLength={1600}
            aria-label="Вопрос или клиническая задача"
          />
          <div className="workspace-case-composer-actions">
            <button type="button" className="workspace-case-file-trigger" onClick={() => fileInput.current?.click()}>
              <Paperclip size={16} aria-hidden="true" />
              Добавить данные пациента (PDF, DICOM, изображения, TXT/CSV)
            </button>
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              multiple
              accept=".pdf,.dcm,.dicom,.txt,.csv,.md,application/pdf,application/dicom,text/plain,text/csv,text/markdown,image/*"
              onChange={event => void selectFiles(event)}
            />
            <button type="button" className="workspace-case-send" aria-label="Сохранить клинический кейс" onClick={() => void saveCase()} disabled={saving}>
              <Send size={18} aria-hidden="true" />
            </button>
          </div>
          {files.length > 0 && <div className="workspace-case-files" aria-label="Подготовленные файлы">
            {files.map(file => <span key={file.id}>{file.kind === "image" ? <ImageIcon size={13} /> : <FileText size={13} />}{file.displayName}<small>{statusLabel(file.anonymizationStatus)}</small></span>)}
          </div>}
          {status && <p className="workspace-case-status" role="status">{status}</p>}
        </section>

        <section className="workspace-summary-card">
          <div className="workspace-summary-icon"><Sparkles size={19} aria-hidden="true" /></div>
          <div>
            <strong>Добавить сводку</strong>
            <p>Кратко опишите пациента, ключевые данные и ваш вопрос. Прямые идентификаторы будут удалены локально перед сохранением.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setShowSummary(value => !value)}>{showSummary ? "Скрыть" : "Добавить сводку"}</button>
          {showSummary && <textarea value={summary} onChange={event => setSummary(event.target.value)} placeholder="Клиническая сводка — без необходимости вручную удалять телефон, e-mail, СНИЛС и другие прямые идентификаторы…" maxLength={5000} aria-label="Клиническая сводка" />}
        </section>

        <section className="workspace-clinical-cases" aria-labelledby="workspace-cases-title">
          <div className="workspace-case-section-head"><h2 id="workspace-cases-title">Мои клинические кейсы</h2><span>{cases.length}</span></div>
          {cases.length ? <div className="workspace-case-list">{cases.slice(0, 8).map(item => <article key={item.id} className={activeCaseId === item.id ? "active" : ""}>
            <button type="button" onClick={() => setActiveCaseId(item.id)}><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleString("ru-RU")} · {statusLabel(item.anonymizationStatus)}</small></button>
            <Link href={`/${specialty}?view=consilium&shell=workspace&case=${encodeURIComponent(item.id)}`}>Обсудить <ArrowRight size={14} /></Link>
          </article>)}</div> : <div className="workspace-recent-empty">После обезличивания здесь появятся ваши собственные клинические кейсы.</div>}
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
        <div className="workspace-case-rail-title"><UsersRound size={20} aria-hidden="true" /><div><h2>Кем обсудить</h2><p>{activeCase ? "Продолжите работу с выбранным обезличенным кейсом." : "Сначала сохраните клинический кейс или выберите существующий."}</p></div></div>
        <Link href={`/${specialty}?view=consilium&shell=workspace${activeCase ? `&case=${encodeURIComponent(activeCase.id)}` : ""}`}><Stethoscope size={17} /><span><strong>Клинический консилиум</strong><small>Несколько профессиональных линз</small></span><ArrowRight size={15} /></Link>
        <Link href={`/${specialty}?kind=article&shell=workspace`}><MessageSquareText size={17} /><span><strong>Проверить исследования</strong><small>Evidence и интерпретации</small></span><ArrowRight size={15} /></Link>
        <Link href={`/${specialty}?view=consilium&shell=workspace${activeCase ? `&case=${encodeURIComponent(activeCase.id)}` : ""}`}><UploadCloud size={17} /><span><strong>Сложные решения</strong><small>Мультидисциплинарный взгляд</small></span><ArrowRight size={15} /></Link>
        <Link className="workspace-community-button" href={`/${specialty}?view=consilium&shell=workspace${activeCase ? `&case=${encodeURIComponent(activeCase.id)}` : ""}`}>Перейти к консилиуму</Link>
      </aside>
    </div>
  </section>;
}
