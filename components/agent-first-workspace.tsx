"use client";

import {
  ArrowUpRight, CalendarDays, Check, FileText, FolderOpen, GraduationCap, Library,
  Link as LinkIcon, LoaderCircle, Plus, Search, Settings2, ShieldCheck, Sparkles, Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { agentDefinitions, defaultAgentPreference } from "@/lib/agent-first/agents";
import type { AgentAction, AgentId, AgentPreference, AgentResultItem, ConnectorMode, PersonalMaterial, RunAgentResponse } from "@/lib/agent-first/types";
import type { SpecialtyId } from "@/lib/domain/types";

type Tab = "home" | "agents" | "materials";
type RunState = Partial<Record<AgentId, { lastSeenAt?: string; lastResponse?: RunAgentResponse }>>;

const topics = ["ИБС", "ХСН", "Артериальная гипертензия", "Липидология", "ФП"];
const contentTypes = ["Исследования", "Рекомендации", "Препараты", "События", "Обучение"];
const trustedSources = ["РКО", "ESC", "PubMed", "NEJM"];

const icons: Record<AgentId, ReactNode> = {
  "whats-new": <Sparkles size={21} />,
  "guideline-change": <FileText size={21} />,
  "drug-change": <ShieldCheck size={21} />,
  research: <Search size={21} />,
  events: <CalendarDays size={21} />,
  learning: <GraduationCap size={21} />,
  materials: <Library size={21} />,
};

function key(specialty: SpecialtyId, name: string) {
  return `kardio.agentFirst.${name}.v1:${specialty}`;
}

function parse<T>(raw: string | null, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

function dateLabel(value?: string | null) {
  if (!value) return "ещё не запускался";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "дата неизвестна";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function verifyLabel(value: AgentResultItem["verificationStatus"]) {
  if (value === "SUPPORTED") return "Подтверждено источником";
  if (value === "PARTIALLY_SUPPORTED") return "Нужна проверка";
  if (value === "UNSUPPORTED") return "Не подтверждено";
  return "Статус источника неизвестен";
}

function connectorLabel(value: ConnectorMode) {
  if (value === "LIVE") return "подключено";
  if (value === "MOCK") return "демо";
  return "не подключено";
}

export function AgentFirstWorkspace({ specialty }: { specialty: SpecialtyId }) {
  const [tab, setTab] = useState<Tab>("home");
  const [agentId, setAgentId] = useState<AgentId>("research");
  const [task, setTask] = useState("");
  const [running, setRunning] = useState<AgentId | null>(null);
  const [runs, setRuns] = useState<RunState>({});
  const [prefs, setPrefs] = useState<Partial<Record<AgentId, AgentPreference>>>({});
  const [materials, setMaterials] = useState<PersonalMaterial[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ action: AgentAction; item: AgentResultItem } | null>(null);
  const [materialMode, setMaterialMode] = useState<"note" | "link">("note");
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialBody, setMaterialBody] = useState("");
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setRuns(parse(localStorage.getItem(key(specialty, "runs")), {}));
    setPrefs(parse(localStorage.getItem(key(specialty, "preferences")), {}));
    setMaterials(parse(localStorage.getItem(key(specialty, "materials")), []));
  }, [specialty]);
  useEffect(() => { localStorage.setItem(key(specialty, "runs"), JSON.stringify(runs)); }, [runs, specialty]);
  useEffect(() => { localStorage.setItem(key(specialty, "preferences"), JSON.stringify(prefs)); }, [prefs, specialty]);
  useEffect(() => { localStorage.setItem(key(specialty, "materials"), JSON.stringify(materials)); }, [materials, specialty]);

  const active = runs[agentId]?.lastResponse;
  const preference = prefs[agentId] ?? defaultAgentPreference();
  const configured = useMemo(() => Object.keys(prefs).length + (prefs.research ? 0 : 1), [prefs]);

  async function run(selected: AgentId, suppliedTask?: string) {
    if (selected === "materials") { setAgentId(selected); setTab("materials"); return; }
    const definition = agentDefinitions.find(agent => agent.id === selected);
    const input = (suppliedTask ?? task).trim() || definition?.exampleTask || "Найди релевантные профессиональные материалы";
    setRunning(selected); setError(null); setAgentId(selected);
    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ specialty, input, requestedAgent: selected, lastSeenAt: runs[selected]?.lastSeenAt ?? null }),
      });
      const payload = await response.json() as RunAgentResponse | { error?: string };
      if (!response.ok || !("run" in payload)) throw new Error("error" in payload && payload.error ? payload.error : "Не удалось выполнить задачу");
      setRuns(current => ({ ...current, [selected]: { lastSeenAt: payload.run.completedAt, lastResponse: payload } }));
      setTask(input); setTab("home");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось выполнить задачу");
    } finally { setRunning(null); }
  }

  function choose(selected: AgentId) {
    const definition = agentDefinitions.find(agent => agent.id === selected);
    setAgentId(selected); setTask(definition?.exampleTask ?? "");
    setTab(selected === "materials" ? "materials" : "home");
    requestAnimationFrame(() => composer.current?.focus());
  }

  function saveResult(item: AgentResultItem) {
    const evidence = item.evidence[0];
    setMaterials(current => [{
      id: `agent:${item.id}:${Date.now()}`, title: item.title, kind: "agent_result", ownership: "GENERATED",
      createdAt: new Date().toISOString(), sourceUrl: evidence?.sourceUrl ?? undefined, content: item.summary,
      indexingStatus: "INDEXED_LOCAL", indexingNote: "Сохранено локально в этом браузере.",
    }, ...current]);
  }

  function act(action: AgentAction, item: AgentResultItem) {
    if (action.kind === "save_material") return saveResult(item);
    if (action.availability === "UNAVAILABLE") return;
    if (action.requiresConfirmation) return setPending({ action, item });
    if (action.url) window.open(action.url, "_blank", "noopener,noreferrer");
  }

  async function addFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = /\.(txt|md|json|csv)$/iu.test(file.name) || file.type.startsWith("text/");
    const fileContent = text ? await file.text() : undefined;
    setMaterials(current => [{
      id: `file:${Date.now()}`, title: file.name, kind: "file", ownership: "USER_UPLOADED",
      createdAt: new Date().toISOString(), content: fileContent,
      indexingStatus: text ? "INDEXED_LOCAL" : "METADATA_ONLY",
      indexingNote: text ? "Текст прочитан локально." : "PDF parsing/indexing недоступен в preview; файл не отправлен на сервер.",
    }, ...current]);
    event.target.value = "";
  }

  function addMaterial(event: FormEvent) {
    event.preventDefault();
    const title = materialTitle.trim(), body = materialBody.trim();
    if (!title || !body) return;
    setMaterials(current => [{
      id: `material:${Date.now()}`, title, kind: materialMode, ownership: "USER_UPLOADED", createdAt: new Date().toISOString(),
      ...(materialMode === "link" ? { sourceUrl: body } : { content: body }),
      indexingStatus: "INDEXED_LOCAL", indexingNote: "Доступно только в локальном preview-браузере.",
    }, ...current]);
    setMaterialTitle(""); setMaterialBody("");
  }

  return (
    <main className="product agent-first-product" data-specialty={specialty}>
      <div className="agent-first-shell">
        <header className="agent-first-header">
          <button className="agent-first-brand" type="button" onClick={() => setTab("home")}>
            <span className="agent-first-brand-mark">М</span>
            <span><strong>Яндекс Мед</strong><small>{specialty === "cardiology" ? "Кардиология" : "Онкология · клинический набор не подключён"}</small></span>
          </button>
          <nav className="agent-first-nav" aria-label="Основная навигация">
            <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>Главное</button>
            <button className={tab === "agents" ? "active" : ""} onClick={() => setTab("agents")}>Мои агенты</button>
            <button className={tab === "materials" ? "active" : ""} onClick={() => setTab("materials")}>Мои материалы</button>
          </nav>
          <div className="agent-first-boundary"><ShieldCheck size={17} /><span>Без доступа к МИС и данным пациента</span></div>
        </header>

        {tab === "home" && <div className="agent-first-content" data-testid="agent-first-home">
          <section className="agent-first-hero">
            <span className="agent-first-eyebrow">Рабочее пространство врача</span>
            <div className="agent-first-hero-grid">
              <div><h1>Что хотите делегировать?</h1><p>Опишите профессиональную задачу. Система выберет агента, использует доступные инструменты и сохранит происхождение результата.</p></div>
              <div className="agent-first-trust"><ShieldCheck size={20} /><div><strong>Источник не теряется</strong><span>Результаты показывают provenance и статус проверки.</span></div></div>
            </div>
            <form className="agent-composer" onSubmit={event => { event.preventDefault(); void run(agentId); }}>
              <textarea ref={composer} aria-label="Задача для агента" value={task} onChange={event => setTask(event.target.value)} placeholder="Например: проверь, что изменилось в рекомендациях по ХСН" />
              <div className="agent-composer-toolbar">
                <label className="agent-attach-button"><Upload size={17} />Добавить файл<input type="file" accept=".txt,.md,.json,.csv,.pdf" onChange={event => void addFile(event)} /></label>
                <label className="agent-select-wrap"><span>Агент</span><select value={agentId} onChange={event => setAgentId(event.target.value as AgentId)}>{agentDefinitions.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
                <button className="agent-primary-button" type="submit" disabled={Boolean(running) || agentId === "materials"}>{running ? <LoaderCircle className="agent-spin" size={18} /> : <Sparkles size={18} />}{running ? "Выполняю" : "Запустить"}</button>
              </div>
            </form>
            {error && <div className="agent-error" role="alert">{error}</div>}
          </section>

          <section className="agent-section">
            <div className="agent-section-heading"><div><span className="agent-first-eyebrow">Ваши задачи</span><h2>Агенты</h2></div><button className="agent-text-button" onClick={() => setTab("agents")}>Настроить</button></div>
            <div className="agent-card-grid">
              {agentDefinitions.map(agent => {
                const stored = runs[agent.id];
                const newCount = stored?.lastResponse?.result.newSinceLastSeen ?? 0;
                return <article className="agent-card" key={agent.id}>
                  <div className="agent-card-icon">{icons[agent.id]}</div>
                  <div className="agent-card-main">
                    <div className="agent-card-topline"><h3>{agent.name}</h3><span className={prefs[agent.id] ? "agent-state configured" : "agent-state"}>{prefs[agent.id] ? "Настроен" : "По умолчанию"}</span></div>
                    <p>{agent.job}</p>
                    <div className="agent-card-signal">{newCount ? <strong>{newCount} новых с прошлого запуска</strong> : <span>Последний запуск: {dateLabel(stored?.lastSeenAt)}</span>}</div>
                    <div className="agent-card-why">Почему здесь: {agent.description}</div>
                  </div>
                  <button className="agent-card-action" onClick={() => choose(agent.id)}>{agent.primaryAction}<span>→</span></button>
                </article>;
              })}
            </div>
          </section>

          {active && <section className="agent-section agent-result-section" data-testid="agent-result">
            <div className="agent-section-heading"><div><span className="agent-first-eyebrow">Последний результат</span><h2>{active.result.title}</h2></div><span className="agent-run-status"><Check size={15} />Выполнено за {active.run.durationMs} мс</span></div>
            <div className="agent-result-summary">
              <div><strong>{active.result.summary}</strong><p>{active.result.reasonShown}</p></div>
              <div className="agent-connector-list">{(Object.entries(active.connectorModes) as Array<[string, ConnectorMode]>).map(([name, mode]) => <span key={name} className={mode === "UNAVAILABLE" ? "unavailable" : ""}>{name}: {connectorLabel(mode)}</span>)}</div>
            </div>
            {active.result.items.length ? <div className="agent-result-list">{active.result.items.map(item => <ResultCard key={item.id} item={item} onAction={action => act(action, item)} />)}</div>
              : <div className="agent-empty-result"><Search size={22} /><strong>Точного результата нет</strong><p>Система не подменяет недоступный внешний поиск синтетическими материалами.</p></div>}
          </section>}
        </div>}

        {tab === "agents" && <div className="agent-first-content" data-testid="my-agents">
          <section className="agent-page-intro"><div><span className="agent-first-eyebrow">Мои агенты</span><h1>Настройте работу, а не промпт</h1><p>Темы, типы материалов, доверенные источники и частота сохраняются для каждого агента.</p></div><div className="agent-stat"><strong>{configured}</strong><span>агентов с явной настройкой</span></div></section>
          <div className="agent-config-layout">
            <aside className="agent-config-rail">{agentDefinitions.map(agent => <button key={agent.id} className={agentId === agent.id ? "active" : ""} onClick={() => setAgentId(agent.id)}><span>{icons[agent.id]}</span><span><strong>{agent.name}</strong><small>{agent.primaryAction}</small></span></button>)}</aside>
            <AgentConfig agentId={agentId} value={preference} onChange={value => setPrefs(current => ({ ...current, [agentId]: value }))} />
          </div>
        </div>}

        {tab === "materials" && <div className="agent-first-content" data-testid="my-materials">
          <section className="agent-page-intro"><div><span className="agent-first-eyebrow">Мои материалы</span><h1>Личная рабочая библиотека</h1><p>Сохраняйте результаты агентов, ссылки, заметки и текстовые файлы. В preview данные остаются только в браузере.</p></div><label className="agent-primary-button agent-upload-material"><Plus size={18} />Добавить файл<input type="file" accept=".txt,.md,.json,.csv,.pdf" onChange={event => void addFile(event)} /></label></section>
          <div className="materials-layout">
            <form className="material-create-card" onSubmit={addMaterial}>
              <div className="material-mode-switch"><button type="button" className={materialMode === "note" ? "active" : ""} onClick={() => setMaterialMode("note")}><FileText size={16} />Заметка</button><button type="button" className={materialMode === "link" ? "active" : ""} onClick={() => setMaterialMode("link")}><LinkIcon size={16} />Ссылка</button></div>
              <label>Название<input value={materialTitle} onChange={event => setMaterialTitle(event.target.value)} placeholder="Например: ESC — заметки по ХСН" /></label>
              <label>{materialMode === "link" ? "URL" : "Текст"}{materialMode === "link" ? <input value={materialBody} onChange={event => setMaterialBody(event.target.value)} placeholder="https://…" /> : <textarea value={materialBody} onChange={event => setMaterialBody(event.target.value)} placeholder="Добавьте заметку или фрагмент…" />}</label>
              <button className="agent-primary-button" type="submit"><Plus size={17} />Добавить материал</button>
              <p className="material-local-note"><ShieldCheck size={15} />Серверная персональная индексация пока не подключена; файлы из этой формы не отправляются в общую базу.</p>
            </form>
            <section className="material-list">
              {materials.length ? materials.map(material => <article className="material-card" key={material.id}>
                <div className="material-card-icon">{material.kind === "link" ? <LinkIcon size={20} /> : material.kind === "agent_result" ? <Sparkles size={20} /> : <FileText size={20} />}</div>
                <div><div className="material-card-top"><h2>{material.title}</h2><span>{material.ownership}</span></div><p>{material.content?.slice(0, 220) || material.sourceUrl || material.indexingNote}</p><div className="material-meta"><span>{dateLabel(material.createdAt)}</span><span>{material.indexingStatus}</span></div>{material.sourceUrl && <a href={material.sourceUrl} target="_blank" rel="noreferrer">Открыть источник <ArrowUpRight size={15} /></a>}</div>
              </article>) : <div className="materials-empty"><FolderOpen size={28} /><strong>Материалов пока нет</strong><p>Добавьте заметку, ссылку, текстовый файл или сохраните результат агента.</p></div>}
            </section>
          </div>
        </div>}

        {pending && <div className="agent-confirm-overlay" role="presentation" onMouseDown={() => setPending(null)}>
          <section className="agent-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={event => event.stopPropagation()}>
            <span className="agent-first-eyebrow">Подтверждение действия</span><h2 id="confirm-title">{pending.action.label}</h2>
            <p>Вы перейдёте во внешний источник для материала «{pending.item.title}». Kardio не регистрирует и не отправляет данные за вас.</p>
            <div className="agent-confirm-actions"><button className="agent-text-button" onClick={() => setPending(null)}>Отмена</button><button className="agent-primary-button" onClick={() => { if (pending.action.url) window.open(pending.action.url, "_blank", "noopener,noreferrer"); setPending(null); }}>Продолжить <ArrowUpRight size={16} /></button></div>
          </section>
        </div>}
      </div>
    </main>
  );
}

