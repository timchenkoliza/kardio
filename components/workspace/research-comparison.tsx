import type { ReactNode } from "react";
import { verificationLabelFor } from "@/lib/agents/format";
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
  { label: "Первичная конечная точка", field: "endpoint" },
  { label: "Наблюдение", field: "followUp" },
  { label: "Мера эффекта", field: "effectMeasure" },
  { label: "Оценка", field: "effectEstimate" },
  { label: "95% CI", field: "confidenceInterval" },
  { label: "p", field: "pValue" },
];

type ComparisonRow = { label: string; render: (index: number) => ReactNode };

function verificationLabel(column: ResearchComparisonColumn): string {
  return verificationLabelFor(column.verificationStatus, [column]).label;
}

function textAccess(column: ResearchComparisonColumn): string {
  if (column.structured?.access === "full_text") return "Полный текст PMC";
  if (column.structured?.access === "abstract") return "Аннотация";
  return "—";
}

const CELL_LIMIT = 160;

/** Each fragment is shown once per study: the same sentence is not repeated under several parameters. */
function distinctFields(column: ResearchComparisonColumn): Map<ResearchStudyFieldId, { value: string; supportText: string }> {
  const seen = new Set<string>();
  const fields = new Map<ResearchStudyFieldId, { value: string; supportText: string }>();
  for (const row of STUDY_ROWS) {
    const field = normalizedStudyField(column, row.field);
    if (!field) continue;
    const key = field.value.trim().toLocaleLowerCase("ru-RU");
    if (seen.has(key)) continue;
    seen.add(key);
    fields.set(row.field, { value: field.value.length > CELL_LIMIT ? `${field.value.slice(0, CELL_LIMIT - 1)}…` : field.value, supportText: field.supportText });
  }
  return fields;
}

function studyRows(columns: ResearchComparisonColumn[], distinct: ReadonlyArray<Map<ResearchStudyFieldId, { value: string; supportText: string }>>): ComparisonRow[] {
  if (!columns.some(column => column.normalizedCompleteness > 0)) return [];
  return STUDY_ROWS.filter(row => distinct.some(fields => fields.has(row.field)))
    .map(row => ({
      label: row.label,
      render: (index: number) => {
        const field = distinct[index]?.get(row.field);
        return field ? <span title={field.supportText}>{field.value}</span> : "—";
      },
    }));
}

const isPublicationOnly = (claim: string) => /^Опубликовано/u.test(claim);

export function ResearchComparison({ results }: { results: AgentResultView[] }) {
  const columns = buildResearchComparison(results);
  if (columns.length < 2) return null;
  const distinct = columns.map(distinctFields);
  const showClaim = columns.some(column => !isPublicationOnly(column.claim));

  const rows: ComparisonRow[] = [
    { label: "Источник", render: (index: number) => columns[index]?.source ?? "—" },
    { label: "Дата", render: (index: number) => columns[index]?.date ?? "—" },
    { label: "Уровень", render: (index: number) => LEVEL_LABEL[columns[index]?.evidenceLevel ?? "unknown"] ?? columns[index]?.evidenceLevel ?? "—" },
    { label: "Проверка", render: (index: number) => columns[index] ? verificationLabel(columns[index]!) : "—" },
    { label: "Доступный текст", render: (index: number) => columns[index] ? textAccess(columns[index]!) : "—" },
    ...studyRows(columns, distinct),
    ...(showClaim ? [{ label: "Что подтверждает", render: (index: number) => columns[index]?.claim ?? "—" }] : []),
  ];

  return <section className="ws-research-comparison" aria-labelledby="research-comparison-title">
    <div className="ws-research-comparison-head">
      <h3 id="research-comparison-title">Сравнение исследований</h3>
      <p>Параметры берутся только из найденного текста статьи или аннотации. Если параметр не указан явно, ячейка пустая.</p>
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
          <div><dt>Проверка</dt><dd>{verificationLabel(column)}</dd></div>
          <div><dt>Доступный текст</dt><dd>{textAccess(column)}</dd></div>
          {STUDY_ROWS.map(row => {
            const field = distinct[columns.indexOf(column)]?.get(row.field);
            return field ? <div key={row.field}><dt>{row.label}</dt><dd title={field.supportText}>{field.value}</dd></div> : null;
          })}
          {showClaim && <div><dt>Что подтверждает</dt><dd>{column.claim}</dd></div>}
        </dl>
      </article>)}
    </div>
  </section>;
}
