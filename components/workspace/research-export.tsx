"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  formatResearchCitation,
  orderResearchSources,
  researchSourceBuckets,
  type ResearchBibliographyOrder,
  type ResearchCitationStyle,
  type ResearchExportFormat,
} from "@/lib/agents/research-citations";
import type { AgentResultView } from "@/lib/agents/types";
import type { ResearchMode } from "@/lib/agents/research-options";
import type { SpecialtyId } from "@/lib/domain/types";

const STYLE_LABEL: Record<ResearchCitationStyle, string> = { gost: "ГОСТ", apa: "APA", mla: "MLA" };
const FORMAT_LABEL: Record<ResearchExportFormat, string> = { markdown: "Markdown", rtf: "Word · RTF", latex: "LaTeX" };

export function ResearchExport({
  specialty,
  runId,
  completedAt,
  mode,
  results,
}: {
  specialty: SpecialtyId;
  runId: string;
  completedAt: string;
  mode: ResearchMode;
  results: AgentResultView[];
}) {
  const [style, setStyle] = useState<ResearchCitationStyle>("gost");
  const [order, setOrder] = useState<ResearchBibliographyOrder>("appearance");
  const [bibliography, setBibliography] = useState(true);
  const buckets = useMemo(() => researchSourceBuckets(results, mode), [results, mode]);
  const used = useMemo(() => orderResearchSources(buckets.used, order), [buckets.used, order]);
  const additional = useMemo(() => orderResearchSources(buckets.additional, order), [buckets.additional, order]);

  function exportHref(format: ResearchExportFormat): string {
    const params = new URLSearchParams({
      specialty,
      run: runId,
      mode,
      style,
      order,
      bibliography: bibliography ? "1" : "0",
      format,
      ids: results.map(result => result.id).join(","),
    });
    return `/api/agents/research/export?${params.toString()}`;
  }

  return <section className="ws-research-export" aria-labelledby="research-export-title">
    <div className="ws-research-export-head">
      <div>
        <h3 id="research-export-title">Источники и экспорт</h3>
        <p>В сводке отдельно показаны источники, которые реально вошли в выводы, и остальные найденные материалы.</p>
      </div>
      <div className="ws-research-export-controls">
        <label>Цитирование
          <select value={style} onChange={event => setStyle(event.target.value as ResearchCitationStyle)}>
            {Object.entries(STYLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Список
          <select value={order} onChange={event => setOrder(event.target.value as ResearchBibliographyOrder)}>
            <option value="appearance">По появлению</option>
            <option value="alphabetical">По алфавиту</option>
          </select>
        </label>
        <label className="ws-switch"><input type="checkbox" checked={bibliography} onChange={event => setBibliography(event.target.checked)} /><span>Со списком источников</span></label>
      </div>
    </div>

    <div className="ws-research-source-groups">
      <div>
        <h4>Использованы в сводке · {used.length}</h4>
        {used.length ? <ol>{used.map(result => <li key={result.id}>{formatResearchCitation(result, style, completedAt)}</li>)}</ol> : <p className="ws-muted">Нет источников с достаточной связью с выводами.</p>}
      </div>
      {additional.length > 0 && <details>
        <summary>Найдены дополнительно · {additional.length}</summary>
        <ol>{additional.map(result => <li key={result.id}>{formatResearchCitation(result, style, completedAt)}</li>)}</ol>
      </details>}
    </div>

    <div className="ws-research-downloads" aria-label="Скачать отчёт">
      {(Object.keys(FORMAT_LABEL) as ResearchExportFormat[]).map(format => <a key={format} className="ws-button" href={exportHref(format)} download><Download size={14} aria-hidden="true" />{FORMAT_LABEL[format]}</a>)}
    </div>
    <p className="ws-research-export-note">RTF открывается в Word. Оформление строится только из имеющихся metadata; если у источника нет авторов, выпуска или страниц, система их не выдумывает.</p>
  </section>;
}
