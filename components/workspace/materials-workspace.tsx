"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { FileText, FolderPlus, Link2, NotebookPen, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { countLabel, formatDateRu } from "@/lib/agents/format";
import type { AgentResultView, AgentRun, Material, MaterialCollection, SourceOwnership } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { ResultList } from "./result-card";
import { RunTrace } from "./run-trace";
import { useWorkspace } from "./workspace-provider";

const OWNERSHIP_LABEL: Record<SourceOwnership, string> = {
  USER_UPLOADED: "Ваш файл или заметка",
  PUBLIC_SOURCE: "Публичный источник",
  PARTNER_SOURCE: "Партнёрский материал",
  GENERATED: "Результат агента",
};

const PARSE_LABEL: Record<Material["parseStatus"], string> = {
  indexed: "Проиндексирован",
  metadata_only: "Только название и заметка",
  parser_unavailable: "Текст не извлечён",
  rejected: "Отклонён",
};

type AddMode = "file" | "link" | "note" | null;

export function MaterialsWorkspace({ specialty, materials, collections, lastAnswer, answerResults, now }: { specialty: SpecialtyId; materials: Material[]; collections: MaterialCollection[]; lastAnswer: AgentRun | null; answerResults: AgentResultView[]; now: string }) {
  const router = useRouter();
  const { command, upload, pending } = useWorkspace();
  const [mode, setMode] = useState<AddMode>(materials.length ? null : "file");
  const [question, setQuestion] = useState("");
  const [filter, setFilter] = useState<"all" | SourceOwnership>("all");
  const [collection, setCollection] = useState<string>("all");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => materials.filter(material => (filter === "all" || material.ownership === filter) && (collection === "all" || material.collectionIds.includes(collection))), [collection, filter, materials]);

  function resetForm() { setUrl(""); setTitle(""); setNote(""); setMode(null); }

  async function addLink(event: FormEvent) {
    event.preventDefault();
    if (await command({ action: "addLink", url, ...(title.trim() ? { title } : {}), ...(note.trim() ? { note } : {}) })) resetForm();
  }
  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (await command({ action: "addNote", title: title.trim() || "Заметка", note })) resetForm();
  }
  async function addFile(event: FormEvent) {
    event.preventDefault();
    const selected = file.current?.files?.[0];
    if (!selected) return;
    const form = new FormData();
    form.set("file", selected);
    if (title.trim()) form.set("title", title.trim());
    if (note.trim()) form.set("note", note.trim());
    if (await upload(form)) { if (file.current) file.current.value = ""; resetForm(); }
  }
  async function ask(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (value.length < 2) return;
    const result = await command({ action: "runTask", text: value, agentId: "materials" }, { refresh: false });
    if (result?.runId) router.push(`/${specialty}/materials?run=${encodeURIComponent(result.runId)}`);
  }

  return <div className="ws-materials">
    <section className="ws-materials-ask" aria-labelledby="ws-ask-title">
      <h2 id="ws-ask-title" className="ws-section-title">Спросить по моим материалам</h2>
      <p className="ws-muted">Агент ищет только в том, что вы добавили сами. Другим пользователям ваши материалы недоступны.</p>
      <form className="ws-inline-form" onSubmit={event => void ask(event)}>
        <Search size={17} aria-hidden="true" />
        <label className="sr-only" htmlFor="ws-material-question">Вопрос</label>
        <input id="ws-material-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Например: что в моих материалах про SCORE2" maxLength={600} />
        <button type="submit" className="ws-button is-primary is-small" disabled={pending || question.trim().length < 2}>Найти</button>
      </form>
      {lastAnswer && <div className="ws-materials-answer">
        <RunTrace run={lastAnswer} connectors={[]} now={now} />
        <ResultList results={answerResults} specialty={specialty} emptyText="Совпадений в ваших материалах нет." />
      </div>}
    </section>

    <section className="ws-section" aria-labelledby="ws-add-title">
      <div className="ws-section-head">
        <h2 id="ws-add-title" className="ws-section-title">Добавить материал</h2>
        <div className="ws-segmented" role="group" aria-label="Тип материала">
          <button type="button" className={mode === "file" ? "is-active" : undefined} aria-pressed={mode === "file"} onClick={() => setMode(mode === "file" ? null : "file")}><Upload size={15} aria-hidden="true" />Файл</button>
          <button type="button" className={mode === "link" ? "is-active" : undefined} aria-pressed={mode === "link"} onClick={() => setMode(mode === "link" ? null : "link")}><Link2 size={15} aria-hidden="true" />Ссылка</button>
          <button type="button" className={mode === "note" ? "is-active" : undefined} aria-pressed={mode === "note"} onClick={() => setMode(mode === "note" ? null : "note")}><NotebookPen size={15} aria-hidden="true" />Заметка</button>
        </div>
      </div>
      {mode === "file" && <form className="ws-add-form" onSubmit={event => void addFile(event)}>
        <label className="ws-file-drop"><FileText size={20} aria-hidden="true" /><span>TXT, MD, CSV, HTML и DOCX — с поиском по тексту. PDF — пока только название и заметка. До 4 МБ.</span><input ref={file} type="file" accept=".txt,.md,.csv,.html,.htm,.docx,.pdf" required /></label>
        <label>Название<input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="Необязательно" /></label>
        <label>Заметка<input value={note} onChange={event => setNote(event.target.value)} maxLength={2000} placeholder="Необязательно" /></label>
        <p className="ws-muted">Не загружайте данные конкретных пациентов: персональные данные мы маскируем при индексации, а медицинские изображения не принимаем.</p>
        <button type="submit" className="ws-button is-primary" disabled={pending}><Plus size={15} aria-hidden="true" />Загрузить</button>
      </form>}
      {mode === "link" && <form className="ws-add-form" onSubmit={event => void addLink(event)}>
        <label>Ссылка<input type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" maxLength={2000} /></label>
        <label>Название<input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="Необязательно" /></label>
        <label>Заметка<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={4000} rows={3} placeholder="О чём материал — по заметке его найдёт агент" /></label>
        <button type="submit" className="ws-button is-primary" disabled={pending}><Plus size={15} aria-hidden="true" />Сохранить ссылку</button>
      </form>}
      {mode === "note" && <form className="ws-add-form" onSubmit={event => void addNote(event)}>
        <label>Название<input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="Например: разбор с конференции" /></label>
        <label>Текст<textarea required value={note} onChange={event => setNote(event.target.value)} maxLength={20000} rows={6} /></label>
        <button type="submit" className="ws-button is-primary" disabled={pending}><Plus size={15} aria-hidden="true" />Сохранить заметку</button>
      </form>}
    </section>

    <section className="ws-section" aria-labelledby="ws-library-title">
      <div className="ws-section-head">
        <h2 id="ws-library-title" className="ws-section-title">Библиотека · {countLabel(materials.length, ["материал", "материала", "материалов"])}</h2>
        <div className="ws-filters">
          <label><span className="sr-only">Тип</span><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">Все</option>{(Object.keys(OWNERSHIP_LABEL) as SourceOwnership[]).map(key => <option key={key} value={key}>{OWNERSHIP_LABEL[key]}</option>)}</select></label>
          <label><span className="sr-only">Подборка</span><select value={collection} onChange={event => setCollection(event.target.value)}><option value="all">Все подборки</option>{collections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
      </div>
      <form className="ws-inline-form is-small" onSubmit={event => { event.preventDefault(); if (newCollection.trim()) void command({ action: "createCollection", name: newCollection.trim() }).then(result => { if (result) setNewCollection(""); }); }}>
        <FolderPlus size={16} aria-hidden="true" /><label className="sr-only" htmlFor="ws-new-collection">Новая подборка</label>
        <input id="ws-new-collection" value={newCollection} onChange={event => setNewCollection(event.target.value)} placeholder="Новая подборка" maxLength={80} />
        <button type="submit" className="ws-button is-small" disabled={pending || !newCollection.trim()}>Создать</button>
      </form>
      {collections.length > 0 && <ul className="ws-collections">{collections.map(item => <li key={item.id}><span>{item.name}</span><small>{materials.filter(material => material.collectionIds.includes(item.id)).length}</small><button type="button" aria-label={`Удалить подборку ${item.name}`} onClick={() => void command({ action: "deleteCollection", collectionId: item.id })}><X size={13} /></button></li>)}</ul>}
      {visible.length === 0 ? <p className="ws-empty">{materials.length ? "В этом фильтре материалов нет." : "Здесь будут ваши файлы, ссылки, заметки и сохранённые результаты агентов."}</p> : <ul className="ws-material-list">
        {visible.map(material => <li key={material.id} className="ws-material">
          <div className="ws-material-main">
            <span className={`ws-owner ws-owner-${material.ownership.toLowerCase()}`}>{OWNERSHIP_LABEL[material.ownership]}</span>
            <strong>{material.url ? <a href={material.url} target="_blank" rel="noreferrer">{material.title}</a> : material.title}</strong>
            <span className="ws-material-meta">{formatDateRu(material.createdAt, { day: "numeric", month: "short", year: "numeric" })}{material.fileName ? ` · ${material.fileName}` : ""}{material.kind === "file" || material.kind === "note" ? ` · ${PARSE_LABEL[material.parseStatus]}` : ""}{material.textChars ? ` · ${material.textChars.toLocaleString("ru-RU")} знаков` : ""}</span>
            {material.parseNote && <span className="ws-material-note">{material.parseNote}</span>}
            {material.redactions.length > 0 && <span className="ws-material-note">Замаскированы персональные данные: {material.redactions.length}</span>}
            {material.note && material.kind !== "note" && <p>{material.note}</p>}
          </div>
          <div className="ws-material-actions">
            {collections.length > 0 && <label><span className="sr-only">Подборка для {material.title}</span><select value="" onChange={event => { const id = event.target.value; if (id) void command({ action: "collectionItem", collectionId: id, materialId: material.id, enabled: !material.collectionIds.includes(id) }); }}><option value="">В подборку…</option>{collections.map(item => <option key={item.id} value={item.id}>{material.collectionIds.includes(item.id) ? `✓ ${item.name}` : item.name}</option>)}</select></label>}
            <button type="button" className="ws-icon-button is-quiet" aria-label={`Удалить: ${material.title}`} onClick={() => void command({ action: "deleteMaterial", materialId: material.id })}><Trash2 size={15} /></button>
          </div>
        </li>)}
      </ul>}
    </section>
  </div>;
}
