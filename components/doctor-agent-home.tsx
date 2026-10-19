"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, Bot, CalendarDays, Check, CirclePause, FileText, FlaskConical, Library, Pause, Play, Plus, Search, Settings2, Sparkles, Trash2 } from "lucide-react";
import type { ContentObject, ProfessionalAgent, Source, SpecialtyId } from "@/lib/domain/types";
import {
  AGENT_AVAILABILITY_LABELS,
  AGENT_FAMILY_LABELS,
  CARDIOLOGY_AGENT_FAMILIES,
  CARDIOLOGY_AGENT_TEMPLATES,
  pharmaFormatLabel,
  templateForAgentKind,
  type ProfessionalAgentFamily,
} from "@/lib/agents/templates";
import { useProduct } from "@/components/product-provider";

const cadenceLabel = {
  manual: "По запросу",
  daily: "Ежедневно",
  weekly: "Раз в неделю",
  event: "При изменении источника",
} as const;

const outputLabel = {
  delta: "Что изменилось",
  brief: "Краткий разбор",
  comparison: "Сравнение",
  learning_plan: "План обучения",
  watchlist: "Наблюдение",
} as const;

function statusLabel(agent: ProfessionalAgent): string {
  if (agent.status === "paused") return "На паузе";
  if (agent.status === "draft") return "Черновик";
  return "Настроен";
}

function uniqueTopics(content: readonly ContentObject[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of content) {
    for (const topic of item.topics) {
      const value = topic.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      result.push(value);
      if (result.length >= 14) return result;
    }
  }
  return result;
}

function sourceDisplay(source: Source): string {
  return source.publisher && source.publisher !== source.name ? `${source.name} · ${source.publisher}` : source.name;
}

