import { VERIFICATION_LABEL } from "@/lib/agents/format";
import { buildResearchComparison } from "@/lib/agents/research-comparison";
import type { AgentResultView } from "@/lib/agents/types";

const LEVEL_LABEL: Record<string, string> = {
  guideline: "Клинрекомендации",
  regulatory: "Регуляторный источник",
  peer_reviewed: "Рецензируемая публикация",
  professional_news: "Профессиональный источник",
  secondary_news: "Вторичный источник",
  event_listing: "Событие",
  catalog_metadata: "Метаданные каталога",
  user_material: "Материал пользователя",
  unknown: "Не определён",
};

function verificationLabel(status: AgentResultView["evidence"][number]["verificationStatus"]): string {
  return VERIFICATION_LABEL[status].label;
}

export function ResearchComparison({ results }: { results: AgentResultView[] }) {
  const columns = buildResearchComparison(results);
  if (columns.length < 2) return null;

  const rows = [
    { label: "Источник", render: (index: number) => columns[index]?.source ?? "—" },
    { label: "Дата", render: (index: number) => columns[index]?.date ?? "—" },
    { label: "Уровень", render: (index: number) => LEVEL_LABEL[columns[index]?.evidenceLevel ?? "unknown"] ?? columns[index]?.evidenceLevel ?? "—" },
    { label: "Проверка", render: (index: number) => columns[index] ? verificationLabel(columns[index]!.verificationStatus) : "—" },
    { label: "Что подтверждает", render: (index: number) => columns[index]?.claim ?? "—" },
  ];

  return <section className="ws-research-comparison" aria-labelledby="research-comparison-title">
    <div className="ws-research-comparison-head">
      <h3 id="research-comparison-title">Сравнение доказательств</h3>
      <p>Только поля, которые уже есть в evidence. Эффекты, дозы и выводы не достраиваются из названия статьи.</p>
    </div>
    <div className="ws-research-comparison-wrap">
      <table className="ws-research-comparison-table">
        <thead><tr><th>Параметр</th>{columns.map(column => <th key={column.resultId}>{column.title}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.label}><th>{row.label}</th>{columns.map((column, index) => <td key={column.resultId}>{row.render(index)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="ws-research-comparison-mobile">
      {columns.map(column => <article key={column.resultId}>
        <h4>{column.title}</h4>
        <dl>
          <div><dt>Источник</dt><dd>{column.source}</dd></div>
          <div><dt>Дата</dt><dd>{column.date ?? "—"}</dd></div>
          <div><dt>Уровень</dt><dd>{LEVEL_LABEL[column.evidenceLevel] ?? column.evidenceLevel}</dd></div>
          <div><dt>Проверка</dt><dd>{verificationLabel(column.verificationStatus)}</dd></div>
          <div><dt>Что подтверждает</dt><dd>{column.claim}</dd></div>
        </dl>
      </article>)}
    </div>
  </section>;
}
