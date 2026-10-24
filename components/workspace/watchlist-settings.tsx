"use client";

import { useState } from "react";
import { BellRing, X } from "lucide-react";
import { WATCHLIST_LIMIT, type WatchedDrug } from "@/lib/agents/types";
import { useWorkspace } from "./workspace-provider";

/** «Мои препараты»: the drugs the agent follows for regulatory and safety changes. */
export function WatchlistEditor({ watchlist, options }: { watchlist: readonly WatchedDrug[]; options: ReadonlyArray<{ inn: string; ru: string }> }) {
  const { command, pending } = useWorkspace();
  const [items, setItems] = useState<Array<{ inn: string; ru: string }>>(watchlist.map(drug => ({ inn: drug.inn, ru: drug.ru })));
  const [choice, setChoice] = useState("");
  const available = options.filter(option => !items.some(item => item.inn === option.inn));
  const full = items.length >= WATCHLIST_LIMIT;
  return <div className="ws-watchlist">
    {items.length
      ? <ul className="ws-plain-list" aria-label="Препараты, за которыми вы следите">{items.map(item => <li key={item.inn} className="ws-watch-item">
        <BellRing size={15} aria-hidden="true" /><span>{item.ru}</span>
        <button type="button" className="ws-button is-small is-quiet" disabled={pending} aria-label={`Перестать следить: ${item.ru}`} onClick={async () => { if (await command({ action: "unwatchDrug", inn: item.inn }, { refresh: false })) setItems(current => current.filter(entry => entry.inn !== item.inn)); }}><X size={14} aria-hidden="true" />Убрать</button>
      </li>)}</ul>
      : <p className="ws-muted">Список пуст. Добавьте препараты, которые назначаете чаще всего, — или нажмите «Следить» на карточке препарата.</p>}
    <div className="ws-watch-add">
      <label className="ws-field">
        <span>Добавить препарат</span>
        <select value={choice} disabled={pending || full} onChange={event => setChoice(event.target.value)}>
          <option value="">Выберите МНН</option>
          {available.map(option => <option key={option.inn} value={option.inn}>{option.ru}</option>)}
        </select>
      </label>
      <button type="button" className="ws-button is-small" disabled={pending || full || !choice} onClick={async () => {
        const drug = options.find(option => option.inn === choice);
        if (!drug) return;
        if (await command({ action: "watchDrug", inn: drug.inn, from: "settings" }, { refresh: false })) { setItems(current => [...current, drug]); setChoice(""); }
      }}>Следить</button>
    </div>
    <p className="ws-muted">{full ? `В списке ${WATCHLIST_LIMIT} препаратов — это максимум.` : `До ${WATCHLIST_LIMIT} препаратов.`} Оповещение появляется только при подтверждённом изменении с документом регулятора; раз в месяц — сводка «изменений не найдено» с перечнем проверенных источников.</p>
  </div>;
}

export function BackgroundChecksToggle({ paused, available }: { paused: boolean; available: boolean }) {
  const { command, pending } = useWorkspace();
  const [value, setValue] = useState(!paused);
  return <label className="ws-switch is-row">
    <input type="checkbox" checked={value} disabled={pending || !available} onChange={event => { const next = event.target.checked; setValue(next); void command({ action: "setBackgroundPaused", paused: !next }, { refresh: false }); }} />
    <span><strong>Проверять в фоне</strong><small>{available ? "Новые публикации, рекомендации, события и «Мои препараты» проверяются по расписанию, даже когда портал закрыт. Можно поставить на паузу." : "Сейчас проверки выполняются, только когда вы открываете портал."}</small></span>
  </label>;
}
