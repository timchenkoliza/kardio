"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { ExternalLink, FileText, FolderPlus, Link2, NotebookPen, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { countLabel, formatDateRu } from "@/lib/agents/format";
import type { AgentResultView, AgentRun, Material, MaterialCollection, MaterialFormat, SourceOwnership } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { filterMaterials, MATERIAL_FORMAT_LABEL, MATERIAL_FORMAT_ORDER, MATERIAL_SORT_LABEL, materialFormat, OWNERSHIP_LABEL, russianIsoDate, sortMaterials, type MaterialFilter, type MaterialSort } from "@/lib/portal/materials";
import type { MaterialExample } from "@/lib/portal/material-examples";
import { nbsp } from "@/lib/ui/typography";
import { Mascot } from "@/components/portal/mascot";
import { ResultList } from "./result-card";
import { RunTrace } from "./run-trace";
import { useWorkspace } from "./workspace-provider";

const PARSE_LABEL: Record<Material["parseStatus"], string> = {
  indexed: "Поиск по тексту",
  metadata_only: "Поиск по названию и заметке",
  parser_unavailable: "Текст не извлечён",
  rejected: "Отклонён",
};

type AddMode = "file" | "link" | "note" | null;

function MaterialTitle({ material, specialty }: { material: Material; specialty: SpecialtyId }) {
  // A saved answer opens inside the product; an external page only from «Открыть первоисточник».
  if (material.kind === "agent_result" && material.sourceResultId && /^res-[a-f0-9-]{36}$/u.test(material.sourceResultId)) {
    return <Link className="ws-material-link" href={`/${specialty}/item/${material.sourceResultId}`}>{material.title}</Link>;
  }
  return <>{material.title}</>;
}

function MaterialItem({ material, specialty, collections, onCommand }: { material: Material; specialty: SpecialtyId; collections: MaterialCollection[]; onCommand: ReturnType<typeof useWorkspace>["command"] }) {
  const format = materialFormat(material);
  const published = russianIsoDate(material.provenance?.publishedAt);
  const added = formatDateRu(material.createdAt, { day: "numeric", month: "short", year: "numeric" });
  return <li className="ws-material" data-format={format}>
    <div className="ws-material-main">
      <div className="pt-card-meta">
        <span className="ws-kind" data-art={format === "guideline" ? "guideline" : format === "note" || format === "file" ? "clinical" : "article"}>{material.typeLabel ?? MATERIAL_FORMAT_LABEL[format]}</span>
        <span className={`ws-owner ws-owner-${material.ownership.toLowerCase()}`}>{OWNERSHIP_LABEL[material.ownership]}</span>
      </div>
      <strong className="ws-material-title"><MaterialTitle material={material} specialty={specialty} /></strong>
      {material.summary && <p className="ws-material-summary">{material.summary}</p>}
      <span className="ws-material-meta">{`Добавлено ${added}`}{published ? ` · опубликовано ${published}` : ""}{material.fileName ? ` · ${material.fileName}` : ""}{material.kind === "file" || material.kind === "note" ? ` · ${PARSE_LABEL[material.parseStatus]}` : ""}{material.textChars && material.kind !== "link" ? ` · ${material.textChars.toLocaleString("ru-RU")} знаков` : ""}</span>
      {material.parseNote && <span className={material.kind === "link" ? "ws-material-meta" : "ws-material-note"}>{material.parseNote}</span>}
      {material.redactions.length > 0 && <span className="ws-material-note">Замаскированы персональные данные: {material.redactions.length}</span>}
      {material.note && material.kind !== "note" && <p className="ws-material-own-note">{material.note}</p>}
      {material.url && <a className="pt-source-link" href={material.url} target="_blank" rel="noreferrer">Открыть первоисточник<ExternalLink size={13} aria-hidden="true" /></a>}
    </div>
    <div className="ws-material-actions">
      {collections.length > 0 && <label><span className="sr-only">Подборка для {material.title}</span><select value="" onChange={event => { const id = event.target.value; if (id) void onCommand({ action: "collectionItem", collectionId: id, materialId: material.id, enabled: !material.collectionIds.includes(id) }); }}><option value="">В подборку…</option>{collections.map(item => <option key={item.id} value={item.id}>{material.collectionIds.includes(item.id) ? `✓ ${item.name}` : item.name}</option>)}</select></label>}
      <button type="button" className="ws-icon-button is-quiet" aria-label={`Удалить: ${material.title}`} onClick={() => void onCommand({ action: "deleteMaterial", materialId: material.id })}><Trash2 size={15} /></button>
    </div>
  </li>;
}