export function DoctorAgentHome({
  specialty,
  content,
  sources,
  focus = "home",
}: {
  specialty: SpecialtyId;
  content: ContentObject[];
  sources: Source[];
  focus?: "home" | "agents";
}) {
  const router = useRouter();
  const { state, pending, mutate, track } = useProduct();
  const templates = specialty === "cardiology" ? CARDIOLOGY_AGENT_TEMPLATES : [];
  const [mode, setMode] = useState<"ask" | "watch">("watch");
  const [family, setFamily] = useState<ProfessionalAgentFamily>(templates[0]?.family ?? "knowledge");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const selectedTemplate = templates.find(template => template.id === templateId) ?? templates[0];
  const familyTemplates = templates.filter(template => template.family === family);
  const [instruction, setInstruction] = useState(selectedTemplate?.instruction ?? "");
  const [selectedTopics, setSelectedTopics] = useState<string[]>(selectedTemplate?.topics ?? []);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [savedMessage, setSavedMessage] = useState("");
  const availableTopics = useMemo(() => uniqueTopics(content), [content]);
  const agents = state.professionalAgents.filter(agent => agent.specialty === specialty);
  const independentAgents = agents.filter(agent => !agent.commercial);
  const partnerAgents = agents.filter(agent => agent.commercial);
  const recentContent = content.filter(item => item.currentness === "current").slice(0, 4);
  const visibleSources = sources.filter(source => source.trustStatus !== "blocked").slice(0, 8);

  function selectTemplate(nextId: string) {
    const template = templates.find(value => value.id === nextId);
    if (!template) return;
    setTemplateId(nextId);
    setFamily(template.family);
    setInstruction(template.instruction);
    setSelectedTopics(template.topics);
    setSelectedSourceIds([]);
    setSavedMessage("");
  }

  function selectFamily(nextFamily: ProfessionalAgentFamily) {
    setFamily(nextFamily);
    const first = templates.find(template => template.family === nextFamily);
    if (first) selectTemplate(first.id);
  }

  function toggleTopic(topic: string) {
    setSelectedTopics(values => values.includes(topic) ? values.filter(value => value !== topic) : [...values, topic].slice(0, 12));
  }

  function toggleSource(id: string) {
    setSelectedSourceIds(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id].slice(0, 30));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = instruction.trim();
    if (!value || !selectedTemplate) return;
    setSavedMessage("");

    if (mode === "ask") {
      track("agent_composer_ask");
      void mutate({ action: "recent", entry: { kind: "query", specialty, query: value.slice(0, 160) } });
      router.push(`/${specialty}?q=${encodeURIComponent(value.slice(0, 160))}`);
      return;
    }

    const needsConnector = selectedTemplate.availability !== "ready";
    const changed = await mutate({
      action: "createProfessionalAgent",
      agent: {
        specialty,
        kind: selectedTemplate.kind,
        name: selectedTemplate.title,
        instruction: value,
        topics: selectedTopics,
        sourceIds: selectedTemplate.commercial ? [] : selectedSourceIds,
        cadence: selectedTemplate.cadence,
        outputFormat: selectedTemplate.outputFormat,
        status: needsConnector ? "draft" : "configured",
        commercial: selectedTemplate.commercial,
        sponsorName: selectedTemplate.sponsorName,
      },
    });
    if (changed) {
      track("professional_agent_configured");
      setSavedMessage(needsConnector
        ? `Черновик сохранён. ${AGENT_AVAILABILITY_LABELS[selectedTemplate.availability]}.`
        : "Агент настроен. Фоновый запуск появится после подключения runtime.");
    }
  }

  async function setStatus(agent: ProfessionalAgent, status: "configured" | "paused") {
    if (await mutate({ action: "setProfessionalAgentStatus", id: agent.id, status, specialty })) track("professional_agent_status_changed");
  }

  async function removeAgent(agent: ProfessionalAgent) {
    if (await mutate({ action: "deleteProfessionalAgent", id: agent.id, specialty })) track("professional_agent_deleted");
  }

  return <div className="doctor-os" data-focus={focus}>
    <section className="doctor-os-intro">
      <span className="eyebrow">Кардиология · professional intelligence harness</span>
      <h1>{focus === "agents" ? "Агенты" : "Главное"}</h1>
      <p>{focus === "agents"
        ? `${templates.length} сценария собраны в один Harness: врач выбирает job, а система подключает нужные источники, инструменты и правила вместо зоопарка отдельных продуктов.`
        : "Сформулируйте задачу один раз. Система сохранит правила, источники и формат результата — как рабочий контекст, а не как очередной раздел портала."}</p>
    </section>

    <section className="doctor-command-card" aria-labelledby="doctor-command-title">
      <div className="doctor-command-head">
        <div><span className="eyebrow">Одна точка входа</span><h2 id="doctor-command-title">Что нужно сделать?</h2></div>
        <div className="doctor-command-mode" aria-label="Режим задачи">
          <button type="button" className={mode === "ask" ? "active" : ""} onClick={() => setMode("ask")}><Search size={15} /> Спросить сейчас</button>
          <button type="button" className={mode === "watch" ? "active" : ""} onClick={() => setMode("watch")}><Bot size={15} /> Следить</button>
        </div>
      </div>

      {mode === "watch" && <>
        <div className="doctor-config-block">
          <strong>Класс агента</strong>
          <div className="doctor-chip-list" aria-label="Классы агентов">
            {CARDIOLOGY_AGENT_FAMILIES.map(value => <button type="button" key={value} className={family === value ? "selected" : ""} onClick={() => selectFamily(value)}>{family === value && <Check size={13} />}{AGENT_FAMILY_LABELS[value]}</button>)}
          </div>
        </div>
        <div className="doctor-template-strip" aria-label="Шаблоны агентов">
          {familyTemplates.map(template => <button key={template.id} type="button" className={template.id === templateId ? "selected" : ""} onClick={() => selectTemplate(template.id)}>
            {template.commercial ? <Sparkles size={15} /> : <Bot size={15} />}
            <span>{template.title}</span>
            {template.commercialFormat && <small>{pharmaFormatLabel(template.commercialFormat)}</small>}
            {!template.commercial && template.availability !== "ready" && <small>коннектор</small>}
          </button>)}
        </div>
      </>}

      <form className="doctor-command-form" onSubmit={event => void submit(event)}>
        <textarea
          aria-label="Инструкция агенту"
          value={instruction}
          onChange={event => setInstruction(event.target.value)}
          placeholder={mode === "ask" ? "Например: что изменилось в рекомендациях по ХСН?" : "Например: следи за РКО и ESC по ХСН и показывай только изменения, которые могут менять тактику"}
          maxLength={1200}
          rows={4}
        />

        {mode === "watch" && <div className="doctor-agent-config">
          <div className="doctor-config-block">
            <strong>Темы</strong>
            <div className="doctor-chip-list">
              {[...new Set([...(selectedTemplate?.topics ?? []), ...availableTopics])].slice(0, 14).map(topic => <button type="button" key={topic} className={selectedTopics.includes(topic) ? "selected" : ""} onClick={() => toggleTopic(topic)}>{selectedTopics.includes(topic) && <Check size={13} />}{topic}</button>)}
            </div>
          </div>
          <div className="doctor-config-block">
            <strong>{selectedTemplate.commercial ? "Партнёрский корпус" : "Источники"}</strong>
            {selectedTemplate.commercial ? (
              <p>Партнёрский approved corpus подключается отдельно. Независимые медицинские источники сюда не подмешиваются.</p>
            ) : <>
              <p>{selectedSourceIds.length ? `Выбрано: ${selectedSourceIds.length}` : "Не выбраны — агент сохранится без автоматического доступа к источникам."}</p>
              <div className="doctor-source-picker">
                {visibleSources.map(source => <label key={source.id}><input type="checkbox" checked={selectedSourceIds.includes(source.id)} onChange={() => toggleSource(source.id)} /><span>{sourceDisplay(source)}</span></label>)}
              </div>
            </>}
          </div>
          <div className="doctor-config-summary">
            <span><Settings2 size={15} /> {cadenceLabel[selectedTemplate.cadence]}</span>
            <span><FileText size={15} /> {outputLabel[selectedTemplate.outputFormat]}</span>
            <span><Bot size={15} /> {AGENT_AVAILABILITY_LABELS[selectedTemplate.availability]}</span>
            {selectedTemplate.commercialFormat && <span className="sponsored"><Sparkles size={15} /> КП · {pharmaFormatLabel(selectedTemplate.commercialFormat)}</span>}
          </div>
        </div>}

        <div className="doctor-command-actions">
          <p>{mode === "watch"
            ? selectedTemplate?.availability === "ready"
              ? "Сохраняем конфигурацию. Фоновый мониторинг пока не имитируем."
              : "Сценарий доступен в каталоге 2027, но останется черновиком до подключения нужного коннектора."
            : "Одноразовый запрос использует текущий поиск и каталог."}</p>
          <button className="primary-button" type="submit" disabled={pending || !instruction.trim()}>{mode === "watch" ? <><Plus size={16} /> Настроить агента</> : <>Найти <ArrowRight size={16} /></>}</button>
        </div>
        {savedMessage && <p className="doctor-command-status" role="status">{savedMessage}</p>}
      </form>
    </section>

    <section className="doctor-agent-section" aria-labelledby="configured-agents-title">
      <div className="doctor-section-head"><div><span className="eyebrow">Ваши правила</span><h2 id="configured-agents-title">Настроенные агенты</h2></div><span className="doctor-count">{agents.length}</span></div>
      {independentAgents.length ? <div className="doctor-agent-grid">{independentAgents.map(agent => <AgentCard key={agent.id} agent={agent} sourceCount={agent.sourceIds.length} pending={pending} onStatus={setStatus} onDelete={removeAgent} />)}</div> : <div className="doctor-empty-agent"><Bot size={22} /><div><strong>Пока нет настроенных агентов</strong><p>Выберите сценарий выше и задайте свои темы и источники.</p></div></div>}
      {partnerAgents.length > 0 && <div className="doctor-partner-zone"><div className="doctor-partner-zone-head"><span className="eyebrow">Commercial layer · отдельно от evidence</span><h3>Партнёрские форматы</h3><p>Только форматы КП: Статья, Полезное, Медиа, Событие и Performance-продвижение. Они не влияют на независимый медицинский ranking.</p></div><div className="doctor-agent-grid">{partnerAgents.map(agent => <AgentCard key={agent.id} agent={agent} sourceCount={agent.sourceIds.length} pending={pending} onStatus={setStatus} onDelete={removeAgent} />)}</div></div>}
    </section>

    {focus === "home" && <>
      <section className="doctor-context-section" aria-labelledby="doctor-context-title">
        <div className="doctor-section-head"><div><span className="eyebrow">Контекст</span><h2 id="doctor-context-title">Материалы, к которым можно вернуться</h2></div><Link href={`/${specialty}?view=saved`}>Мои материалы <ArrowRight size={14} /></Link></div>
        <div className="doctor-context-grid">{recentContent.map(item => <Link key={item.id} href={`/${specialty}/content/${encodeURIComponent(item.id)}`} className="doctor-context-card"><span>{item.type}</span><strong>{item.title}</strong><small>{item.source.name}</small></Link>)}</div>
      </section>

      <section className="doctor-tools-section" aria-labelledby="doctor-tools-title">
        <div className="doctor-section-head"><div><span className="eyebrow">Инструменты агента</span><h2 id="doctor-tools-title">Подключаемые рабочие модули</h2></div><small>Не отдельные продукты в основной навигации</small></div>
        <div className="doctor-tool-grid">
          <Link href={`/${specialty}?view=tools`}><FlaskConical size={18} /><span><strong>Калькуляторы</strong><small>Шкалы и расчёты</small></span><ArrowRight size={15} /></Link>
          <Link href={`/${specialty}?view=sources`}><Library size={18} /><span><strong>Источники</strong><small>Подключения и правила</small></span><ArrowRight size={15} /></Link>
          <Link href={`/${specialty}?view=events`}><CalendarDays size={18} /><span><strong>События</strong><small>Для сценариев наблюдения</small></span><ArrowRight size={15} /></Link>
          <Link href={`/${specialty}/education`}><BookOpen size={18} /><span><strong>Обучение</strong><small>Для учебных агентов</small></span><ArrowRight size={15} /></Link>
        </div>
      </section>
    </>}
  </div>;
}

