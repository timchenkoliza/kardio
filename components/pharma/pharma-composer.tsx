"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, CheckCircle2, FilePenLine, FileUp, FlaskConical, Link2, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import type { ContentStudioPackage, ContentStudioSourceKind, PublicationDraft } from "@/lib/pharma/content-studio";
import { PHARMA_AGENT_DEFINITIONS, type PharmaOutputKind } from "@/lib/pharma/agents";

const OUTPUT_LABELS: Record<PharmaOutputKind, string> = {
  article: "Статья",
  useful: "Полезное",
  media: "Медиа",
  event: "Событие",
  performance: "Performance",
};

const STATUS_LABELS = {
  draft: "Черновик",
  in_review: "На review",
  approved: "Одобрено",
  published: "Опубликовано",
} as const;

const CLAIM_STATUS_LABELS = {
  allowed: "Можно использовать",
  needs_review: "Нужна проверка",
  blocked: "Заблокировано",
} as const;

const SOURCE_KIND_LABELS: Record<ContentStudioSourceKind, string> = {
  partner_material: "Партнёрский материал",
  external_reference: "Внешний источник",
};

type StudioSuccess = { ok: true; package: ContentStudioPackage; storage: "memory" | "postgres"; notices?: string[] };
type StudioResponse = StudioSuccess | { error: string };

type SourceInput = {
  sourceKind: ContentStudioSourceKind;
  title: string;
  url: string;
  text: string;
};

type SourceUploadInput = {
  sourceKind: ContentStudioSourceKind;
  title: string;
  url: string;
  file: File;
};