function Onboarding({ onMode }: { onMode: (mode: AddMode) => void }) {
  return <section className="pt-mat-onboarding" aria-labelledby="pt-mat-start">
    <div className="pt-mat-onboarding-head">
      <Mascot variant="materials" size={72} />
      <div>
        <h2 id="pt-mat-start" className="pt-subtitle">Соберите свою базу</h2>
        <p className="ws-muted">Агент «Мои материалы» отвечает только по тому, что вы сохранили сами, и ссылается на ваш документ.</p>
      </div>
    </div>
    <ol className="pt-mat-steps">
      <li><strong>Сохраните ответ</strong><span>Кнопка «Сохранить» есть у ответов и у материалов ленты.</span></li>
      <li><strong>Добавьте ссылку</strong><span>Для PubMed и ссылок с DOI название, журнал и дата подтянутся сами.</span></li>
      <li><strong>Загрузите файл или заметку</strong><span>TXT, MD, CSV, HTML и DOCX — с поиском по тексту.</span></li>
    </ol>
    <div className="pt-card-actions">
      <button type="button" className="ws-button is-primary is-small" onClick={() => onMode("link")}><Link2 size={15} aria-hidden="true" />Добавить ссылку</button>
      <button type="button" className="ws-button is-small" onClick={() => onMode("file")}><Upload size={15} aria-hidden="true" />Загрузить файл</button>
      <button type="button" className="ws-button is-small" onClick={() => onMode("note")}><NotebookPen size={15} aria-hidden="true" />Написать заметку</button>
    </div>
  </section>;
}

function Examples({ examples, onAdd, pending }: { examples: MaterialExample[]; onAdd: (example: MaterialExample) => void; pending: boolean }) {
  if (!examples.length) return null;
  return <section className="pt-mat-examples" aria-labelledby="pt-mat-examples">
    <h2 id="pt-mat-examples" className="ws-section-title">{nbsp("Как это выглядит")}</h2>
    <p className="ws-muted">Пример материалов по вашей специальности. Это не ваша база — добавьте, если пригодится.</p>
    <ul className="ws-material-list">
      {examples.map(example => <li key={example.id} className="ws-material is-example" data-example="true">
        <div className="ws-material-main">
          <div className="pt-card-meta"><span className="pt-curated">Пример</span><span className="ws-kind" data-art="guideline">{example.typeLabel}</span></div>
          <strong className="ws-material-title">{example.title}</strong>
          <p className="ws-material-summary">{[example.publisher, example.date].filter(Boolean).join(" · ")}</p>
          <p className="ws-material-own-note">{example.summary}</p>
          <div className="pt-card-actions">
            <button type="button" className="ws-button is-small" disabled={pending} onClick={() => onAdd(example)}><Plus size={14} aria-hidden="true" />Добавить в мои материалы</button>
            <a className="pt-source-link" href={example.url} target="_blank" rel="noreferrer">Открыть первоисточник<ExternalLink size={13} aria-hidden="true" /></a>
          </div>
        </div>
      </li>)}
    </ul>
  </section>;
}

