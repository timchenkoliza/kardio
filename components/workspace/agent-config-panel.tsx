"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { agentHref } from "@/lib/agents/definitions";
import type { AgentDefinition, AgentPreference, ContentTypePref, DeliveryChannel, EventFormatPref, Frequency, LearningGoal } from "@/lib/agents/types";
import { CONTENT_TYPE_OPTIONS, DELIVERY_OPTIONS, FORMAT_OPTIONS, FREQUENCY_OPTIONS, GOAL_OPTIONS, HORIZON_OPTIONS, topicsFor } from "@/lib/agents/vocabulary";
import type { SpecialtyId } from "@/lib/domain/types";
import { ChipGroup } from "./chip-group";
import { useWorkspace } from "./workspace-provider";

/**
 * Progressive, visual agent configuration. Each agent shows only the groups
 * that matter for its job; topics inherit the shared interests unless set here.
 */
export function AgentConfigPanel({ specialty, definition, preference, inheritedTopics, enabled, defaultOpen = false }: {
  specialty: SpecialtyId;
  definition: AgentDefinition;
  preference: AgentPreference;
  inheritedTopics: string[];
  enabled: boolean;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const { command, pending } = useWorkspace();
  const [open, setOpen] = useState(defaultOpen);
  const [ownTopics, setOwnTopics] = useState(Boolean(preference.topics && preference.topics.length));
  const [topics, setTopics] = useState<string[]>(preference.topics?.length ? preference.topics : inheritedTopics);
  const [contentTypes, setContentTypes] = useState<ContentTypePref[]>(preference.contentTypes);
  const [frequency, setFrequency] = useState<Frequency>(preference.frequency);
  const [delivery, setDelivery] = useState<DeliveryChannel[]>(preference.delivery);
  const [formats, setFormats] = useState<EventFormatPref[]>(preference.formats);
  const [horizon, setHorizon] = useState<number>(preference.horizonDays);
  const [goals, setGoals] = useState<LearningGoal[]>(preference.goals);
  const [saved, setSaved] = useState(false);
  const groups = new Set(definition.preferenceGroups);

  async function save() {
    setSaved(false);
    const shouldRun = definition.id !== "research" && definition.id !== "materials";
    const result = await command({
      action: "configureAgent",
      agentId: definition.id,
      run: shouldRun,
      preference: {
        ...(groups.has("topics") ? { topics: ownTopics ? topics : null } : {}),
        ...(groups.has("contentTypes") ? { contentTypes } : {}),
        ...(groups.has("frequency") ? { frequency } : {}),
        ...(groups.has("delivery") ? { delivery } : {}),
        ...(groups.has("formats") ? { formats } : {}),
        ...(groups.has("horizon") ? { horizonDays: horizon } : {}),
        ...(groups.has("goals") ? { goals } : {}),
      },
    }, { refresh: !shouldRun });
    if (!result) return;
    setSaved(true);
    // A page may be deep-linked to an older ?run=. After save+run the new run
    // must become the visible run; a plain router.refresh() preserves the old
    // query parameter and creates a contradictory UI (fresh headline, old body).
    if (shouldRun && result.runId) {
      router.replace(`${agentHref(specialty, definition.id)}?run=${encodeURIComponent(result.runId)}`);
    }
  }

  async function toggleEnabled() {
    await command({ action: "setAgentEnabled", agentId: definition.id, enabled: !enabled });
  }

  return <section className={open ? "ws-config is-open" : "ws-config"} aria-labelledby={`config-${definition.id}`}>
    <button type="button" className="ws-config-toggle" aria-expanded={open} aria-controls={`config-body-${definition.id}`} onClick={() => setOpen(!open)}>
      <SlidersHorizontal size={16} aria-hidden="true" /><span id={`config-${definition.id}`}>Настроить проверку</span>
    </button>
    {open && <div className="ws-config-body" id={`config-body-${definition.id}`}>
      {groups.has("topics") && <div className="ws-config-topics">
        <label className="ws-switch"><input type="checkbox" checked={ownTopics} onChange={event => setOwnTopics(event.target.checked)} /><span>Свои темы для этой проверки</span></label>
        {ownTopics ? <ChipGroup name={`${definition.id}-topics`} legend="Темы" options={topicsFor(specialty).map(topic => ({ id: topic.id, label: topic.label }))} value={topics} onChange={setTopics} />
          : <p className="ws-muted">Проверка использует ваши общие темы. Изменить их можно в профиле.</p>}
      </div>}
      {groups.has("contentTypes") && <ChipGroup name={`${definition.id}-types`} legend="Что отслеживать" options={CONTENT_TYPE_OPTIONS.filter(option => option.id !== "events" && option.id !== "learning")} value={contentTypes} onChange={setContentTypes} />}
      {groups.has("formats") && <ChipGroup name={`${definition.id}-formats`} legend="Город и формат" options={FORMAT_OPTIONS} value={formats} onChange={setFormats} />}
      {groups.has("goals") && <ChipGroup name={`${definition.id}-goals`} legend="Цели" options={GOAL_OPTIONS} value={goals} onChange={setGoals} />}
      {groups.has("horizon") && <ChipGroup name={`${definition.id}-horizon`} legend={definition.id === "events" ? "Период вперёд" : "Период назад"} multiple={false} options={HORIZON_OPTIONS.map(option => ({ id: option.days, label: option.label }))} value={[horizon]} onChange={next => setHorizon(next[0] ?? horizon)} />}
      {groups.has("frequency") && <ChipGroup name={`${definition.id}-frequency`} legend="Как часто" multiple={false} options={FREQUENCY_OPTIONS} value={[frequency]} onChange={next => setFrequency(next[0] ?? frequency)} />}
      {groups.has("delivery") && <ChipGroup name={`${definition.id}-delivery`} legend="Куда доставлять" options={DELIVERY_OPTIONS.map(option => ({ id: option.id, label: option.available ? option.label : `${option.label} · скоро`, disabled: !option.available, note: option.note }))} value={delivery} onChange={setDelivery} />}
      <div className="ws-config-actions">
        <button type="button" className="ws-button is-primary" disabled={pending} onClick={() => void save()}>{definition.id === "research" || definition.id === "materials" ? "Сохранить" : "Сохранить и запустить"}</button>
        <button type="button" className="ws-button is-quiet" disabled={pending} onClick={() => void toggleEnabled()}>{enabled ? "Выключить проверку" : "Включить проверку"}</button>
        {saved && <span className="ws-success" role="status">Настройки сохранены</span>}
      </div>
    </div>}
  </section>;
}