async function studioCommand(body: unknown): Promise<StudioSuccess> {
  const response = await fetch("/api/pharma/content-studio", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as StudioResponse;
  if (!response.ok || !("ok" in payload)) throw new Error("error" in payload ? payload.error : "Content Studio временно недоступен");
  return payload;
}

async function uploadSourceCommand(form: FormData): Promise<StudioSuccess> {
  const response = await fetch("/api/pharma/content-studio/source-upload", { method: "POST", body: form });
  const payload = await response.json() as StudioResponse;
  if (!response.ok || !("ok" in payload)) throw new Error("error" in payload ? payload.error : "Не удалось загрузить источник");
  return payload;
}

function DraftCard({ draft, editable, editing, pending, onEdit, onCancel, onSave }: {
  draft: PublicationDraft;
  editable: boolean;
  editing: { title: string; content: string } | null;
  pending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (title: string, content: string) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? draft.title);
  const [content, setContent] = useState(editing?.content ?? draft.content);

  if (editing) return <article className="ws-card-block">
    <p className="ws-intro-meta">{OUTPUT_LABELS[draft.kind]} · редактирование</p>
    <label className="sr-only" htmlFor={`draft-title-${draft.id}`}>Заголовок</label>
    <input id={`draft-title-${draft.id}`} value={title} onChange={event => setTitle(event.target.value)} maxLength={240} style={{ width: "100%", marginBottom: 10 }} />
    <label className="sr-only" htmlFor={`draft-content-${draft.id}`}>Содержание</label>
    <textarea id={`draft-content-${draft.id}`} value={content} onChange={event => setContent(event.target.value)} rows={12} maxLength={12000} style={{ width: "100%" }} />
    <div className="ws-result-actions">
      <button className="ws-button is-primary" type="button" disabled={pending || !title.trim() || !content.trim()} onClick={() => onSave(title, content)}>Сохранить</button>
      <button className="ws-button" type="button" disabled={pending} onClick={onCancel}>Отмена</button>
    </div>
  </article>;

  return <article className="ws-card-block">
    <p className="ws-intro-meta">{OUTPUT_LABELS[draft.kind]} · {STATUS_LABELS[draft.status]}</p>
    <h3>{draft.title}</h3>
    <p className="ws-muted">Evidence: не проверено · {draft.disclosure}</p>
    <div style={{ whiteSpace: "pre-wrap" }}>{draft.content}</div>
    {editable && <div className="ws-result-actions">
      <button className="ws-button" type="button" disabled={pending} onClick={onEdit}><FilePenLine size={14} aria-hidden="true" />Редактировать</button>
    </div>}
  </article>;
}

function SourceForm({ packageId, pending, onAdd, onUpload }: {
  packageId: string;
  pending: boolean;
  onAdd: (packageId: string, input: SourceInput) => void;
  onUpload: (packageId: string, input: SourceUploadInput) => void;
}) {
  const [sourceKind, setSourceKind] = useState<ContentStudioSourceKind>("partner_material");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || text.trim().length < 20 || pending) return;
    onAdd(packageId, { sourceKind, title: title.trim(), url: url.trim(), text: text.trim() });
    setTitle("");
    setUrl("");
    setText("");
  }

  function upload() {
    if (!file || pending) return;
    onUpload(packageId, { sourceKind, title: title.trim(), url: url.trim(), file });
    setTitle("");
    setUrl("");
    setText("");
    setFile(null);
  }

  return <form className="ws-card-block" onSubmit={submit}>
    <p className="ws-intro-meta">Source ingestion</p>
    <h3>Добавить исходный материал</h3>
    <p className="ws-muted">Можно вставить текст или загрузить файл. URL используется для source-policy. По ссылке страница автоматически не скачивается: claims строятся только по реально переданному тексту.</p>
    <div className="ws-result-actions">
      <label><span className="sr-only">Тип источника</span><select value={sourceKind} onChange={event => setSourceKind(event.target.value as ContentStudioSourceKind)} disabled={pending}>
        <option value="partner_material">Партнёрский материал</option>
        <option value="external_reference">Внешний источник</option>
      </select></label>
    </div>
    <label className="sr-only" htmlFor={`source-title-${packageId}`}>Название источника</label>
    <input id={`source-title-${packageId}`} value={title} onChange={event => setTitle(event.target.value)} maxLength={240} placeholder="Название материала или исследования" style={{ width: "100%", marginTop: 10 }} />
    <label className="sr-only" htmlFor={`source-url-${packageId}`}>URL источника</label>
    <input id={`source-url-${packageId}`} value={url} onChange={event => setUrl(event.target.value)} maxLength={1200} placeholder="https://… — необязательно для партнёрского исходника" style={{ width: "100%", marginTop: 10 }} />
    <label className="sr-only" htmlFor={`source-text-${packageId}`}>Текст источника</label>
    <textarea id={`source-text-${packageId}`} value={text} onChange={event => setText(event.target.value)} maxLength={30000} rows={8} placeholder="Вставьте фрагмент исходного материала. Система выделит проверяемые медицинские claims, но не будет считать их доказанными автоматически." style={{ width: "100%", marginTop: 10 }} />
    <div className="ws-result-actions">
      <button className="ws-button is-primary" type="submit" disabled={pending || !title.trim() || text.trim().length < 20}><Link2 size={14} aria-hidden="true" />Добавить текст и разобрать</button>
    </div>
    <div style={{ marginTop: 16 }}>
      <label htmlFor={`source-file-${packageId}`}><strong>Или файл</strong></label>
      <input id={`source-file-${packageId}`} type="file" accept=".txt,.md,.markdown,.csv,.tsv,.html,.htm,.xhtml,.docx,.pdf,text/plain,text/markdown,text/csv,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={pending} onChange={event => setFile(event.target.files?.[0] ?? null)} style={{ display: "block", marginTop: 8 }} />
      <p className="ws-muted">До 4 МБ. TXT/MD/CSV/HTML/DOCX разбираются в текст. PDF сейчас вернёт честное сообщение, что parser ещё не подключён. Персональные данные маскируются до Claim Map.</p>
      <button className="ws-button" type="button" disabled={pending || !file} onClick={upload}><FileUp size={14} aria-hidden="true" />Загрузить файл и разобрать</button>
    </div>
  </form>;
}

