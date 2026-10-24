"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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
  modeFromProfile = false,
  focusFilters = false,
  pubmedExcluded = false,
  excludedJournals = [],
}: {
  specialty: SpecialtyId;
  initialText?: string;
  initialOptions: PhysicianResearchViewOptions;
  /** The selected «Что получить» is the profile's default (no mode in the link): said under the switch. */
  modeFromProfile?: boolean;
  /** Opened by «Повторить с другими источниками»: the filters are what the physician came to change. */
  focusFilters?: boolean;
  /** Profile settings the review's own filters cannot override, named before the run. */
  pubmedExcluded?: boolean;
  excludedJournals?: readonly string[];
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
  const filtersRef = useRef<HTMLDivElement>(null);
  // Scrolled only as far as the filters need and the way back allows: «← К результату» never goes under the sticky
  // header (R1 round 3, A №8).
  useEffect(() => {
    const filters = filtersRef.current;
    if (!focusFilters || !filters) return;
    const need = filters.getBoundingClientRect().bottom - window.innerHeight;
    if (need <= 0) return;
    const sticky = Array.from(document.querySelectorAll<HTMLElement>("header")).find(element => ["sticky", "fixed"].includes(getComputedStyle(element).position));
    const back = document.querySelector<HTMLElement>(".ws-back");
    const room = back ? back.getBoundingClientRect().top - (sticky?.getBoundingClientRect().bottom ?? 0) - 8 : need;
    const by = Math.min(need, room);
    if (by > 0) window.scrollBy(0, by);
  }, [focusFilters]);

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
        if (result.job.status === "queued") notify("Исследование запущено в фоне. Можно перейти в другой раздел — разбор будет в «Истории».");
        setText("");
        router.push(`/${specialty}/agents/research?job=${encodeURIComponent(result.job.id)}&${researchViewQuery(options)}`);
        return;
      }
      if (!result.runId) return;
      if (result.notices?.length) notify(result.notices[0]);
      // One address per review: the result page, where it is refined and saved, as from «История».
      router.push(`/${specialty}/ask?run=${encodeURIComponent(result.runId)}`);
    } catch {
      notify("Нет связи с сервером. Проверьте подключение.", "error");
    } finally {
      setBusy(false);
    }
  }

  // Enter sends, as on the home page; Shift+Enter starts a new line.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  const selected = RESEARCH_MODE_OPTIONS.find(option => option.id === mode) ?? RESEARCH_MODE_OPTIONS[0];
  const profileNote = [pubmedExcluded ? "PubMed не используется" : null, excludedJournals.length ? `${excludedJournals.join(", ")} не ${excludedJournals.length > 1 ? "используются" : "используется"}` : null].filter(Boolean).join(" · ");

  // The question comes first; what to get and where to search follow it, on one line each.
  return <form className="ws-research-composer" onSubmit={event => void submit(event)} aria-label="Разбор по исследованиям">
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
          placeholder="Например: данные о ПОАК при ФП и промежуточном риске инсульта — или PMID / DOI статьи"
        />
        <div className="ws-composer-bar ws-research-submit-row">
          <button type="submit" className="ws-composer-run" disabled={busy || pending || text.trim().length < 2} aria-label={mode === "academic" ? "Запустить фоновое исследование" : "Начать исследование"}>
            {busy || pending ? <Loader2 size={18} className="ws-spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>

    <fieldset className="ws-research-modes">
      <legend>Что получить</legend>
      <div className="ws-research-mode-row" role="group">
        {RESEARCH_MODE_OPTIONS.map(option => <button
          type="button"
          key={option.id}
          className={mode === option.id ? "ws-research-mode is-selected" : "ws-research-mode"}
          aria-pressed={mode === option.id}
          onClick={() => setMode(option.id)}
        >{option.label}</button>)}
      </div>
      <p className="ws-muted ws-research-mode-note">{selected.description}{modeFromProfile && mode === initialOptions.mode ? " · по умолчанию из профиля" : ""}</p>
    </fieldset>

    {profileNote && <p className="ws-muted ws-research-profile-note" data-profile-excluded="true">Из профиля: {profileNote} · <Link className="ws-text-link" href={`/${specialty}/settings#sources`}>Изменить</Link></p>}

    <div className="ws-research-filters" aria-label="Фильтры поиска" ref={filtersRef}>
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
