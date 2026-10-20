"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowUp, FlaskConical, ShieldCheck } from "lucide-react";
import { canAccessAgent } from "@/lib/access/agent-entitlements";
import { PHARMA_AGENT_DEFINITIONS, planContentStudio } from "@/lib/pharma/agents";

const OUTPUT_LABELS = {
  article: "Статья",
  useful: "Полезное",
  media: "Медиа",
  event: "Событие",
  performance: "Performance",
} as const;

export function PharmaComposer() {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const agent = PHARMA_AGENT_DEFINITIONS.content_studio;
  const allowed = canAccessAgent("pharma", agent.id);
  const plan = useMemo(() => submitted ? planContentStudio(submitted) : null, [submitted]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || !allowed) return;
    setSubmitted(value);
  }

  return <div>
    <form className="ws-composer" onSubmit={submit} aria-label="Поручить задачу агенту для фармы">
      <div className="ws-composer-box">
        <label className="sr-only" htmlFor="pharma-composer-input">Бриф или материал для публикации</label>
        <textarea
          id="pharma-composer-input"
          rows={4}
          maxLength={4000}
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder="Например: подготовь пакет публикации для кардиологов по материалу о ХСН: статья + чек-лист + карточка события"
        />
        <div className="ws-composer-bar">
          <div className="ws-composer-tools">
            <span className="ws-route"><FlaskConical size={14} aria-hidden="true" />Beta · {agent.name}</span>
          </div>
          <button type="submit" className="ws-composer-run" disabled={!text.trim() || !allowed} aria-label="Собрать план"><ArrowUp size={18} /></button>
        </div>
      </div>
      <div className="ws-composer-preview" aria-live="polite">
        <span className="ws-route"><ShieldCheck size={14} aria-hidden="true" />Доступ: фарма / редакция / администратор. Для врача этот агент скрыт.</span>
      </div>
    </form>

    {plan && <section className="ws-section ws-card-block" aria-labelledby="pharma-plan-title">
      <div className="ws-section-head">
        <div>
          <p className="ws-intro-meta">Маршрутизация готова</p>
          <h2 id="pharma-plan-title" className="ws-section-title">{agent.name}</h2>
          <p className="ws-muted">Первый коммит показывает entitlement + единый input + прозрачный план. Генерация и публикация ещё не подключены и не симулируются.</p>
        </div>
      </div>
      <ol className="ws-plain-list">{plan.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <div className="ws-reasons" aria-label="Планируемые форматы">
        {plan.outputs.map(output => <span key={output}>{OUTPUT_LABELS[output]}</span>)}
      </div>
    </section>}
  </div>;
}
