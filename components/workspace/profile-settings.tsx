"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BookOpen, ChevronDown, Database, FileText, FolderOpen, Globe, Plus, Radio, ShieldCheck, Stethoscope, X } from "lucide-react";
import type { ProfileIdentity, UserInterests } from "@/lib/agents/types";
import { SOURCE_OPTIONS, topicsFor } from "@/lib/agents/vocabulary";
import type { SpecialtyId } from "@/lib/domain/types";
import { ANSWER_MODE_COPY, type AnswerMode } from "@/lib/portal/answer-mode";
import { launchSpecialtyList, specialties } from "@/lib/specialty";
import { nbsp } from "@/lib/ui/typography";
import { AnswerModeControl } from "@/components/portal/answer-mode-control";
import { useWorkspace } from "./workspace-provider";

/**
 * Profile surface: the physician's identity, specialty, topics, source
 * preferences and the default answer mode. Every control writes through the
 * same commands the feed and ranking read (setInterests, setAnswerMode,
 * setProfileIdentity); nothing here is decorative.
 */

export function initialsOf(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/u).filter(Boolean);
  if (!parts.length) return "Вы";
  return parts.slice(0, 2).map(part => part[0]?.toLocaleUpperCase("ru-RU") ?? "").join("");
}

function experienceLabel(years: number | null): string | null {
  if (years === null) return null;
  const mod10 = years % 10; const mod100 = years % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "год" : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? "года" : "лет";
  return `Стаж ${years} ${word}`;
}

export function IdentityCard({ identity, specialty }: { identity: ProfileIdentity; specialty: SpecialtyId }) {
  const router = useRouter();
  const { command, pending } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(identity.name ?? "");
  const [workplace, setWorkplace] = useState(identity.workplace ?? "");
  const [experience, setExperience] = useState(identity.experienceYears === null ? "" : String(identity.experienceYears));
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const years = experience.trim() === "" ? null : Number.parseInt(experience, 10);
    const result = await command({ action: "setProfileIdentity", name: name.trim() || null, workplace: workplace.trim() || null, experienceYears: Number.isFinite(years as number) ? years : null });
    if (result) { setSaved(true); setEditing(false); router.refresh(); }
  }

  const facts = [specialties[specialty].name, identity.workplace, experienceLabel(identity.experienceYears)].filter(Boolean);
  return <section className="pt-profile-card" aria-labelledby="pt-identity-title">
    <h2 id="pt-identity-title" className="sr-only">Профиль</h2>
    <div className="pt-identity">
      <span className="ws-avatar is-large" aria-hidden="true">{initialsOf(identity.name)}</span>
      <div className="pt-identity-copy">
        <strong>{identity.name ?? "Врач"}</strong>
        {facts.map(fact => <span key={fact}>{fact}</span>)}
      </div>
    </div>
    {editing
      ? <form className="pt-identity-form" onSubmit={event => void save(event)}>
        <label>Имя<input value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="Как к вам обращаться" autoComplete="name" /></label>
        <label>Место работы<input value={workplace} onChange={event => setWorkplace(event.target.value)} maxLength={120} placeholder="Необязательно" autoComplete="organization" /></label>
        <label>Стаж, лет<input value={experience} onChange={event => setExperience(event.target.value.replace(/\D/gu, "").slice(0, 2))} inputMode="numeric" placeholder="Необязательно" /></label>
        <div className="pt-identity-actions">
          <button type="submit" className="ws-button is-primary is-small" disabled={pending}>Сохранить</button>
          <button type="button" className="ws-button is-small" onClick={() => setEditing(false)}>Отмена</button>
        </div>
      </form>
      : <div className="pt-identity-actions">
        <button type="button" className="ws-button is-small" onClick={() => { setEditing(true); setSaved(false); }}>Изменить</button>
        {saved && <span className="pt-profile-saved" role="status">Сохранено</span>}
        <span className="ws-muted">Вход не нужен: профиль привязан к этому браузеру.</span>
      </div>}
  </section>;
}

