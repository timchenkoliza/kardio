"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, SlidersHorizontal } from "lucide-react";
import type { ResearchJob } from "@/lib/agents/research-jobs";
import { normalizeResearchDomains } from "@/lib/agents/research-options";
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

async function responseError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  } catch {
    // fall through
  }
  return "Не получилось запустить исследование. Попробуйте ещё раз.";
}

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
  const { notify, pending } = useWorkspace();
  const [text, setText] = useState(initialText.slice(0, 1200));
  const [mode, setMode] = useState<PhysicianResearchMode>(initialOptions.mode);
  const [sourceScope, setSourceScope] = useState<PhysicianResearchSourceScope>(initialOptions.sourceScope);
  const [contentScope, setContentScope] = useState<PhysicianResearchContentScope>(initialOptions.contentScope);
  const [includeDomainsText, setIncludeDomainsText] = useState(initialOptions.includeDomains.join(", "));
  const [excludeDomainsText, setExcludeDomainsText] = useState(initialOptions.excludeDomains.join(", "));
  const [busy, setBusy] = useState(false);

  const options = useMemo<PhysicianResearchViewOptions>(() => {
    const excludeDomains = normalizeResearchDomains([excludeDomainsText]);
    return {
      mode,
      sourceScope,
      contentScope,
      includeDomains: normalizeResearchDomains([includeDomainsText]).filter(domain => !excludeDomains.includes(domain)),
      excludeDomains,
    };
  }, [mode, sourceScope, contentScope, includeDomainsText, excludeDomainsText]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = text.trim();
    if (value.length < 2 || busy || pending) return;
    setBusy(true);
    const background = mode === "academic";
    try {
      const response = await fetch(background ? "/api/agents/research/background" : "/api/agents/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty, text: value, ...options }),
      });
      if (!response.ok) {
        notify(await responseError(response), "error");
        return;
      }
      const result = await response.json() as { runId?: string; notices?: string[]; job?: ResearchJob };
      if (background) {
        if (!result.job) return;
        if (result.job.status === "queued") notify("Исследование запущено в фоне. Можно перейти в другой раздел.");
        router.push(`/${specialty}/agents/research?job=${encodeURIComponent(result.job.id)}&${researchViewQuery(options)}`);
        return;
      }
      if (!result.runId) return;
      if (result.notices?.length) notify(result.notices[0]);
      router.push(`/${specialty}/agents/research?run=${encodeURIComponent(result.runId)}&${researchViewQuery(options)}`);
    } catch {
      notify("Нет связи с сервером. Проверьте подключение.", "error");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
  }

  return <form className="ws-research-composer" onSubmit={event => void submit(event)} aria-label="Разбор по исследованиям">
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
        </button>)}
      </div>
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
        <div className="ws-composer-bar ws-research-submit-row">
          <button type="submit" className="ws-composer-run" disabled={busy || pending || text.trim().length < 2} aria-label={mode === "academic" ? "Запустить фоновое исследование" : "Начать исследование"}>
            {busy || pending ? <Loader2 size={18} className="ws-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>

    <div className="ws-research-filters" aria-label="Фильтры поиска">
      <SlidersHorizontal size={16} aria-hidden="true" />
      <label>Источники
        <select value={sourceScope} onChange={event => setSourceScope(event.target.value as PhysicianResearchSourceScope)}>
          <option value="all">РФ + международные</option>
          <option value="russia">Только РФ (без PubMed)</option>
          <option value="international">Только международные</option>
        </select>
      </label>
      <label>Тип
        <select value={contentScope} onChange={event => setContentScope(event.target.value as PhysicianResearchContentScope)}>
          <option value="all">Клинрекомендации + исследования</option>
          <option value="guidelines">Только клинрекомендации (без статей PubMed)</option>
          <option value="research">Только исследования</option>
        </select>
      </label>
      <details className="ws-research-domain-controls">
        <summary>Конкретные сайты{options.includeDomains.length || options.excludeDomains.length ? ` · ${options.includeDomains.length + options.excludeDomains.length}` : ""}</summary>
        <div className="ws-research-domain-fields">
          <label>Искать только здесь
            <input value={includeDomainsText} onChange={event => setIncludeDomainsText(event.target.value)} placeholder="pubmed.ncbi.nlm.nih.gov, escardio.org" />
          </label>
          <label>Исключить
            <input value={excludeDomainsText} onChange={event => setExcludeDomainsText(event.target.value)} placeholder="example.com" />
          </label>
          <small>До 8 доменов в каждом поле. Исключение имеет приоритет. Можно вставлять домены или URL.</small>
        </div>
      </details>
    </div>
  </form>;
}
