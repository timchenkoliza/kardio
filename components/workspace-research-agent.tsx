"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowRight, FileText, History, Plus, Search, ShieldCheck, Sparkles, Upload, UsersRound, X } from "lucide-react";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { kindLabel } from "@/lib/ui/labels";
import { PBZ_DEMO_HISTORY_SIGNALS, PBZ_DEMO_RESEARCH_TERMS } from "@/lib/ui/pbz-history";
import { hasBlockedPatientLevelMarkers, rankWorkspaceResearch } from "@/lib/ui/workspace-research-agent";
import { SectionHelp } from "./section-help";
import { useProduct } from "./product-provider";

const MAX_LOCAL_FILE_BYTES = 128 * 1024;
const MAX_LOCAL_TEXT_CHARS = 12_000;

function scopedInterests(values: readonly string[], specialty: SpecialtyId): string[] {
  const prefix = `${specialty}:`;
  return values.filter((value) => value.startsWith(prefix)).map((value) => value.slice(prefix.length));
}

export function WorkspaceResearchAgent({ specialty, content }: { specialty: SpecialtyId; content: ContentObject[] }) {
  const { state, mutate, pending } = useProduct();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [aggregateText, setAggregateText] = useState("");
  const [aggregateFileName, setAggregateFileName] = useState("");
  const [confirmedAggregateOnly, setConfirmedAggregateOnly] = useState(false);
  const [fileMessage, setFileMessage] = useState("");
  const interests = scopedInterests(state.researchInterests, specialty);
  const usePbzDemoContext = specialty === "cardiology" && interests.length === 0 && !draft.trim() && !aggregateText;

  const signals = useMemo(() => {
    if (usePbzDemoContext) return [...PBZ_DEMO_RESEARCH_TERMS];
    return [
      ...interests,
      draft.trim(),
      aggregateText,
    ].filter(Boolean);
  }, [interests, draft, aggregateText, usePbzDemoContext]);

  const recommendations = useMemo(
    () => rankWorkspaceResearch(content, signals, 5),
    [content, signals],
  );

  async function addInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim().replace(/\s+/g, " ");
    if (value.length < 2) return;
    if (await mutate({ action: "researchInterest", specialty, value, enabled: true })) {
      setDraft("");
      router.refresh();
    }
  }

  async function removeInterest(value: string) {
    if (await mutate({ action: "researchInterest", specialty, value, enabled: false })) router.refresh();
  }

  async function readAggregateFile(event: ChangeEvent<HTMLInputElement>) {
    setFileMessage("");
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!confirmedAggregateOnly) {
      setFileMessage("Сначала подтвердите, что файл содержит только агрегированные данные без строк отдельных пациентов.");
      return;
    }
    if (file.size > MAX_LOCAL_FILE_BYTES) {
      setFileMessage("Для alpha используйте агрегированный файл до 128 КБ.");
      return;
    }
    if (!/\.(?:txt|csv|md)$/i.test(file.name)) {
      setFileMessage("Поддерживаются только TXT, CSV и MD с агрегированной сводкой.");
      return;
    }
    const text = (await file.text()).slice(0, MAX_LOCAL_TEXT_CHARS);
    if (hasBlockedPatientLevelMarkers(text)) {
      setFileMessage("Файл похож на данные уровня пациента. Он не был принят. Оставьте только агрегированную сводку без идентификаторов и строк пациентов.");
      return;
    }
    setAggregateText(text);
    setAggregateFileName(file.name);
    setFileMessage("Файл обработан локально в браузере и не отправлен на сервер.");
  }

  function clearAggregate() {
    setAggregateText("");
    setAggregateFileName("");
    setFileMessage("");
  }

  return <section className="workspace-agent" aria-labelledby="workspace-agent-title">
    <div className="workspace-agent-head">
      <div className="workspace-agent-icon"><Sparkles size={22} aria-hidden="true" /></div>
      <div>
        <span className="eyebrow">Агент по теме</span>
        <div className="heading-with-help"><h2 id="workspace-agent-title">Что изучить дальше</h2><SectionHelp text="Агент использует явно заданные вами интересы и безопасные сигналы профессиональной истории, затем объяснимо сопоставляет их с проверенным каталогом. Он не делает выводов о конкретном пациенте." /></div>
        <p>Укажите нозологию или профессиональный интерес. Навигатор соберёт объяснимый маршрут по уже проверенному каталогу — без догадок о пациенте.</p>
      </div>
    </div>

    {usePbzDemoContext && <div className="workspace-pbz-demo" aria-label="Демо-контекст из ПБЗ">
      <div><History size={16} aria-hidden="true" /><strong>Подхватили профессиональные интересы из ПБЗ</strong><span>демо</span></div>
      <p>В демо учитываются только короткие кардиологические запросы из выгрузки; пациентские кейсы и идентификаторы отсекаются.</p>
      <div className="workspace-pbz-chips">{PBZ_DEMO_HISTORY_SIGNALS.slice(0, 5).map(({ cluster }) => <button type="button" key={cluster.id} onClick={() => setDraft(cluster.searchQuery)}>{cluster.label}</button>)}</div>
    </div>}

    <div className="workspace-agent-inputs">
      <div className="workspace-agent-interest-panel">
        <form className="workspace-interest-form" onSubmit={event => void addInterest(event)}>
          <Search size={18} aria-hidden="true" />
          <input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Например: фибрилляция предсердий" maxLength={120} aria-label="Нозология или профессиональный интерес" />
          <button type="submit" disabled={pending || draft.trim().length < 2}><Plus size={16} /> Добавить</button>
        </form>
        {interests.length > 0 && <div className="workspace-interest-chips" aria-label="Сохранённые интересы">{interests.map(interest => <span key={interest}>{interest}<button type="button" disabled={pending} aria-label={`Удалить интерес: ${interest}`} onClick={() => void removeInterest(interest)}><X size={13} /></button></span>)}</div>}
      </div>

      <div className="workspace-agent-upload">
        <div className="workspace-upload-copy">
          <div className="workspace-upload-title"><Upload size={18} /><strong>Агрегированный контекст</strong><SectionHelp text="Допустимы только обезличенные агрегаты и сводки. Строки отдельных пациентов, идентификаторы и медицинские карты сюда не загружаются." /></div>
          <p>Можно добавить обезличенную агрегированную сводку. Не загружайте записи отдельных пациентов — даже без ФИО.</p>
        </div>
        <label className="workspace-privacy-check"><input type="checkbox" checked={confirmedAggregateOnly} onChange={event => setConfirmedAggregateOnly(event.target.checked)} /><span><ShieldCheck size={16} /> Подтверждаю: только агрегаты, без строк пациентов и идентификаторов</span></label>
        <div className="workspace-upload-actions">
          <label className={confirmedAggregateOnly ? "secondary-button workspace-file-button" : "secondary-button workspace-file-button disabled"}><FileText size={15} /> {aggregateFileName || "Выбрать TXT / CSV / MD"}<input type="file" accept=".txt,.csv,.md,text/plain,text/csv,text/markdown" disabled={!confirmedAggregateOnly} onChange={event => void readAggregateFile(event)} /></label>
          {aggregateFileName && <button type="button" className="quiet-button" onClick={clearAggregate}>Убрать файл</button>}
        </div>
        {fileMessage && <p className="workspace-file-message" role="status">{fileMessage}</p>}
        <p className="workspace-local-note">В alpha содержимое файла остаётся только в памяти браузера: мы не сохраняем и не отправляем его в API.</p>
      </div>
    </div>

    <div className="workspace-agent-results">
      <div className="workspace-reading-route">
        <div className="workspace-agent-result-head"><div><span className="eyebrow">Что почитать</span><div className="heading-with-help"><h3>{recommendations.length ? (usePbzDemoContext ? "По вашей истории ПБЗ" : "Маршрут по теме") : "Добавьте тему"}</h3><SectionHelp text="Материалы ранжируются по совпадению с профессиональными сигналами в заголовках, темах, тегах и описаниях; совпавшие термины показываются рядом." /></div></div>{recommendations.length > 0 && <span>{recommendations.length} совпадений</span>}</div>
        {recommendations.length > 0 ? <div className="workspace-agent-list">{recommendations.map(result => <article key={result.content.id}>
          <div className="workspace-agent-result-mark">{result.content.source.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</div>
          <div><span>{result.content.source.name} · {kindLabel[result.content.kind]}</span><Link href={`/${specialty}/content/${encodeURIComponent(result.content.id)}`}>{result.content.title}</Link><small>Совпало: {result.matchedTerms.slice(0, 3).join(", ")}</small></div>
          <Link className="mode-row-open" href={`/${specialty}/content/${encodeURIComponent(result.content.id)}`} aria-label={`Открыть: ${result.content.title}`}><ArrowRight size={16} /></Link>
        </article>)}</div> : <p className="workspace-agent-empty">Нозология и агрегированный контекст используются только как сигналы поиска по вашему каталогу. Генеративные медицинские выводы из них не делаются.</p>}
      </div>

      <aside className="workspace-expert-route">
        <UsersRound size={22} aria-hidden="true" />
        <span className="eyebrow">С кем обсудить</span>
        <div className="heading-with-help"><h3>Эксперты без выдуманных имён</h3><SectionHelp text="Эксперт появится только при наличии подтверждённого профиля, специальности, организации и основания рекомендации по теме." /></div>
        <p>Верифицированный каталог врачей-экспертов пока не подключён. Поэтому alpha не придумывает людей по теме.</p>
        <div className="workspace-expert-rule"><strong>Следующий слой</strong><span>Тема / специальность → подтверждённый врач → организация → основание рекомендации → способ связаться.</span></div>
      </aside>
    </div>
  </section>;
}
