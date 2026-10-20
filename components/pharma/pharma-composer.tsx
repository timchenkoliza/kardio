"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, CheckCircle2, FilePenLine, FileUp, Link2, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import type { ContentStudioPackage, ContentStudioSourceKind, PublicationDraft } from "@/lib/pharma/content-studio";
import type { PharmaOutputKind } from "@/lib/pharma/agents";

const OUTPUT_LABELS: Record<PharmaOutputKind, string> = {
  article: "Статья",
  useful: "Полезное",
  media: "Медиа",
  event: "Событие",
  brand_page: "Бренд-страница",
};

function outputLabel(kind: string): string {
  return OUTPUT_LABELS[kind as PharmaOutputKind] ?? "Формат";
}

const STATUS_LABELS = {
  draft: "Черновик",
  in_review: "На проверке",
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
  if (!response.ok || !("ok" in payload)) throw new Error("error" in payload ? payload.error : "Студия контента временно недоступна");
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
    <p className="ws-intro-meta">{outputLabel(draft.kind)} · редактирование</p>
    <label className="ws-field"><span>Заголовок</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={240} /></label>
    <label className="ws-field"><span>Текст</span><textarea value={content} onChange={event => setContent(event.target.value)} rows={12} maxLength={12000} /></label>
    <div className="ws-result-actions">
      <button className="ws-button is-primary" type="button" disabled={pending || !title.trim() || !content.trim()} onClick={() => onSave(title, content)}>Сохранить</button>
      <button className="ws-button" type="button" disabled={pending} onClick={onCancel}>Отмена</button>
    </div>
  </article>;

  return <article className="ws-card-block ws-studio-draft">
    <p className="ws-intro-meta">{outputLabel(draft.kind)} · {STATUS_LABELS[draft.status]}</p>
    <h3>{draft.title}</h3>
    <details><summary>Заготовка</summary><div className="ws-prewrap">{draft.content}</div></details>
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

  return <form className="ws-card-block ws-studio-source" onSubmit={submit}>
    <h3>Добавить исходный материал</h3>
    <p className="ws-muted">Утверждения выделяются только из переданного текста или файла; ссылка нужна для проверки источника.</p>
    <label className="ws-field"><span>Тип</span><select value={sourceKind} onChange={event => setSourceKind(event.target.value as ContentStudioSourceKind)} disabled={pending}>
      <option value="partner_material">Материал партнёра</option>
      <option value="external_reference">Внешний источник</option>
    </select></label>
    <label className="ws-field"><span>Название</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={240} placeholder="Название материала или исследования" /></label>
    <label className="ws-field"><span>Ссылка</span><input value={url} onChange={event => setUrl(event.target.value)} maxLength={1200} placeholder="https://…" /></label>
    <label className="ws-field"><span>Текст</span><textarea value={text} onChange={event => setText(event.target.value)} maxLength={30000} rows={6} placeholder="Вставьте фрагмент материала" /></label>
    <div className="ws-result-actions">
      <button className="ws-button is-primary" type="submit" disabled={pending || !title.trim() || text.trim().length < 20}><Link2 size={14} aria-hidden="true" />Разобрать текст</button>
      <label className="ws-button is-quiet"><FileUp size={14} aria-hidden="true" />{file ? file.name : "Выбрать файл"}<input className="sr-only" type="file" accept=".txt,.md,.markdown,.csv,.tsv,.html,.htm,.xhtml,.docx,.pdf,text/plain,text/markdown,text/csv,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={pending} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      {file && <button className="ws-button" type="button" disabled={pending} onClick={upload}>Разобрать файл</button>}
    </div>
    <p className="ws-muted">TXT, MD, CSV, HTML, DOCX до 4 МБ. Персональные данные скрываются перед разбором.</p>
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
  const [editing, setEditing] = useState<{ packageId: string; draftId: string; title: string; content: string } | null>(null);

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
      setText("");
      setMessage("Пакет создан. Добавьте исходный материал — из него будут выделены медицинские утверждения.");
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
      const claims = result.package.claims.length;
      setMessage(claims ? `Источник добавлен. Утверждений для проверки: ${claims}.` : "Источник добавлен, но медицинских утверждений в нём нет. Добавьте более содержательный фрагмент.");
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
      const prefix = result.notices?.length ? `${result.notices.join(" ")} ` : "";
      setMessage(`${prefix}Файл разобран. Утверждений для проверки: ${result.package.claims.length}.`);
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
      setEditing(null);
      setMessage("Пакет отправлен на проверку редакции.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить пакет на проверку");
    } finally {
      setPending(false);
    }
  }

  return <div className="ws-studio">
    <form className="ws-composer" onSubmit={submit} aria-label="Задача для студии контента">
      <div className="ws-composer-box">
        <label className="sr-only" htmlFor="pharma-composer-input">Бриф или материал для публикации</label>
        <textarea
          id="pharma-composer-input"
          rows={5}
          maxLength={6000}
          value={text}
          onChange={event => setText(event.target.value)}
          disabled={!allowed || pending}
          placeholder={allowed ? "Например: материалы для кардиологов о ХСН — статья, чек-лист и анонс вебинара" : "Студия контента недоступна для вашей роли"}
        />
        <div className="ws-composer-bar">
          <div className="ws-composer-tools" />
          <button type="submit" className="ws-composer-run" disabled={!text.trim() || !allowed || pending} aria-label="Создать пакет"><ArrowUp size={18} /></button>
        </div>
      </div>
    </form>

    {message && <p role="status" className="ws-success">{message}</p>}

    {packages.length > 0 && <section className="ws-section" aria-labelledby="studio-packages-title">
      <h2 id="studio-packages-title" className="ws-section-title">Пакеты публикаций</h2>
      {packages.map(pkg => {
        const reviewReady = pkg.sources.length > 0 && pkg.claims.length > 0;
        return <article key={pkg.id} className="ws-section ws-card-block">
          <div className="ws-section-head">
            <div>
              <p className="ws-intro-meta">{STATUS_LABELS[pkg.status]} · {pkg.brief.audience} · {pkg.brief.campaignGoal}</p>
              <h3 className="ws-section-title">{pkg.brief.rawText.length > 96 ? `${pkg.brief.rawText.slice(0, 95)}…` : pkg.brief.rawText}</h3>
            </div>
            {pkg.status === "draft" && canRequestReview ? <button className="ws-button is-primary" type="button" disabled={pending || !reviewReady} title={reviewReady ? undefined : "Сначала добавьте источник с медицинскими утверждениями"} onClick={() => void requestReview(pkg.id)}><Send size={14} aria-hidden="true" />На проверку</button> : pkg.status === "in_review" ? <span className="ws-route"><CheckCircle2 size={14} aria-hidden="true" />Ждёт редакцию</span> : null}
          </div>

          <section className="ws-studio-claims" aria-label="Источники и утверждения">
            <h4>Источники и утверждения</h4>
            {pkg.claims.length > 0 && <p className="ws-muted">Можно использовать: {pkg.complianceSummary.allowed} · нужна проверка: {pkg.complianceSummary.needsReview} · заблокировано: {pkg.complianceSummary.blocked}</p>}

            {pkg.sources.length > 0 && <ul className="ws-studio-list">
              {pkg.sources.map(source => <li key={source.id}>
                <p className="ws-intro-meta">{SOURCE_KIND_LABELS[source.kind]} · {source.policyLabel}</p>
                <strong>{source.title}</strong>
                {source.url && <a className="ws-text-link" href={source.url} target="_blank" rel="noreferrer"><Link2 size={14} aria-hidden="true" />Открыть источник</a>}
                {source.policyNote && <p className="ws-muted">{source.policyNote}</p>}
                <details><summary>Переданный текст</summary><div className="ws-prewrap">{source.suppliedText}</div></details>
              </li>)}
            </ul>}

            {pkg.claims.length ? <ol className="ws-studio-list">
              {pkg.claims.map(claim => <li key={claim.id}>
                <p className={claim.complianceStatus === "blocked" ? "ws-route is-blocked" : "ws-route"}>{claim.complianceStatus === "blocked" ? <ShieldAlert size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}{CLAIM_STATUS_LABELS[claim.complianceStatus]}</p>
                <strong>{claim.text}</strong>
                {claim.verificationNote && <p className="ws-muted">{claim.verificationNote}</p>}
                <ul className="ws-plain-list">{claim.complianceReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
              </li>)}
            </ol> : pkg.sources.length > 0 ? <p className="ws-empty">В добавленном тексте нет конкретных медицинских утверждений — проверка пока недоступна.</p> : null}

            {pkg.status === "draft" && canUploadSource && <SourceForm packageId={pkg.id} pending={pending} onAdd={(packageId, input) => void addSource(packageId, input)} onUpload={(packageId, input) => void uploadSource(packageId, input)} />}
          </section>

          <div className="ws-studio-drafts">
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
    </section>}
  </div>;
}
