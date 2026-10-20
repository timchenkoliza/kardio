"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, CheckCircle2, FilePenLine, FlaskConical, Send, ShieldCheck } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import type { ContentStudioPackage, PublicationDraft } from "@/lib/pharma/content-studio";
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

type StudioResponse = { ok: true; package: ContentStudioPackage; storage: "memory" | "postgres" } | { error: string };

async function studioCommand(body: unknown): Promise<Extract<StudioResponse, { ok: true }>> {
  const response = await fetch("/api/pharma/content-studio", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as StudioResponse;
  if (!response.ok || !("ok" in payload)) throw new Error("error" in payload ? payload.error : "Content Studio временно недоступен");
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

export function PharmaComposer({
  allowed,
  canEdit,
  canRequestReview,
  specialty,
  initialPackages,
}: {
  allowed: boolean;
  canEdit: boolean;
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
      setMessage("Пакет создан: 5 форматов сохранены как рабочие черновики.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать пакет");
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
      setMessage("Пакет передан на review. Редактирование закрыто до решения редакции.");
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
          placeholder={allowed ? "Например: подготовь пакет публикации для кардиологов по материалу о ХСН: статья + чек-лист + карточка события. Добавьте ссылку на исходник, если она есть." : "У текущей роли нет доступа к Content Studio"}
        />
        <div className="ws-composer-bar">
          <div className="ws-composer-tools">
            <span className="ws-route"><FlaskConical size={14} aria-hidden="true" />Beta · {agent.name}</span>
          </div>
          <button type="submit" className="ws-composer-run" disabled={!text.trim() || !allowed || pending} aria-label="Создать пакет"><ArrowUp size={18} /></button>
        </div>
      </div>
      <div className="ws-composer-preview" aria-live="polite">
        <span className="ws-route"><ShieldCheck size={14} aria-hidden="true" />{allowed ? "Brief → Content Studio run → 5 persisted drafts → review." : "Нет grant: агент скрыт и запуск заблокирован."}</span>
        {storage && <span className="ws-route">storage: {storage}</span>}
      </div>
    </form>

    {message && <p role="status" className="ws-success">{message}</p>}

    <section className="ws-section" aria-labelledby="studio-packages-title">
      <div className="ws-section-head">
        <div>
          <h2 id="studio-packages-title" className="ws-section-title">Пакеты публикаций</h2>
          <p className="ws-muted">Это уже сохранённые доменные объекты, а не plan-preview. Медицинские claims намеренно не генерируются до evidence/compliance этапа.</p>
        </div>
      </div>

      {!packages.length ? <div className="ws-empty">
        <p><strong>Пакетов пока нет.</strong></p>
        <p>Вставьте бриф выше. Content Studio создаст Brief, Run и пять редактируемых draft-форматов.</p>
      </div> : packages.map(pkg => <article key={pkg.id} className="ws-section ws-card-block">
        <div className="ws-section-head">
          <div>
            <p className="ws-intro-meta">{STATUS_LABELS[pkg.status]} · {pkg.brief.audience} · {pkg.brief.campaignGoal}</p>
            <h2 className="ws-section-title">Пакет {pkg.id.slice(-8)}</h2>
            <p>{pkg.brief.rawText}</p>
            <p className="ws-muted">Run: {pkg.run.mode} · {pkg.run.note}</p>
            {pkg.brief.sourceUrls.length > 0 && <p className="ws-muted">Исходники: {pkg.brief.sourceUrls.join(" · ")}</p>}
          </div>
          {pkg.status === "draft" && canRequestReview ? <button className="ws-button is-primary" type="button" disabled={pending} onClick={() => void requestReview(pkg.id)}><Send size={14} aria-hidden="true" />На review</button> : pkg.status === "in_review" ? <span className="ws-route"><CheckCircle2 size={14} aria-hidden="true" />Ждёт редакцию</span> : null}
        </div>

        <details>
          <summary>Показать run plan</summary>
          <ol className="ws-plain-list">{pkg.run.steps.map(step => <li key={step}>{step}</li>)}</ol>
        </details>

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
      </article>)}
    </section>
  </div>;
}