export function PharmaComposer({
  allowed,
  canEdit,
  canUploadSource,
  canRequestReview,
  specialty,
  initialPackages,
}: {
  allowed: boolean;
  canEdit: boolean;
  canUploadSource: boolean;
  canRequestReview: boolean;
  specialty: SpecialtyId;
  initialPackages: ContentStudioPackage[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [packages, setPackages] = useState(initialPackages);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storage, setStorage] = useState<"memory" | "postgres" | null>(null);
  const [editing, setEditing] = useState<{ packageId: string; draftId: string; title: string; content: string } | null>(null);
  const agent = PHARMA_AGENT_DEFINITIONS.content_studio;

  function replacePackage(pkg: ContentStudioPackage) {
    setPackages(current => [pkg, ...current.filter(item => item.id !== pkg.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || !allowed || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await studioCommand({ action: "create", specialty, briefText: value });
      replacePackage(result.package);
      setStorage(result.storage);
      setText("");
      setMessage("Пакет создан. Следующий обязательный шаг — добавить исходный материал и построить Claim Map.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать пакет");
    } finally {
      setPending(false);
    }
  }

  async function addSource(packageId: string, input: SourceInput) {
    if (!canUploadSource || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await studioCommand({ action: "addSource", specialty, packageId, ...input });
      replacePackage(result.package);
      setStorage(result.storage);
      const claims = result.package.claims.length;
      setMessage(claims ? `Источник добавлен. Claim Map: ${claims} проверяемых утверждений.` : "Источник добавлен, но проверяемые медицинские claims не обнаружены. Добавьте более содержательный фрагмент.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить источник");
    } finally {
      setPending(false);
    }
  }

  async function uploadSource(packageId: string, input: SourceUploadInput) {
    if (!canUploadSource || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("specialty", specialty);
      form.set("packageId", packageId);
      form.set("sourceKind", input.sourceKind);
      form.set("title", input.title);
      form.set("url", input.url);
      form.set("file", input.file);
      const result = await uploadSourceCommand(form);
      replacePackage(result.package);
      setStorage(result.storage);
      const prefix = result.notices?.length ? `${result.notices.join(" ")} ` : "";
      setMessage(`${prefix}Файл разобран. Claim Map: ${result.package.claims.length} проверяемых утверждений.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить источник");
    } finally {
      setPending(false);
    }
  }

  async function saveDraft(packageId: string, draftId: string, title: string, content: string) {
    if (!canEdit || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await studioCommand({ action: "updateDraft", specialty, packageId, draftId, title, content });
      replacePackage(result.package);
      setStorage(result.storage);
      setEditing(null);
      setMessage("Черновик сохранён.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить черновик");
    } finally {
      setPending(false);
    }
  }

  async function requestReview(packageId: string) {
    if (!canRequestReview || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await studioCommand({ action: "requestReview", specialty, packageId });
      replacePackage(result.package);
      setStorage(result.storage);
      setEditing(null);
      setMessage("Пакет передан на review. Редактирование и добавление источников закрыты до решения редакции.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить пакет на review");
    } finally {
      setPending(false);
    }
  }

  return <div>
    <form className="ws-composer" onSubmit={submit} aria-label="Поручить задачу агенту для фармы">
      <div className="ws-composer-box">
        <label className="sr-only" htmlFor="pharma-composer-input">Бриф или материал для публикации</label>
        <textarea
          id="pharma-composer-input"
          rows={5}
          maxLength={6000}
          value={text}
          onChange={event => setText(event.target.value)}
          disabled={!allowed || pending}
          placeholder={allowed ? "Например: подготовь пакет публикации для кардиологов по материалу о ХСН: статья + чек-лист + карточка события." : "У текущей роли нет доступа к Content Studio"}
        />
        <div className="ws-composer-bar">
          <div className="ws-composer-tools">
            <span className="ws-route"><FlaskConical size={14} aria-hidden="true" />Beta · {agent.name}</span>
          </div>
          <button type="submit" className="ws-composer-run" disabled={!text.trim() || !allowed || pending} aria-label="Создать пакет"><ArrowUp size={18} /></button>
        </div>
      </div>
      <div className="ws-composer-preview" aria-live="polite">
        <span className="ws-route"><ShieldCheck size={14} aria-hidden="true" />{allowed ? "Brief → Sources → Claim Map → Compliance → Drafts → Review." : "Нет grant: агент скрыт и запуск заблокирован."}</span>
        {storage && <span className="ws-route">storage: {storage}</span>}
      </div>
    </form>

    {message && <p role="status" className="ws-success">{message}</p>}

    <section className="ws-section" aria-labelledby="studio-packages-title">
      <div className="ws-section-head">
        <div>
          <h2 id="studio-packages-title" className="ws-section-title">Пакеты публикаций</h2>
          <p className="ws-muted">Партнёрский исходник отделён от evidence. Claim Map показывает, какие утверждения требуют внешней проверки и что заблокировано source-policy.</p>
        </div>
      </div>

      {!packages.length ? <div className="ws-empty">
        <p><strong>Пакетов пока нет.</strong></p>
        <p>Вставьте бриф выше. Content Studio создаст Brief, Run и пять draft-форматов, после чего попросит доказательную базу.</p>
      </div> : packages.map(pkg => {
        const reviewReady = pkg.sources.length > 0 && pkg.claims.length > 0;
        return <article key={pkg.id} className="ws-section ws-card-block">
          <div className="ws-section-head">
            <div>
              <p className="ws-intro-meta">{STATUS_LABELS[pkg.status]} · {pkg.brief.audience} · {pkg.brief.campaignGoal}</p>
              <h2 className="ws-section-title">Пакет {pkg.id.slice(-8)}</h2>
              <p>{pkg.brief.rawText}</p>
              <p className="ws-muted">Run: {pkg.run.mode} · {pkg.run.note}</p>
            </div>
            {pkg.status === "draft" && canRequestReview ? <button className="ws-button is-primary" type="button" disabled={pending || !reviewReady} title={reviewReady ? undefined : "Сначала добавьте источник и получите Claim Map"} onClick={() => void requestReview(pkg.id)}><Send size={14} aria-hidden="true" />На review</button> : pkg.status === "in_review" ? <span className="ws-route"><CheckCircle2 size={14} aria-hidden="true" />Ждёт редакцию</span> : null}
          </div>

          <details>
            <summary>Показать run plan</summary>
            <ol className="ws-plain-list">{pkg.run.steps.map(step => <li key={step}>{step}</li>)}</ol>
          </details>

          <section className="ws-section" aria-label="Источники и Claim Map">
            <div className="ws-section-head">
              <div>
                <h3 className="ws-section-title">Источники и Claim Map</h3>
                <p className="ws-muted">Gate: разрешено {pkg.complianceSummary.allowed} · нужна проверка {pkg.complianceSummary.needsReview} · заблокировано {pkg.complianceSummary.blocked}.</p>
              </div>
            </div>

            {pkg.status === "draft" && canUploadSource && <SourceForm packageId={pkg.id} pending={pending} onAdd={(packageId, input) => void addSource(packageId, input)} onUpload={(packageId, input) => void uploadSource(packageId, input)} />}

            {pkg.sources.length > 0 && <div className="ws-agent-grid is-wide" style={{ marginTop: 16 }}>
              {pkg.sources.map(source => <article key={source.id} className="ws-card-block">
                <p className="ws-intro-meta">{SOURCE_KIND_LABELS[source.kind]} · {source.policyLabel}</p>
                <h3>{source.title}</h3>
                {source.url ? <p><a className="ws-text-link" href={source.url} target="_blank" rel="noreferrer"><Link2 size={14} aria-hidden="true" />Открыть источник</a></p> : <p className="ws-muted">URL не указан</p>}
                {source.policyNote && <p className="ws-muted">{source.policyNote}</p>}
                <details><summary>Показать переданный текст</summary><div style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{source.suppliedText}</div></details>
              </article>)}
            </div>}

            {pkg.claims.length ? <div style={{ marginTop: 16 }}>
              {pkg.claims.map((claim, index) => <article key={claim.id} className="ws-card-block" style={{ marginTop: 10 }}>
                <p className="ws-intro-meta">Claim {index + 1} · {CLAIM_STATUS_LABELS[claim.complianceStatus]} · evidence {claim.verificationStatus}</p>
                <p><strong>{claim.text}</strong></p>
                {claim.verificationNote && <p className="ws-muted">Evidence-check: {claim.verificationNote}</p>}
                <ul className="ws-plain-list">{claim.complianceReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
                {claim.complianceStatus === "blocked" ? <p className="ws-route"><ShieldAlert size={14} aria-hidden="true" />Не использовать в генерации</p> : <p className="ws-route"><ShieldCheck size={14} aria-hidden="true" />До medical review не переносить в финальный материал</p>}
              </article>)}
            </div> : pkg.sources.length > 0 ? <div className="ws-empty" style={{ marginTop: 16 }}><p><strong>Claim Map пуст.</strong></p><p>В добавленном тексте не найдено достаточно конкретных медицинских утверждений. Review пока недоступен.</p></div> : null}
          </section>

          <div className="ws-agent-grid is-wide" style={{ marginTop: 16 }}>
            {pkg.drafts.map(draft => {
              const isEditing = editing?.packageId === pkg.id && editing.draftId === draft.id;
              return <DraftCard
                key={`${draft.id}:${draft.updatedAt}:${isEditing ? "edit" : "view"}`}
                draft={draft}
                editable={pkg.status === "draft" && canEdit}
                editing={isEditing ? { title: editing.title, content: editing.content } : null}
                pending={pending}
                onEdit={() => setEditing({ packageId: pkg.id, draftId: draft.id, title: draft.title, content: draft.content })}
                onCancel={() => setEditing(null)}
                onSave={(title, content) => void saveDraft(pkg.id, draft.id, title, content)}
              />;
            })}
          </div>
        </article>;
      })}
    </section>
  </div>;
}
