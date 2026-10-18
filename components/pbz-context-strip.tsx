"use client";

import Link from "next/link";
import { History, Sparkles } from "lucide-react";
import type { Shell, SpecialtyId } from "@/lib/domain/types";
import { PBZ_DEMO_HISTORY_SIGNALS } from "@/lib/ui/pbz-history";
import { SectionHelp } from "./section-help";

export function PbzContextStrip({ specialty, shell }: { specialty: SpecialtyId; shell: Shell }) {
  if (specialty !== "cardiology") return null;
  const signals = PBZ_DEMO_HISTORY_SIGNALS.slice(0, 5);
  const copy = shell === "practice"
    ? "Подняли рабочие темы из прошлых запросов в ПБЗ — как подсказки, не как диагноз или контекст пациента."
    : shell === "workspace"
      ? "История ПБЗ может стать одним из сигналов рабочего контекста. Она не сохраняется здесь как пациентские данные."
      : "По прошлым профессиональным запросам в ПБЗ можно ненавязчиво поднимать релевантные материалы.";

  return (
    <aside className="pbz-context-strip" aria-label="Демо-персонализация из истории ПБЗ">
      <div className="pbz-context-copy">
        <span className="pbz-context-icon" aria-hidden="true"><History size={15} /></span>
        <div>
          <div className="pbz-context-title-row">
            <strong>Из истории ПБЗ</strong>
            <span className="demo-badge">демо</span>
            <SectionHelp text="Для демо используются только короткие профессиональные кардиологические запросы из предоставленной выгрузки. Запросы, похожие на пациентские кейсы или содержащие идентификаторы, не используются для персонализации." />
          </div>
          <p>{copy}</p>
        </div>
      </div>
      <div className="pbz-context-chips">
        {signals.map(({ cluster, count }) => (
          <Link key={cluster.id} href={`/${specialty}?q=${encodeURIComponent(cluster.searchQuery)}`}>
            <Sparkles size={12} aria-hidden="true" />
            <span>{cluster.label}</span>
            <small>{count}</small>
          </Link>
        ))}
      </div>
    </aside>
  );
}
