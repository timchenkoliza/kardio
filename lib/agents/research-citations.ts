import { matchedSource, verificationLabelFor } from "./format";
import type { AgentResult, AgentRun, VerificationStatus } from "./types";
import type { ResearchMode } from "./research-options";

export const RESEARCH_CITATION_STYLES = ["gost", "apa", "mla"] as const;
export type ResearchCitationStyle = (typeof RESEARCH_CITATION_STYLES)[number];

export const RESEARCH_BIBLIOGRAPHY_ORDERS = ["appearance", "alphabetical"] as const;
export type ResearchBibliographyOrder = (typeof RESEARCH_BIBLIOGRAPHY_ORDERS)[number];

export const RESEARCH_EXPORT_FORMATS = ["markdown", "rtf", "latex"] as const;
export type ResearchExportFormat = (typeof RESEARCH_EXPORT_FORMATS)[number];

export interface ResearchSourceBuckets {
  used: AgentResult[];
  additional: AgentResult[];
}

function isDirectlyUsedInSynthesis(result: AgentResult): boolean {
  // A citation that matched its source counts, whatever check it still needs (journal, version): that is said on the record.
  return result.evidence.some(item => matchedSource(item.verificationStatus, [item]));
}

/**
 * The brief synthesis names every record whose citation or text matched its
 * source («Источник сверен»); the «used» bucket is that same set, so a record
 * is never named in the synthesis and listed as «не использованы» below it. Article-table mode treats all
 * shown rows as directly used because the rows themselves are the output.
 */
export function researchSourceBuckets(results: readonly AgentResult[], mode: ResearchMode): ResearchSourceBuckets {
  const ordered = [...results].sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt));
  const used = mode === "articles" ? ordered : ordered.filter(isDirectlyUsedInSynthesis);
  const ids = new Set(used.map(item => item.id));
  return { used, additional: ordered.filter(item => !ids.has(item.id)) };
}

function yearFrom(result: AgentResult): string | null {
  const value = result.observedAt ?? result.source.publishedAt;
  const match = value?.match(/\b(19|20)\d{2}\b/u);
  return match?.[0] ?? null;
}

function sourceName(result: AgentResult): string {
  // A PubMed record is cited by its journal; PubMed is only the way to it (its URL).
  const journal = typeof result.attributes.journal === "string" ? result.attributes.journal.trim() : "";
  return journal || result.source.publisher || result.source.source || "Источник";
}

function accessedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}

function clean(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function formatResearchCitation(result: AgentResult, style: ResearchCitationStyle, accessedAt: string): string {
  const title = clean(result.title);
  const source = clean(sourceName(result));
  const year = yearFrom(result);
  const url = result.source.sourceUrl;
  const doi = typeof result.attributes.doi === "string" && result.attributes.doi.trim() ? result.attributes.doi.trim() : null;

  if (style === "apa") {
    const locator = doi ? `https://doi.org/${doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")}` : url;
    return [source, year ? `(${year}).` : "(n.d.).", `${title}.`, locator].filter(Boolean).join(" ");
  }

  if (style === "mla") {
    return [`“${title}.”`, source + (year ? `, ${year}.` : "."), doi ? `doi:${doi}.` : url ? `${url}.` : null].filter(Boolean).join(" ");
  }

  return [
    title,
    `// ${source}.`,
    year ? `— ${year}.` : null,
    doi ? `— DOI: ${doi}.` : null,
    url ? `— URL: ${url} (дата обращения: ${accessedDate(accessedAt)}).` : null,
  ].filter(Boolean).join(" ");
}

export function orderResearchSources(results: readonly AgentResult[], order: ResearchBibliographyOrder): AgentResult[] {
  const unique = new Map<string, AgentResult>();
  for (const result of results) {
    // One document once: three catalog cards from one rubricator page are three records, not one URL.
    const key = `${result.source.sourceUrl ?? result.source.source}::${result.title}`;
    if (!unique.has(key)) unique.set(key, result);
  }
  const items = [...unique.values()];
  if (order === "alphabetical") return items.sort((a, b) => formatResearchCitation(a, "apa", a.createdAt).localeCompare(formatResearchCitation(b, "apa", b.createdAt), "ru"));
  return items.sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt));
}