export function MaterialsWorkspace({ specialty, materials, collections, lastAnswer, answerResults, examples, now }: { specialty: SpecialtyId; materials: Material[]; collections: MaterialCollection[]; lastAnswer: AgentRun | null; answerResults: AgentResultView[]; examples: MaterialExample[]; now: string }) {
  const router = useRouter();
  const { command, upload, pending } = useWorkspace();
  const empty = materials.length === 0;
  const [mode, setMode] = useState<AddMode>(null);
  const [question, setQuestion] = useState("");
  const [sort, setSort] = useState<MaterialSort>("newest");
  const [filter, setFilter] = useState<MaterialFilter>({ format: "all", ownership: "all", collection: "all" });
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const addSection = useRef<HTMLElement>(null);

  const formats = useMemo(() => MATERIAL_FORMAT_ORDER.filter(format => materials.some(material => materialFormat(material) === format)), [materials]);
  const visible = useMemo(() => sortMaterials(filterMaterials(materials, filter), sort), [filter, materials, sort]);

  function resetForm() { setUrl(""); setTitle(""); setNote(""); setMode(null); }
  function openMode(next: AddMode) {
    setMode(next);
    requestAnimationFrame(() => addSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

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

  return <div className={empty ? "ws-materials is-empty" : "ws-materials"}>
    {!empty && <div className="pt-mat-actions" role="group" aria-label="Добавить в библиотеку">
      <button type="button" className="ws-button is-primary is-small" onClick={() => openMode("file")}><Upload size={15} aria-hidden="true" />Загрузить файл</button>
      <button type="button" className="ws-button is-small" onClick={() => openMode("link")}><Link2 size={15} aria-hidden="true" />Добавить ссылку</button>
      <button type="button" className="ws-button is-small" onClick={() => openMode("note")}><NotebookPen size={15} aria-hidden="true" />Написать заметку</button>
    </div>}
    {empty && <Onboarding onMode={openMode} />}

    <section className="ws-materials-ask" aria-labelledby="ws-ask-title">
      <h2 id="ws-ask-title" className="ws-section-title">Спросить по моим материалам</h2>
      <p className="ws-muted">Поиск только по вашей базе. Другим пользователям она недоступна.</p>
      <form className="ws-inline-form" onSubmit={event => void ask(event)}>
        <Search size={17} aria-hidden="true" />
        <label className="sr-only" htmlFor="ws-material-question">Вопрос</label>
        <input id="ws-material-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder={empty ? "Сначала добавьте материалы — затем спросите по ним" : "Например: что в моих материалах про SCORE2"} maxLength={600} />
        <button type="submit" className="ws-button is-primary is-small" disabled={pending || question.trim().length < 2}>Найти</button>
      </form>
      {lastAnswer && <div className="ws-materials-answer">
        <RunTrace run={lastAnswer} connectors={[]} now={now} />
        <ResultList results={answerResults} specialty={specialty} emptyText="Совпадений в ваших материалах нет." />
      </div>}
    </section>

    <section className="ws-section" aria-labelledby="ws-add-title" ref={addSection}>
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
        <p className="ws-muted">Не загружайте данные конкретных пациентов: персональные данные маскируются при индексации, медицинские изображения не принимаются.</p>
        <button type="submit" className="ws-button is-primary" disabled={pending}><Plus size={15} aria-hidden="true" />Загрузить</button>
      </form>}
      {mode === "link" && <form className="ws-add-form" onSubmit={event => void addLink(event)}>
        <label>Ссылка<input type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://pubmed.ncbi.nlm.nih.gov/…" maxLength={2000} /></label>
        <p className="ws-muted">Для PubMed и ссылок с DOI название, журнал и дата подтянутся сами. Для других сайтов добавьте своё название.</p>
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

    {empty
      ? <Examples examples={examples} pending={pending} onAdd={example => void command({ action: "addLink", url: example.url, title: example.title })} />
      : <section className="ws-section" aria-labelledby="ws-library-title">
        <div className="ws-section-head">
          <h2 id="ws-library-title" className="ws-section-title">Библиотека · {countLabel(materials.length, ["материал", "материала", "материалов"])}</h2>
        </div>
        <div className="ws-filters pt-mat-toolbar">
          <label><span className="sr-only">Сортировка</span><select aria-label="Сортировка" value={sort} onChange={event => setSort(event.target.value as MaterialSort)}>{(Object.keys(MATERIAL_SORT_LABEL) as MaterialSort[]).map(key => <option key={key} value={key}>{MATERIAL_SORT_LABEL[key]}</option>)}</select></label>
          <label><span className="sr-only">Формат</span><select aria-label="Формат" value={filter.format} onChange={event => setFilter(current => ({ ...current, format: event.target.value as MaterialFormat | "all" }))}><option value="all">Формат: Все</option>{formats.map(key => <option key={key} value={key}>{`Формат: ${MATERIAL_FORMAT_LABEL[key]}`}</option>)}</select></label>
          <label><span className="sr-only">Источник</span><select aria-label="Источник" value={filter.ownership} onChange={event => setFilter(current => ({ ...current, ownership: event.target.value as SourceOwnership | "all" }))}><option value="all">Источник: Все</option>{(Object.keys(OWNERSHIP_LABEL) as SourceOwnership[]).filter(key => materials.some(material => material.ownership === key)).map(key => <option key={key} value={key}>{`Источник: ${OWNERSHIP_LABEL[key]}`}</option>)}</select></label>
          <label><span className="sr-only">Подборка</span><select aria-label="Подборка" value={filter.collection} onChange={event => setFilter(current => ({ ...current, collection: event.target.value }))}><option value="all">Подборка: Все</option>{collections.map(item => <option key={item.id} value={item.id}>{`Подборка: ${item.name}`}</option>)}</select></label>
        </div>
        <form className="ws-inline-form is-small" onSubmit={event => { event.preventDefault(); if (newCollection.trim()) void command({ action: "createCollection", name: newCollection.trim() }).then(result => { if (result) setNewCollection(""); }); }}>
          <FolderPlus size={16} aria-hidden="true" /><label className="sr-only" htmlFor="ws-new-collection">Новая подборка</label>
          <input id="ws-new-collection" value={newCollection} onChange={event => setNewCollection(event.target.value)} placeholder="Новая подборка" maxLength={80} />
          <button type="submit" className="ws-button is-small" disabled={pending || !newCollection.trim()}>Создать</button>
        </form>
        {collections.length > 0 && <ul className="ws-collections">{collections.map(item => <li key={item.id}><span>{item.name}</span><small>{materials.filter(material => material.collectionIds.includes(item.id)).length}</small><button type="button" aria-label={`Удалить подборку ${item.name}`} onClick={() => void command({ action: "deleteCollection", collectionId: item.id })}><X size={13} /></button></li>)}</ul>}
        {visible.length === 0
          ? <p className="ws-empty">В этом фильтре материалов нет.</p>
          : <ul className="ws-material-list">{visible.map(material => <MaterialItem key={material.id} material={material} specialty={specialty} collections={collections} onCommand={command} />)}</ul>}
      </section>}
  </div>;
}
