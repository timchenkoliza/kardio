import { COMMENT_MARKER } from "../config";
import type { Finding, Report } from "../types";

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim() || "—";
const pages = (f: Finding) => f.pages.map(p => (p === "*" ? "все" : `\`${p}\``)).join(", ");
const viewportLabel: Record<string, string> = { desktop: "1440", mobile: "390", both: "оба" };

const HEADER = "| № | P | Страницы | Что не так | Правило DS | Что сделать | Где искать | Проверка |\n| --- | --- | --- | --- | --- | --- | --- | --- |";

function row(f: Finding): string {
  const id = `${f.id} · \`${f.fingerprint.split(":")[1].slice(0, 8)}\``;
  const fact = `${f.fact}${f.occurrences > 1 ? ` (×${f.occurrences})` : ""}${f.blocking ? "" : " · *не блокирует*"}`;
  return `| ${id} | ${f.priority} | ${pages(f)} · ${viewportLabel[f.viewport]} | ${cell(fact)} | ${cell(f.rule)} | ${cell(f.fix)} | \`${cell(f.where).replace(/`/g, "")}\` | ${cell(f.check)} |`;
}

function table(findings: Finding[], limit: number): string {
  if (!findings.length) return "_Нет._";
  const shown = findings.slice(0, limit);
  const rest = findings.length - shown.length;
  return `${HEADER}\n${shown.map(row).join("\n")}${rest > 0 ? `\n\n_И ещё ${rest} — полный список в \`report.json\`._` : ""}`;
}

const short = (sha: string | null) => (sha ? `\`${sha.slice(0, 7)}\`` : "—");

const BASELINE_LABEL: Record<Report["baseline_status"], string> = {
  exact: "сохранённый базовый отчёт",
  recomputed: "базовый деплой проверен заново в этом прогоне",
  unavailable: "нет — аудит рекомендательный",
  not_applicable: "не применяется",
};

export interface MarkdownOptions { limit?: number; runUrl?: string | null; marker?: boolean }

/** report.md and the PR comment share this renderer; the comment caps rows to stay under GitHub's size limit. */
export function renderMarkdown(report: Report, options: MarkdownOptions = {}): string {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const blockingNew = report.findings.filter(f => f.status === "NEW" && f.blocking);
  const warningsNew = report.findings.filter(f => f.status === "NEW" && !f.blocking);
  const existing = report.findings.filter(f => f.status === "EXISTING");
  const gate = report.gate.state === "failure" ? "❌ **Есть новые блокирующие нарушения DS**" : report.gate.advisory ? "ℹ️ **Рекомендательный прогон** — базового отчёта нет, мерж не блокируется" : "✅ **Новых блокирующих нарушений DS нет**";
  const lines = [
    options.marker === false ? "" : COMMENT_MARKER,
    "## DS-аудит Яндекс Мед",
    "",
    gate,
    "",
    `| Новые | Существующие | Исправлено |\n| --- | --- | --- |\n| ${report.count_new} (блокируют: ${blockingNew.length}) | ${report.count_existing} | ${report.count_fixed} |`,
    "",
    `- **Деплой:** ${report.preview_url} · коммит ${short(report.commit_sha)}`,
    `- **База:** ${short(report.base_sha)} · ${BASELINE_LABEL[report.baseline_status]}${report.base_url ? ` · ${report.base_url}` : ""}`,
    `- **Версии:** DS \`${report.ds_version}\` · правила \`${report.ruleset_version}\` · аудитор \`${report.auditor_version}\``,
    `- **Страницы:** ${report.routes.map(r => `\`${r}\``).join(", ")} · вьюпорты 1440×900 и 390×844`,
    `- **Смысловой слой:** ${report.semantic.mode === "skipped" ? report.semantic.skipped_reason : `${report.semantic.mode}, ${report.semantic.routes.length} стр., $${report.semantic.cost_usd.toFixed(2)}`}`,
    report.page_errors.length ? `- **Не загрузились:** ${report.page_errors.map(e => `\`${e.route}\` (${e.viewport}): ${e.error}`).join("; ")}` : "",
    report.not_compared ? `- **Не сравнивались:** ${report.not_compared} находок базы на страницах, которых нет в этом прогоне` : "",
    options.runUrl ? `- **Прогон и артефакты:** ${options.runUrl}` : "",
    "",
    report.gate.advisory ? `### Нарушения блокирующих правил — без сравнения с базой, мерж не блокируют (${blockingNew.length})` : `### Новые — блокируют мерж (${blockingNew.length})`,
    "",
    table(blockingNew, limit),
    "",
    `### ${report.gate.advisory ? "Предупреждения" : "Новые предупреждения"} (${warningsNew.length})`,
    "",
    table(warningsNew, limit),
    "",
    `### Исправлено (${report.fixed.length})`,
    "",
    table(report.fixed, limit),
    "",
    `<details><summary>Существующие на базе — не блокируют (${existing.length})</summary>`,
    "",
    table(existing, limit),
    "",
    "</details>",
    "",
  ];
  return lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n").trimStart() + "\n";
}
