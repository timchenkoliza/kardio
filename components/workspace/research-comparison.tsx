import type { ReactNode } from "react";
import { VERIFICATION_LABEL } from "@/lib/agents/format";
import { buildResearchComparison, normalizedStudyField, type ResearchComparisonColumn } from "@/lib/agents/research-comparison";
import type { ResearchStudyFieldId } from "@/lib/agents/research-study-normalization";
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

const STUDY_ROWS: ReadonlyArray<{ label: string; field: ResearchStudyFieldId }> = [
  { label: "N", field: "sampleSize" },
  { label: "Возраст", field: "age" },
  { label: "Популяция", field: "population" },
  { label: "Критерии включения", field: "inclusionCriteria" },
  { label: "Вмешательство", field: "intervention" },
  { label: "Доза", field: "dose" },
  { label: "Длительность терапии", field: "duration" },
  { label: "Сравнение", field: "comparator" },
  { label: "Primary endpoint", field: "endpoint" },
  { label: "Follow-up", field: "followUp" },
  { label: "Мера эффекта", field: "effectMeasure" },
  { label: "Оценка", field: "effectEstimate" },
  { label: "95% CI", field: "confidenceInterval" },
  { label: "p-value", field: "pValue" },
];

type ComparisonRow = { label: string; render: (index: number) => ReactNode };

function verificationLabel(status: AgentResultView["evidence"][number]["verificationStatus"]): string {
  return VERIFICATION_LABEL[status].label;
}

function textAccess(column: ResearchComparisonColumn): string {
  if (column.structured?.access === "full_text") return "Полный текст PMC";
  if (column.structured?.access === "abstract") return "Abstract";
  return "—";
}

function studyRows(columns: ResearchComparisonColumn[]): ComparisonRow[] {
  if (!columns.some(column => column.normalizedCompleteness > 0)) return [];
  return STUDY_ROWS.filter(row => columns.some(column => normalizedStudyField(column, row.field)))
    .map(row => ({
      label: row.label,
      render: (index: number) => {
        const field = normalizedStudyField(columns[index]!, row.field);
        return field ? <span title={field.supportText}>{field.value}</span> : "—";
      },
    }));
}

export function ResearchComparison({ results }: { results: AgentResultView[] }) {
  const columns = buildResearchComparison(results);
  if (columns.length < 2) return null;

  const rows: ComparisonRow[] = [
    { label: "Источник", render: (index: number) => columns[index]?.source ?? "—" },
    { label: "Дата", render: (index: number) => columns[index]?.date ?? "—" },
    { label: "Уровень", render: (index: number) => LEVEL_LABEL[columns[index]?.evidenceLevel ?? "unknown"] ?? columns[index]?.evidenceLevel ?? "—" },
    { label: "Проверка", render: (index: number) => columns[index] ? verificationLabel(columns[index]!.verificationStatus) : "—" },
    { label: "Доступный текст", render: (index: number) => columns[index] ? textAccess(columns[index]!) : "—" },
    ...studyRows(columns),
    { label: "Что подтверждает", render: (index: number) => columns[index]?.claim ?? "—" },
  ];

  return <section className="ws-research-comparison" aria-labelledby="research-comparison-title">
    <div className="ws-research-comparison-head">
      <h3 id="research-comparison-title">Сравнение исследований</h3>
      <p>N, возраст, доза, follow-up и статистический эффект нормализуются только из уже найденных фрагментов full text PMC или abstract. Если параметр не указан явно, ячейка остаётся пустой.</p>
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
          {STUDY_ROWS.map(row => {
            const field = normalizedStudyField(column, row.field);
            return field ? <div key={row.field}><dt>{row.label}</dt><dd title={field.supportText}>{field.value}</dd></div> : null;
          })}
          <div><dt>Что подтверждает</dt><dd>{column.claim}</dd></div>
        </dl>
      </article>)}
    </div>
  </section>;
}