export function SpecialtyCard({ specialty }: { specialty: SpecialtyId }) {
  const router = useRouter();
  return <section className="pt-profile-card" aria-labelledby="pt-specialty-title">
    <h2 id="pt-specialty-title">Специализация</h2>
    <p>Основная специальность: от неё зависят лента, подсказки и источники.</p>
    <label className="pt-specialty-select">
      <Stethoscope size={18} aria-hidden="true" />
      <span className="sr-only">Основная специальность</span>
      <select value={specialty} onChange={event => router.push(`/${event.target.value}/settings`)}>
        {launchSpecialtyList.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        {!specialties[specialty].launch && <option value={specialty}>{specialties[specialty].name}</option>}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </label>
  </section>;
}

const SOURCE_ICON: Record<string, typeof Globe> = { rko: BookOpen, rkj: FileText, esc: BookOpen, pubmed: Database, nejm: FileText, lancet: FileText, aha: BookOpen, regulators: ShieldCheck, nmo: Radio, telegram: Radio };
const SOURCE_DESCRIPTION: Record<string, string> = {
  rko: "Клинические рекомендации и материалы Российского кардиологического общества",
  rkj: "Рецензируемый журнал РКО",
  esc: "Рекомендации Европейского общества кардиологов",
  pubmed: "Рецензируемые публикации; находки проверяются по источникам",
  nejm: "The New England Journal of Medicine",
  lancet: "The Lancet",
  aha: "Американская кардиологическая ассоциация и коллегия кардиологов",
  regulators: "Минздрав, FDA: сообщения о безопасности препаратов",
  nmo: "Портал непрерывного медицинского образования: события и школы",
  telegram: "Каналы профессиональных сообществ",
};
const UNAVAILABLE_SOURCES = new Set(["telegram"]);

type SourceState = "priority" | "neutral" | "excluded";

/** Topics and source preferences: one state, two cards, the same command the agents read. */
export function InterestsEditor({ specialty, interests }: { specialty: SpecialtyId; interests: UserInterests }) {
  const { command, pending } = useWorkspace();
  const [topics, setTopics] = useState<string[]>(interests.topics);
  const [trusted, setTrusted] = useState<string[]>(interests.trustedSources);
  const [excluded, setExcluded] = useState<string[]>(interests.excludedSources);
  const [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState<"topics" | "sources" | null>(null);
  const vocabulary = topicsFor(specialty);
  const chosen = vocabulary.filter(topic => topics.includes(topic.id));
  const available = vocabulary.filter(topic => !topics.includes(topic.id));

  async function persist(next: { topics?: string[]; trusted?: string[]; excluded?: string[] }, kind: "topics" | "sources") {
    const payload = { topics: next.topics ?? topics, trustedSources: (next.trusted ?? trusted).filter(id => !(next.excluded ?? excluded).includes(id)), excludedSources: next.excluded ?? excluded };
    setSaved(null);
    const result = await command({ action: "setInterests", ...payload, runAgents: false });
    if (result) setSaved(kind);
  }

  function addTopic(id: string) {
    const next = [...topics, id];
    setTopics(next);
    setPicking(false);
    void persist({ topics: next }, "topics");
  }
  function removeTopic(id: string) {
    const next = topics.filter(item => item !== id);
    setTopics(next);
    void persist({ topics: next }, "topics");
  }
  function stateOf(id: string): SourceState {
    return excluded.includes(id) ? "excluded" : trusted.includes(id) ? "priority" : "neutral";
  }
  function setState(id: string, state: SourceState) {
    const nextTrusted = state === "priority" ? [...new Set([...trusted, id])] : trusted.filter(item => item !== id);
    const nextExcluded = state === "excluded" ? [...new Set([...excluded, id])] : excluded.filter(item => item !== id);
    setTrusted(nextTrusted);
    setExcluded(nextExcluded);
    void persist({ trusted: nextTrusted, excluded: nextExcluded }, "sources");
  }

  return <>
    <section className="pt-profile-card" id="topics" aria-labelledby="pt-topics-title">
      <h2 id="pt-topics-title">{nbsp("Интересующие темы")}</h2>
      <p>Темы поднимают материалы в ленте «Для вас», добавляют подсказки на главной и учитываются в ответах.</p>
      <ul className="pt-topic-chips" aria-label="Выбранные темы">
        {chosen.map(topic => <li key={topic.id} className="pt-topic-chip">{topic.label}<button type="button" aria-label={`Убрать тему ${topic.label}`} disabled={pending} onClick={() => removeTopic(topic.id)}><X size={14} aria-hidden="true" /></button></li>)}
        <li><button type="button" className="pt-topic-add" aria-expanded={picking} disabled={pending || !available.length} onClick={() => setPicking(current => !current)}><Plus size={14} aria-hidden="true" />Добавить тему</button></li>
      </ul>
      {picking && available.length > 0 && <div className="pt-topic-picker" role="group" aria-label="Доступные темы">
        {available.map(topic => <button type="button" key={topic.id} className="ws-chip" onClick={() => addTopic(topic.id)}>{topic.label}</button>)}
      </div>}
      {!chosen.length && !picking && <p className="ws-muted">Темы не выбраны: подборка строится по всей специальности.</p>}
      {saved === "topics" && <span className="pt-profile-saved" role="status">Сохранено, лента обновится при следующем открытии</span>}
    </section>

    <section className="pt-profile-card" id="sources" aria-labelledby="pt-sources-title">
      <h2 id="pt-sources-title">{nbsp("Источники и базы знаний")}</h2>
      <p>«Приоритет» поднимает находки источника выше, «Не использовать» убирает их из ответов. Остальные источники работают как обычно.</p>
      <ul className="pt-sources">
        {SOURCE_OPTIONS.map(option => {
          const Icon = SOURCE_ICON[option.id] ?? Globe;
          const unavailable = UNAVAILABLE_SOURCES.has(option.id);
          const state = stateOf(option.id);
          return <li key={option.id} className={state === "excluded" ? "pt-source is-off" : "pt-source"} data-source={option.id} data-state={state}>
            <span className="pt-source-icon"><Icon size={16} aria-hidden="true" /></span>
            <span className="pt-source-copy"><strong>{option.label}</strong><span>{unavailable ? "Подключение пока недоступно" : SOURCE_DESCRIPTION[option.id] ?? ""}</span></span>
            <label>
              <span className="sr-only">{option.label}: использование</span>
              <select value={state} disabled={pending || unavailable} onChange={event => setState(option.id, event.target.value as SourceState)}>
                <option value="priority">Приоритет</option>
                <option value="neutral">Обычный</option>
                <option value="excluded">Не использовать</option>
              </select>
            </label>
          </li>;
        })}
        <li className="pt-source" data-source="materials">
          <span className="pt-source-icon"><FolderOpen size={16} aria-hidden="true" /></span>
          <span className="pt-source-copy"><strong>Собственные материалы</strong><span>Ваши файлы, ссылки и заметки: вопрос по материалам ищет ответ только в них</span></span>
          <a className="ws-text-link" href={`/${specialty}/materials`}>Открыть</a>
        </li>
      </ul>
      {saved === "sources" && <span className="pt-profile-saved" role="status">Сохранено</span>}
    </section>
  </>;
}

export function AnswerModeCard({ answerMode }: { answerMode: AnswerMode }) {
  const { command, pending } = useWorkspace();
  const [mode, setMode] = useState<AnswerMode>(answerMode);
  const [saved, setSaved] = useState(false);
  async function choose(next: AnswerMode) {
    setMode(next);
    setSaved(false);
    const result = await command({ action: "setAnswerMode", answerMode: next });
    if (result) setSaved(true);
  }
  return <section className="pt-profile-card" aria-labelledby="pt-answer-title">
    <h2 id="pt-answer-title">{nbsp("Разбор исследований по умолчанию")}</h2>
    <p>{nbsp("Что получать, когда вопрос уходит в разбор исследований. На остальные ответы этот выбор не влияет: они всегда начинаются с главного вывода, подробности свёрнуты.")}</p>
    <AnswerModeControl value={mode} onChange={next => void choose(next)} legend="Режим ответа по умолчанию" name="default-answer-mode" disabled={pending} />
    <p className="ws-muted">{ANSWER_MODE_COPY[mode].detail}</p>
    {saved && <span className="pt-profile-saved" role="status">Сохранено</span>}
  </section>;
}
