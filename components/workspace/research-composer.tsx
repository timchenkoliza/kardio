"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, Search, SlidersHorizontal } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import {
  RESEARCH_MODE_OPTIONS,
  researchViewQuery,
  type PhysicianResearchContentScope,
  type PhysicianResearchMode,
  type PhysicianResearchSourceScope,
  type PhysicianResearchViewOptions,
} from "@/lib/ui/physician-research-view";
import { useWorkspace } from "./workspace-provider";

export function ResearchComposer({
  specialty,
  initialText = "",
  initialOptions,
}: {
  specialty: SpecialtyId;
  initialText?: string;
  initialOptions: PhysicianResearchViewOptions;
}) {
  const router = useRouter();
  const { command, pending } = useWorkspace();
  const [text, setText] = useState(initialText.slice(0, 1200));
  const [mode, setMode] = useState<PhysicianResearchMode>(initialOptions.mode);
  const [sourceScope, setSourceScope] = useState<PhysicianResearchSourceScope>(initialOptions.sourceScope);
  const [contentScope, setContentScope] = useState<PhysicianResearchContentScope>(initialOptions.contentScope);
  const [busy, setBusy] = useState(false);

  const options: PhysicianResearchViewOptions = { mode, sourceScope, contentScope };

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = text.trim();
    if (value.length < 2 || busy || pending) return;
    setBusy(true);
    const result = await command({ action: "runTask", text: value, agentId: "research" }, { refresh: false });
    setBusy(false);
    if (!result?.runId) return;
    router.push(`/${specialty}/agents/research?run=${encodeURIComponent(result.runId)}&${researchViewQuery(options)}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
  }

  return <form className="ws-research-composer" onSubmit={event => void submit(event)} aria-label="Исследовать тему">
    <fieldset className="ws-research-modes">
      <legend>Что получить</legend>
      <div className="ws-research-mode-grid">
        {RESEARCH_MODE_OPTIONS.map(option => <button
          type="button"
          key={option.id}
          className={mode === option.id ? "ws-research-mode is-selected" : "ws-research-mode"}
          aria-pressed={mode === option.id}
          onClick={() => setMode(option.id)}
        >
          <strong>{option.label}</strong>
          <span>{option.description}</span>
          <small>{option.estimate} · {option.sources}</small>
        </button>)}
      </div>
      <p className="ws-research-estimate-note">Сейчас режимы меняют форму результата, а не глубину поиска. Отдельный глубокий академический поиск и его ETA подключим после замера реальных запусков.</p>
    </fieldset>

    <div className="ws-composer is-compact">
      <div className="ws-composer-box">
        <label className="sr-only" htmlFor="research-composer-input">Что хотите исследовать?</label>
        <textarea
          id="research-composer-input"
          value={text}
          onChange={event => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          maxLength={1200}
          placeholder="Например: данные о ПОАК при ФП и промежуточном риске инсульта"
        />
        <div className="ws-composer-bar">
          <div className="ws-composer-tools"><span className="ws-route"><Search size={14} aria-hidden="true" />Поиск начнётся сразу — план перед стартом не нужен</span></div>
          <button type="submit" className="ws-composer-run" disabled={busy || pending || text.trim().length < 2} aria-label="Начать исследование">
            {busy || pending ? <Loader2 size={18} className="ws-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>

    <div className="ws-research-filters" aria-label="Фильтры выдачи">
      <SlidersHorizontal size={16} aria-hidden="true" />
      <label>Источники
        <select value={sourceScope} onChange={event => setSourceScope(event.target.value as PhysicianResearchSourceScope)}>
          <option value="all">РФ + международные</option>
          <option value="russia">Только РФ</option>
          <option value="international">Только международные</option>
        </select>
      </label>
      <label>Тип
        <select value={contentScope} onChange={event => setContentScope(event.target.value as PhysicianResearchContentScope)}>
          <option value="all">Клинрекомендации + исследования</option>
          <option value="guidelines">Только клинрекомендации</option>
          <option value="research">Только исследования</option>
        </select>
      </label>
      <Link href={`/${specialty}/settings`} className="ws-text-link">Конкретные сайты — в настройках</Link>
    </div>
  </form>;
}
