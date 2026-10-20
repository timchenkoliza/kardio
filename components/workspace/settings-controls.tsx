"use client";

import { useState } from "react";
import { useWorkspace } from "./workspace-provider";

export function PartnerToggle({ enabled }: { enabled: boolean }) {
  const { command, pending } = useWorkspace();
  const [value, setValue] = useState(enabled);
  return <label className="ws-switch is-row">
    <input type="checkbox" checked={value} disabled={pending} onChange={event => { const next = event.target.checked; setValue(next); void command({ action: "setPartnerContent", enabled: next }); }} />
    <span><strong>Показывать партнёрские материалы</strong><small>Только в отдельном блоке с пометкой «Партнёрский материал» и только если совпадает тема из ваших настроек. В доказательную выдачу не попадают.</small></span>
  </label>;
}

export function ResetSeenButton() {
  const { command, pending } = useWorkspace();
  const [done, setDone] = useState(false);
  return <div className="ws-demo-control">
    <button type="button" className="ws-button" disabled={pending} onClick={() => void command({ action: "resetSeen" }).then(result => setDone(Boolean(result)))}>Отметить всё как непросмотренное</button>
    {done && <span className="ws-success" role="status">Готово: счётчики «с прошлого визита» пересчитаны</span>}
  </div>;
}
