"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { BarChart3, CheckCircle2, Download, FileText, Info, Paperclip, RotateCcw, XCircle } from "lucide-react";
import { isLocallyReadableClinicalFile, REDACTION_RULE_IDS, redactDirectIdentifiers, type RedactionRuleId } from "@/lib/clinical-case/anonymizer";
import { formatDateRu } from "@/lib/agents/format";
import type { SpecialtyId } from "@/lib/domain/types";

/**
 * «Обезличивание» — its own tool, not a part of «Мои материалы». Text files
 * are processed in the browser with the same rules the server applies to
 * questions and uploads; nothing leaves the device and the original text is
 * never stored. History and settings live in this browser.
 */

export type AnonymizerTab = "process" | "history" | "stats" | "settings";
export type AnonymizerStatus = "queued" | "processing" | "completed" | "failed";

export interface AnonymizerJob {
  id: string;
  fileName: string;
  fileType: string;
  size: number;
  createdAt: string;
  status: AnonymizerStatus;
  counts: Partial<Record<RedactionRuleId, number>>;
  rulesApplied: RedactionRuleId[];
  needsReview: boolean;
  error: string | null;
  /** Result text, kept so the file can be downloaded again (limited size). */
  result: string | null;
}

export const RULE_COPY: Record<RedactionRuleId, { label: string; category: string; hint: string }> = {
  email: { label: "Электронная почта", category: "Контакты", hint: "adres@domen.ru → [EMAIL]" },
  phone: { label: "Телефон", category: "Контакты", hint: "+7 999 123-45-67 → [PHONE]" },
  snils: { label: "СНИЛС", category: "Документы", hint: "123-456-789 00 → [SNILS]" },
  oms: { label: "Полис ОМС", category: "Документы", hint: "16 цифр → [OMS]" },
  passport: { label: "Паспорт", category: "Документы", hint: "серия и номер → [PASSPORT]" },
  record: { label: "Номер медкарты", category: "Документы", hint: "«медкарта № 123456», «история болезни 45/2021» → [НОМЕР КАРТЫ]" },
  fio: { label: "ФИО пациента", category: "Личные данные", hint: "«Пациент: …», «Иванов И.И.» → [ФИО]" },
  address: { label: "Адрес", category: "Личные данные", hint: "«Адрес: …», «ул. Ленина д. 5 кв. 3» → [АДРЕС]" },
  birth_date: { label: "Дата рождения", category: "Личные данные", hint: "«Дата рождения: …», «1956 г.р.» → [ГОД РОЖДЕНИЯ]" },
};

export const PRESETS: ReadonlyArray<{ id: string; label: string; rules: readonly RedactionRuleId[] }> = [
  { id: "full", label: "Общий", rules: REDACTION_RULE_IDS },
  { id: "documents", label: "Контакты и документы", rules: ["email", "phone", "snils", "oms", "passport", "record"] },
  { id: "personal", label: "Личные данные", rules: ["fio", "address", "birth_date"] },
];

const STATUS_LABEL: Record<AnonymizerStatus, string> = { queued: "В очереди", processing: "Обработка", completed: "Готово", failed: "Ошибка" };
const HISTORY_KEY = "kardio.anonymizer.history.v1";
const RULES_KEY = "kardio.anonymizer.rules.v1";
const MAX_HISTORY = 20;
const MAX_RESULT_CHARS = 120_000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

