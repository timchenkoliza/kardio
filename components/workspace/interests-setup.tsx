"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { UserInterests } from "@/lib/agents/types";
import { SOURCE_OPTIONS, topicsFor } from "@/lib/agents/vocabulary";
import type { SpecialtyId } from "@/lib/domain/types";
import { ChipGroup } from "./chip-group";
import { useWorkspace } from "./workspace-provider";

const UNAVAILABLE_SOURCES = new Set(["telegram"]);

/**
 * Shared interests (topics, trusted and excluded sources) — the "taste" that
 * every agent inherits unless its own settings override it.
 */
export function InterestsSetup({ specialty, interests, mode = "onboarding" }: { specialty: SpecialtyId; interests: UserInterests; mode?: "onboarding" | "settings" }) {
  const { command, pending } = useWorkspace();
  const [topics, setTopics] = useState<string[]>(interests.topics);
  const [trusted, setTrusted] = useState<string[]>(interests.trustedSources);
  const [excluded, setExcluded] = useState<string[]>(interests.excludedSources);
  const [saved, setSaved] = useState(false);
  const sourceOptions = SOURCE_OPTIONS.map(option => ({ id: option.id, label: option.label, disabled: UNAVAILABLE_SOURCES.has(option.id), note: UNAVAILABLE_SOURCES.has(option.id) ? "Подключение пока недоступно" : undefined }));

  async function save() {
    setSaved(false);
    const result = await command({ action: "setInterests", topics, trustedSources: trusted.filter(id => !excluded.includes(id)), excludedSources: excluded, runAgents: true });
    if (result) setSaved(true);
  }

  return <section className={mode === "onboarding" ? "ws-setup is-onboarding" : "ws-setup"} aria-labelledby={`ws-setup-${mode}`}>
    {mode === "onboarding" && <div className="ws-setup-head">
      <span className="ws-agent-icon"><Sparkles size={20} aria-hidden="true" /></span>
      <div>
        <h2 id={`ws-setup-${mode}`}>Настройте агентов за полминуты</h2>
        <p>Выберите темы и источники — агенты начнут работать по ним. Ничего писать не нужно, всё можно поменять позже.</p>
      </div>
    </div>}
    {mode === "settings" && <h2 id={`ws-setup-${mode}`} className="ws-section-title">Темы и источники</h2>}
    <ChipGroup name="topics" legend="Что вас интересует?" options={topicsFor(specialty).map(topic => ({ id: topic.id, label: topic.label }))} value={topics} onChange={setTopics} />
    <ChipGroup name="trusted" legend="Каким источникам доверяете?" hint="Находки из них поднимаются выше" options={sourceOptions} value={trusted} onChange={next => { setTrusted(next); setExcluded(excluded.filter(id => !next.includes(id))); }} />
    {mode === "settings" && <ChipGroup name="excluded" legend="Что исключить?" hint="Агенты не будут брать находки из этих источников" options={sourceOptions} value={excluded} onChange={next => { setExcluded(next); setTrusted(trusted.filter(id => !next.includes(id))); }} />}
    <div className="ws-setup-actions">
      <button type="button" className="ws-button is-primary" disabled={pending || topics.length === 0} onClick={() => void save()}>{pending ? "Агенты работают…" : mode === "onboarding" ? "Запустить агентов" : "Сохранить и перезапустить агентов"}</button>
      {topics.length === 0 && <span className="ws-muted">Выберите хотя бы одну тему</span>}
      {saved && <span className="ws-success" role="status">Сохранено, агенты обновили результаты</span>}
    </div>
  </section>;
}