export function weakestResearchVerification(result: AgentResult): VerificationStatus | null {
  if (!result.evidence.length) return null;
  const weight: Record<VerificationStatus, number> = { SUPPORTED: 3, PARTIALLY_SUPPORTED: 2, UNKNOWN: 1, UNSUPPORTED: 0 };
  return [...result.evidence].sort((a, b) => weight[a.verificationStatus] - weight[b.verificationStatus])[0]?.verificationStatus ?? null;
}

export interface BuildResearchExportArgs {
  run: AgentRun;
  results: AgentResult[];
  mode: ResearchMode;
  citationStyle: ResearchCitationStyle;
  bibliographyOrder: ResearchBibliographyOrder;
  includeBibliography: boolean;
  format: ResearchExportFormat;
}

function reportLines(args: BuildResearchExportArgs): string[] {
  const { run, results, mode, citationStyle, bibliographyOrder, includeBibliography } = args;
  const buckets = researchSourceBuckets(results, mode);
  const used = orderResearchSources(buckets.used, bibliographyOrder);
  const additional = orderResearchSources(buckets.additional, bibliographyOrder);
  const lines = [
    "Исследовательский отчёт",
    "",
    run.input.text ? `Вопрос: ${run.input.text}` : "",
    run.completedAt ? `Сформирован: ${run.completedAt.slice(0, 10)}` : "",
    "",
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");

  if (run.synthesis) lines.push("Сводка", "", run.synthesis, "");
  lines.push("Найденные материалы", "");
  // Each record carries the same check label as on screen («Сверены данные публикации · журнал вне списка врачей»).
  for (const [index, result] of results.entries()) {
    const status = weakestResearchVerification(result);
    lines.push(`${index + 1}. ${result.title}`, result.summary, ...(status ? [`Проверка: ${verificationLabelFor(status, result.evidence).label}`] : []), "");
  }

  if (includeBibliography) {
    lines.push("Источники, использованные в сводке", "");
    used.forEach((result, index) => lines.push(`${index + 1}. ${formatResearchCitation(result, citationStyle, run.completedAt ?? run.startedAt)}`));
    if (additional.length) {
      lines.push("", "Найдены дополнительно — не использованы напрямую в сводке", "");
      additional.forEach((result, index) => lines.push(`${index + 1}. ${formatResearchCitation(result, citationStyle, run.completedAt ?? run.startedAt)}`));
    }
  }
  return lines;
}

function escapeRtf(value: string): string {
  let out = "";
  for (const char of value) {
    if (char === "\\" || char === "{" || char === "}") out += `\\${char}`;
    else if (char === "\n") out += "\\par\n";
    else {
      const code = char.charCodeAt(0);
      out += code > 127 ? `\\u${code > 32767 ? code - 65536 : code}?` : char;
    }
  }
  return out;
}

function escapeLatex(value: string): string {
  const escaped: Record<string, string> = {
    "\\": "\\textbackslash{}",
    "#": "\\#",
    "$": "\\$",
    "%": "\\%",
    "&": "\\&",
    "_": "\\_",
    "{": "\\{",
    "}": "\\}",
    "~": "\\textasciitilde{}",
    "^": "\\textasciicircum{}",
  };
  return [...value].map(char => escaped[char] ?? char).join("");
}

export function buildResearchExport(args: BuildResearchExportArgs): string {
  const lines = reportLines(args);
  if (args.format === "markdown") {
    const headings = new Set(["Исследовательский отчёт", "Сводка", "Найденные материалы", "Источники, использованные в сводке", "Найдены дополнительно — не использованы напрямую в сводке"]);
    return lines.map(line => headings.has(line) ? `${line === "Исследовательский отчёт" ? "#" : "##"} ${line}` : line).join("\n").trim() + "\n";
  }
  if (args.format === "latex") {
    const body = lines.map(line => {
      if (line === "Исследовательский отчёт") return "\\section*{Исследовательский отчёт}";
      if (["Сводка", "Найденные материалы", "Источники, использованные в сводке", "Найдены дополнительно — не использованы напрямую в сводке"].includes(line)) return `\\subsection*{${escapeLatex(line)}}`;
      if (!line) return "";
      return `${escapeLatex(line)}\\par`;
    }).join("\n");
    return `\\documentclass[12pt]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T2A]{fontenc}\n\\usepackage[russian,english]{babel}\n\\begin{document}\n${body}\n\\end{document}\n`;
  }
  return `{\\rtf1\\ansi\\deff0\\uc1\n${escapeRtf(lines.join("\n"))}\n}`;
}