function readHistory(): AnonymizerJob[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is AnonymizerJob => typeof item === "object" && item !== null && typeof (item as AnonymizerJob).id === "string") : [];
  } catch { return []; }
}
function writeHistory(jobs: AnonymizerJob[]) {
  try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(jobs.slice(0, MAX_HISTORY))); } catch { /* storage full or unavailable: the session still works */ }
}
function readRules(): RedactionRuleId[] {
  try {
    const raw = window.localStorage.getItem(RULES_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    const rules = Array.isArray(parsed) ? parsed.filter((item): item is RedactionRuleId => (REDACTION_RULE_IDS as readonly string[]).includes(String(item))) : [];
    return rules.length ? rules : [...REDACTION_RULE_IDS];
  } catch { return [...REDACTION_RULE_IDS]; }
}

export function totalEntities(job: Pick<AnonymizerJob, "counts">): number {
  return Object.values(job.counts).reduce((sum, value) => sum + (value ?? 0), 0);
}
export function categoriesOf(job: Pick<AnonymizerJob, "counts">): Array<{ category: string; count: number }> {
  const map = new Map<string, number>();
  for (const [rule, count] of Object.entries(job.counts)) map.set(RULE_COPY[rule as RedactionRuleId].category, (map.get(RULE_COPY[rule as RedactionRuleId].category) ?? 0) + (count ?? 0));
  return [...map.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
}

function download(job: AnonymizerJob) {
  if (!job.result) return;
  const blob = new Blob([job.result], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${job.fileName.replace(/\.[^.]+$/u, "")}.обезличено.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

/** One processed file: status, counts, what can be done next. Used by the tool and the visual audit. */
export function UploadJobCard({ job, onDownload, onRetry, onStats }: { job: AnonymizerJob; onDownload?: (job: AnonymizerJob) => void; onRetry?: (job: AnonymizerJob) => void; onStats?: (job: AnonymizerJob) => void }) {
  const total = totalEntities(job);
  return <article className="pt-anon-job" data-status={job.status} aria-label={job.fileName}>
    <div className="pt-anon-job-head">
      <FileText size={18} aria-hidden="true" />
      <strong>{job.fileName}</strong>
      <span className="pt-anon-status" data-status={job.status}>
        {job.status === "completed" && <CheckCircle2 size={14} aria-hidden="true" />}
        {job.status === "failed" && <XCircle size={14} aria-hidden="true" />}
        {STATUS_LABEL[job.status]}
      </span>
    </div>
    {job.status === "processing" && <div className="pt-anon-progress" role="progressbar" aria-label="Обработка" aria-valuetext="Обработка файла"><span /></div>}
    {job.status === "completed" && <p className="ws-muted">{total ? `Найдено и заменено: ${total}` : "Персональных данных по включённым правилам не найдено"}{job.needsReview ? " · остались упоминания, которые стоит проверить вручную" : ""}</p>}
    {job.status === "failed" && job.error && <p className="ws-risk is-blocking" role="alert">{job.error}</p>}
    {(job.status === "completed" || job.status === "failed") && <div className="pt-card-actions">
      {job.status === "completed" && job.result && <button type="button" className="ws-button is-primary is-small" onClick={() => onDownload?.(job)}><Download size={14} aria-hidden="true" />Скачать результат</button>}
      {onRetry && <button type="button" className="ws-button is-small" onClick={() => onRetry(job)}><RotateCcw size={14} aria-hidden="true" />Обработать ещё раз</button>}
      {job.status === "completed" && onStats && <button type="button" className="ws-button is-small" onClick={() => onStats(job)}><BarChart3 size={14} aria-hidden="true" />Перейти к статистике</button>}
    </div>}
  </article>;
}

export function AnonymizerTool({ specialty, initialTab = "process" }: { specialty: SpecialtyId; initialTab?: AnonymizerTab }) {
  const [tab, setTab] = useState<AnonymizerTab>(initialTab);
  const [jobs, setJobs] = useState<AnonymizerJob[]>([]);
  const [rules, setRules] = useState<RedactionRuleId[]>([...REDACTION_RULE_IDS]);
  const [loaded, setLoaded] = useState(false);
  const [over, setOver] = useState(false);
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const originals = useRef(new Map<string, string>());
  const input = useRef<HTMLInputElement>(null);

  // History and rules come from this browser after mount (the server renders the empty tool).
  useEffect(() => {
    const id = window.setTimeout(() => { setJobs(readHistory()); setRules(readRules()); setLoaded(true); }, 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => { if (loaded) writeHistory(jobs); }, [jobs, loaded]);
  useEffect(() => { if (loaded) try { window.localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch { /* ignore */ } }, [rules, loaded]);

  function update(id: string, patch: Partial<AnonymizerJob>) {
    setJobs(current => current.map(job => job.id === id ? { ...job, ...patch } : job));
  }

  async function process(id: string, text: string) {
    update(id, { status: "processing", error: null });
    // Let the browser paint the processing state before the synchronous pass.
    await new Promise(resolve => setTimeout(resolve, 60));
    try {
      const result = redactDirectIdentifiers(text, { rules });
      update(id, { status: "completed", counts: result.counts, rulesApplied: result.rulesApplied, needsReview: result.status === "needs_review", result: result.redactedText.slice(0, MAX_RESULT_CHARS) });
    } catch (error) {
      update(id, { status: "failed", error: error instanceof Error ? error.message : "Файл не удалось обработать" });
    }
  }

  async function accept(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const id = `anon-${crypto.randomUUID()}`;
      const base: AnonymizerJob = { id, fileName: file.name, fileType: file.type || "text/plain", size: file.size, createdAt: new Date().toISOString(), status: "queued", counts: {}, rulesApplied: [], needsReview: false, error: null, result: null };
      setJobs(current => [base, ...current].slice(0, MAX_HISTORY));
      if (!isLocallyReadableClinicalFile(file)) { update(id, { status: "failed", error: "Формат не поддерживается: обрабатываются текстовые файлы TXT, MD и CSV" }); continue; }
      if (file.size > MAX_FILE_BYTES) { update(id, { status: "failed", error: "Файл больше 4 МБ" }); continue; }
      let text = "";
      try { text = await file.text(); } catch { update(id, { status: "failed", error: "Файл не удалось прочитать" }); continue; }
      originals.current.set(id, text);
      await process(id, text);
    }
    setTab("process");
  }

  function retry(job: AnonymizerJob) {
    const text = originals.current.get(job.id);
    if (text === undefined) { update(job.id, { status: "failed", error: "Исходный текст не хранится: загрузите файл ещё раз" }); return; }
    void process(job.id, text);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    if (event.dataTransfer.files.length) void accept(event.dataTransfer.files);
  }

  const current = jobs.find(job => job.id === statsFor) ?? jobs.find(job => job.status === "completed") ?? null;
  const tabs: Array<{ id: AnonymizerTab; label: string }> = [{ id: "process", label: "Обработка" }, { id: "history", label: "История" }, { id: "stats", label: "Статистика" }, { id: "settings", label: "Настройки" }];

  return <div className="pt-anon" data-specialty={specialty}>
    <div className="pt-anon-tabs" role="tablist" aria-label="Разделы обезличивания">
      {tabs.map(item => <button key={item.id} type="button" role="tab" id={`pt-anon-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`pt-anon-panel-${item.id}`} className="pt-anon-tab" onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>

    {tab === "process" && <section className="pt-anon-panel" role="tabpanel" id="pt-anon-panel-process" aria-labelledby="pt-anon-tab-process">
      <label className={over ? "pt-anon-drop is-over" : "pt-anon-drop"} onDragOver={event => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <span className="pt-anon-drop-icon"><Paperclip size={20} aria-hidden="true" /></span>
        <strong>Перетащите сюда или нажмите для загрузки файлов</strong>
        <span>Текстовые документы: выписки, протоколы, заметки</span>
        <small>TXT, MD, CSV до 4 МБ. Обработка идёт в браузере, файлы никуда не отправляются.</small>
        <input ref={input} type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" multiple aria-label="Файлы для обезличивания" onChange={event => { if (event.target.files?.length) void accept(event.target.files); event.target.value = ""; }} />
      </label>
      <p className="pt-anon-note"><Info size={14} aria-hidden="true" /><span>Из документов будет стёрта персональная информация по правилам из раздела «Настройки»: контакты, документы, ФИО, адрес и дата рождения. Исходный текст не сохраняется. Изображения, PDF, DOCX и аудио пока не обрабатываются.</span></p>
      {jobs.slice(0, 5).map(job => <UploadJobCard key={job.id} job={job} onDownload={download} onRetry={retry} onStats={item => { setStatsFor(item.id); setTab("stats"); }} />)}
    </section>}

    {tab === "history" && <section className="pt-anon-panel" role="tabpanel" id="pt-anon-panel-history" aria-labelledby="pt-anon-tab-history">
      {jobs.length === 0
        ? <p className="ws-empty">Тут пока пусто: обработайте документ, и он появится в истории.</p>
        : <div className="pt-anon-table-wrap"><table className="pt-anon-table">
          <thead><tr><th scope="col">Файл</th><th scope="col">Тип</th><th scope="col">Дата</th><th scope="col">Статус</th><th scope="col">Найдено</th><th scope="col">Результат</th></tr></thead>
          <tbody>{jobs.map(job => <tr key={job.id}>
            <td>{job.fileName}</td>
            <td>{job.fileName.split(".").pop()?.toUpperCase() ?? job.fileType}</td>
            <td>{formatDateRu(job.createdAt, { day: "numeric", month: "short", year: "numeric" }) ?? job.createdAt.slice(0, 10)}</td>
            <td><span className="pt-anon-status" data-status={job.status}>{STATUS_LABEL[job.status]}</span></td>
            <td>{job.status === "completed" ? totalEntities(job) : "—"}</td>
            <td>{job.status === "completed" && job.result ? <button type="button" className="ws-button is-small" onClick={() => download(job)}><Download size={14} aria-hidden="true" />Скачать</button> : "—"}</td>
          </tr>)}</tbody>
        </table></div>}
      <p className="pt-anon-note"><Info size={14} aria-hidden="true" /><span>История хранится в этом браузере: до {MAX_HISTORY} последних документов, только результат и статистика.</span></p>
    </section>}

    {tab === "stats" && <section className="pt-anon-panel" role="tabpanel" id="pt-anon-panel-stats" aria-labelledby="pt-anon-tab-stats">
      {!current
        ? <p className="ws-empty">Статистика появится после первой обработки.</p>
        : <>
          <label className="ws-muted">Документ
            <select value={current.id} onChange={event => setStatsFor(event.target.value)} aria-label="Документ для статистики">
              {jobs.filter(job => job.status === "completed").map(job => <option key={job.id} value={job.id}>{job.fileName}</option>)}
            </select>
          </label>
          <ul className="pt-anon-stats" aria-label="Итог сканирования">
            <li className="pt-anon-stat"><strong>{totalEntities(current)}</strong><span>Найдено данных в документе</span></li>
            <li className="pt-anon-stat"><strong>{Object.keys(current.counts).length}</strong><span>Типов данных</span></li>
            <li className="pt-anon-stat"><strong>{categoriesOf(current).length}</strong><span>Категорий</span></li>
            <li className="pt-anon-stat"><strong>{current.rulesApplied.length}</strong><span>Включено правил</span></li>
          </ul>
          <div className="pt-anon-table-wrap"><table className="pt-anon-table">
            <thead><tr><th scope="col">Категория</th><th scope="col">Тип данных</th><th scope="col">Заменено</th></tr></thead>
            <tbody>{Object.entries(current.counts).map(([rule, count]) => <tr key={rule}><td>{RULE_COPY[rule as RedactionRuleId].category}</td><td>{RULE_COPY[rule as RedactionRuleId].label}</td><td>{count}</td></tr>)}</tbody>
          </table></div>
          <p className="ws-muted">Применены правила: {current.rulesApplied.map(rule => RULE_COPY[rule].label).join(", ") || "—"}.{current.needsReview ? " В тексте остались слова вроде «фамилия» или «адрес» без явных данных: стоит проверить вручную." : ""}</p>
        </>}
    </section>}

    {tab === "settings" && <section className="pt-anon-panel" role="tabpanel" id="pt-anon-panel-settings" aria-labelledby="pt-anon-tab-settings">
      <div className="pt-anon-presets" role="group" aria-label="Наборы правил">
        {PRESETS.map(preset => <button key={preset.id} type="button" className={preset.rules.length === rules.length && preset.rules.every(rule => rules.includes(rule)) ? "ws-chip is-selected" : "ws-chip"} onClick={() => setRules([...preset.rules])}>{preset.label}</button>)}
      </div>
      <ul className="pt-anon-rules" aria-label="Правила обезличивания">
        {REDACTION_RULE_IDS.map(rule => <li key={rule} className="pt-anon-rule">
          <input type="checkbox" id={`pt-anon-rule-${rule}`} checked={rules.includes(rule)} onChange={event => setRules(current => event.target.checked ? [...new Set([...current, rule])] : current.filter(item => item !== rule))} />
          <label htmlFor={`pt-anon-rule-${rule}`}><span><strong>{RULE_COPY[rule].label}</strong><small>{RULE_COPY[rule].category} · {RULE_COPY[rule].hint}</small></span></label>
        </li>)}
      </ul>
      <p className="pt-anon-note"><Info size={14} aria-hidden="true" /><span>Правила применяются к новым файлам. Настройки врача (имя, специальность, темы) живут в разделе «Профиль и настройки», а не здесь.</span></p>
    </section>}
  </div>;
}