function ResultCard({ item, onAction }: { item: AgentResultItem; onAction: (action: AgentAction) => void }) {
  const evidence = item.evidence[0];
  return <article className="agent-result-card">
    <div className="agent-result-card-heading"><div><div className="agent-result-flags"><span className={`verification ${item.verificationStatus.toLowerCase()}`}>{verifyLabel(item.verificationStatus)}</span>{item.newSinceLastSeen && <span className="new-since">Новое с прошлого запуска</span>}</div><h3>{item.title}</h3></div><span className="agent-result-date">{dateLabel(item.createdAt)}</span></div>
    <p>{item.summary}</p><div className="agent-result-reason">{item.reasonShown}</div>
    {evidence && <div className="evidence-row"><ShieldCheck size={17} /><div><strong>{evidence.sourceName}</strong><span>{evidence.publisher ?? evidence.sourceType}{evidence.publicationDate ? ` · ${dateLabel(evidence.publicationDate)}` : ""}</span></div>{evidence.sourceUrl && <a href={evidence.sourceUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={17} /></a>}</div>}
    <div className="agent-result-actions">{item.actions.map(action => <button key={action.id} type="button" className={action.kind === "save_material" || action.kind === "open_registration" ? "agent-secondary-button" : "agent-text-button"} disabled={action.availability === "UNAVAILABLE"} title={action.unavailableReason} onClick={() => onAction(action)}>{action.kind === "calendar_write" && <CalendarDays size={15} />}{action.kind === "open_source" && <ArrowUpRight size={15} />}{action.label}{action.availability === "UNAVAILABLE" ? " · недоступно" : ""}</button>)}</div>
  </article>;
}

function AgentConfig({ agentId, value, onChange }: { agentId: AgentId; value: AgentPreference; onChange: (value: AgentPreference) => void }) {
  const definition = agentDefinitions.find(agent => agent.id === agentId)!;
  const toggle = (field: "topics" | "contentTypes" | "trustedSources", option: string) => {
    const current = value[field];
    onChange({ ...value, [field]: current.includes(option) ? current.filter(item => item !== option) : [...current, option] });
  };
  const toggleDelivery = (option: AgentPreference["delivery"][number]) => onChange({ ...value, delivery: value.delivery.includes(option) ? value.delivery.filter(item => item !== option) : [...value.delivery, option] });
  return <section className="agent-config-panel">
    <div className="agent-config-title"><div className="agent-card-icon">{icons[agentId]}</div><div><span className="agent-first-eyebrow">Настройка агента</span><h2>{definition.name}</h2><p>{definition.job}</p></div></div>
    <Group title="Что вас интересует?"><div className="agent-chip-grid">{topics.map(option => <button key={option} className={value.topics.includes(option) ? "agent-chip selected" : "agent-chip"} onClick={() => toggle("topics", option)}>{value.topics.includes(option) && <Check size={14} />}{option}</button>)}</div></Group>
    <Group title="Что отслеживать?"><div className="agent-chip-grid">{contentTypes.map(option => <button key={option} className={value.contentTypes.includes(option) ? "agent-chip selected" : "agent-chip"} onClick={() => toggle("contentTypes", option)}>{value.contentTypes.includes(option) && <Check size={14} />}{option}</button>)}</div></Group>
    <Group title="Доверенные источники"><div className="agent-chip-grid">{trustedSources.map(option => <button key={option} className={value.trustedSources.includes(option) ? "agent-chip selected" : "agent-chip"} onClick={() => toggle("trustedSources", option)}>{value.trustedSources.includes(option) && <Check size={14} />}{option}</button>)}</div><p className="agent-config-hint">В preview поиск выполняется только по источникам, уже присутствующим в каталоге.</p></Group>
    <div className="agent-config-two">
      <Group title="Частота"><div className="agent-segmented">{([["important","Только важное"],["daily","Ежедневно"],["weekly","Раз в неделю"]] as const).map(([option,label]) => <button key={option} className={value.frequency === option ? "active" : ""} onClick={() => onChange({ ...value, frequency: option })}>{label}</button>)}</div></Group>
      <Group title="Куда складывать результат"><div className="agent-chip-grid compact">{([["home","Главная"],["save","Сохранить"],["notification","Уведомление"],["calendar","Календарь"]] as const).map(([option,label]) => <button key={option} className={value.delivery.includes(option) ? "agent-chip selected" : "agent-chip"} onClick={() => toggleDelivery(option)}>{value.delivery.includes(option) && <Check size={14} />}{label}</button>)}</div>{value.delivery.includes("calendar") && <p className="agent-config-hint">Календарь выбран как желаемое действие, но интеграция пока UNAVAILABLE.</p>}</Group>
    </div>
    <div className="agent-config-footer"><Settings2 size={17} /><span>Настройки сохранены локально. Большой текстовый prompt пользователю не нужен.</span></div>
  </section>;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="agent-config-group"><legend>{title}</legend>{children}</fieldset>;
}