function AgentCard({
  agent,
  sourceCount,
  pending,
  onStatus,
  onDelete,
}: {
  agent: ProfessionalAgent;
  sourceCount: number;
  pending: boolean;
  onStatus: (agent: ProfessionalAgent, status: "configured" | "paused") => Promise<void>;
  onDelete: (agent: ProfessionalAgent) => Promise<void>;
}) {
  const template = templateForAgentKind(agent.kind);
  return <article className={`doctor-agent-card ${agent.commercial ? "commercial" : ""}`}>
    <div className="doctor-agent-card-head"><span className="doctor-agent-icon">{agent.commercial ? <Sparkles size={17} /> : <Bot size={17} />}</span><div><span className="doctor-agent-status">{statusLabel(agent)}</span><h3>{agent.name}</h3></div></div>
    <p>{agent.instruction}</p>
    <div className="doctor-agent-meta"><span>{cadenceLabel[agent.cadence]}</span><span>{outputLabel[agent.outputFormat]}</span><span>{sourceCount ? `${sourceCount} источн.` : "источники не выбраны"}</span>{template && <span>{AGENT_AVAILABILITY_LABELS[template.availability]}</span>}{template?.commercialFormat && <span>КП · {pharmaFormatLabel(template.commercialFormat)}</span>}</div>
    {agent.topics.length > 0 && <div className="doctor-agent-topics">{agent.topics.slice(0, 4).map(topic => <span key={topic}>{topic}</span>)}</div>}
    {agent.commercial && <div className="doctor-sponsor-disclosure">Партнёрский формат · {agent.sponsorName}{template?.commercialFormat ? ` · ${pharmaFormatLabel(template.commercialFormat)}` : ""}</div>}
    <div className="doctor-agent-actions">
      {agent.status === "paused"
        ? <button type="button" disabled={pending} onClick={() => void onStatus(agent, "configured")}><Play size={14} /> Вернуть</button>
        : <button type="button" disabled={pending} onClick={() => void onStatus(agent, "paused")}><Pause size={14} /> Пауза</button>}
      <button type="button" disabled={pending} className="danger" onClick={() => void onDelete(agent)}><Trash2 size={14} /> Удалить</button>
    </div>
    <footer><CirclePause size={13} /> Фоновый runtime ещё не подключён — это сохранённая конфигурация</footer>
  </article>;
}
