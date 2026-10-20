import { VERIFICATION_LABEL } from "@/lib/agents/format";
import { buildResearchComparison, structuredFieldValue, type ResearchComparisonColumn } from "@/lib/agents/research-comparison";
import type { AgentResultView } from "@/lib/agents/types";
import type { ResearchEvidenceFieldId } from "@/lib/agents/research-structured-evidence";

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

const STRUCTURED_ROWS: ReadonlyArray<{ label: string; field: ResearchEvidenceFieldId }> = [
  { label: "Популяция", field: "population" },
  { label: "Вмешательство", field: "intervention" },
  { label: "Сравнение", field: "comparator" },
  { label: "Исход / endpoint", field: "endpoint" },
  { label: "Эффект", field: "effect" },
];

function verificationLabel(status: AgentResultView["evidence"][number]["verificationStatus"]): string {
  return VERIFICATION_LABEL[status].label;
}

function textAccess(column: ResearchComparisonColumn): string {
  if (column.structured?.access === "full_text") return "Полный текст PMC";
  if (column.structured?.access === "abstract") return "Abstract";
  return "—";
}

function structuredRows(columns: ResearchComparisonColumn[]) {
  if (!columns.some(column => column.structuredCompleteness > 0)) return [];
  return STRUCTURED_ROWS.filter(row => columns.some(column => structuredFieldValue(column, row.field)))
    .map(row => ({ label: row.label, render: (index: number) => structuredFieldValue(columns[index]!, row.field) ?? "—" }));
}

export function ResearchComparison({ results }: { results: AgentResultView[] }) {
  const columns = buildResearchComparison(results);
  if (columns.length < 2) return null;

  const rows = [
    { label: "Источник", render: (index: number) => columns[index]?.source ?? "—" },
    { label: "Дата", render: (index: number) => columns[index]?.date ?? "—" },
    { label: "Уровень", render: (index: number) => LEVEL_LABEL[columns[index]?.evidenceLevel ?? "unknown"] ?? columns[index]?.evidenceLevel ?? "—" },
    { label: "Проверка", render: (index: number) => columns[index] ? verificationLabel(columns[index]!.verificationStatus) : "—" },
    { label: "Доступный текст", render: (index: number) => columns[index] ? textAccess(columns[index]!) : "—" },
    ...structuredRows(columns),
    { label: "Что подтверждает", render: (index: number) => columns[index]?.claim ?? "—" },
  ];

  return <section className="ws-research-comparison" aria-labelledby="research-comparison-title">
    <div className="ws-research-comparison-head">
      <h3 id="research-comparison-title">Сравнение доказательств</h3>
      <p>Population / Intervention / Comparator / Endpoint / Effect показываются только когда соответствующий фрагмент найден в реально полученном full text PMC или abstract. Пустые поля не достраиваются.</p>
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
          <div><dt>Доступный текст</dt><dd>{textAccess(column)}</dd></div>
          {STRUCTURED_ROWS.map(row => {
            const value = structuredFieldValue(column, row.field);
            return value ? <div key={row.field}><dt>{row.label}</dt><dd>{value}</dd></div> : null;
          })}
          <div><dt>Что подтверждает</dt><dd>{column.claim}</dd></div>
        </dl>
      </article>)}
    </div>
  </section>;
}
