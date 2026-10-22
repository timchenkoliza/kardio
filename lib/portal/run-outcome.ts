import type { AgentRun } from "@/lib/agents/types";

/**
 * What a finished run actually established, in words a physician reads the
 * same way every time. «Готово» is said only when something was found; a
 * search that found nothing, a search that never ran (nothing to search for)
 * and a source that did not answer are different states — never one «Готово».
 */
export type RunOutcomeKind = "running" | "found" | "partial" | "not_found" | "not_run" | "source_error" | "failed" | "blocked";

export interface RunOutcome {
  kind: RunOutcomeKind;
  label: string;
  /** One sentence: what it means and what to do; null when the label says it all. */
  note: string | null;
  /** Tone of the status tag: `ok` / `neutral` / `warning` / `danger`. */
  tone: "ok" | "neutral" | "warning" | "danger";
}

/** Tool notes and steps that mean nothing could be searched for (no topic, no recognised term). */
const NOTHING_TO_SEARCH = /нет тем для поиска|нет распознанных терминов|не распознаны заболевание|тема не распознана/iu;

export function runOutcome(run: Pick<AgentRun, "status" | "plan" | "toolsUsed" | "resultIds" | "experience" | "error">, options: { monitoring?: boolean } = {}): RunOutcome {
  if (run.status === "queued" || run.status === "running") return { kind: "running", label: "Выполняется", note: null, tone: "neutral" };
  if (run.status === "blocked") return { kind: "blocked", label: "Остановлено проверкой безопасности", note: null, tone: "warning" };
  if (run.status === "failed" && run.error === "execution_expired") return { kind: "failed", label: "Не завершено", note: "Выполнение прервалось. Запустите ещё раз.", tone: "danger" };
  if (run.status === "failed") return { kind: "failed", label: "Ошибка выполнения", note: "Результат не установлен. Запустите ещё раз.", tone: "danger" };

  const graph = run.experience?.graph ?? null;
  const found = graph ? graph.documents.length : run.resultIds.length;
  const sourceFailed = graph
    ? graph.sources.some(source => source.invoked && (source.outcome === "failed" || source.outcome === "unavailable"))
    : run.toolsUsed.some(tool => (tool.status === "failed" || tool.status === "unavailable") && !/исключ[её]н в ваших источниках/iu.test(tool.note ?? ""));
  const searched = graph
    ? graph.sources.some(source => source.invoked && (source.outcome === "ok" || source.outcome === "empty"))
    : run.toolsUsed.some(tool => tool.status === "ok" || (tool.status === "partial" && !NOTHING_TO_SEARCH.test(tool.note ?? "")));
  // The executor's own last step says «no search» explicitly; older runs only have the tool note.
  const planNotRun = run.plan.some(step => step.status === "skipped" && NOTHING_TO_SEARCH.test(`${step.label} ${step.detail ?? ""}`));
  const nothingToSearch = planNotRun || (run.toolsUsed.some(tool => NOTHING_TO_SEARCH.test(tool.note ?? "")) && !searched);

  if (found) {
    return sourceFailed || run.status === "partial"
      ? { kind: "partial", label: "Готово частично", note: "Часть источников не ответила — показано то, что удалось проверить.", tone: "warning" }
      : { kind: "found", label: "Готово", note: null, tone: "ok" };
  }
  if (nothingToSearch) return { kind: "not_run", label: "Проверка не выполнялась", note: options.monitoring ? "Не выбраны темы, по которым проверять. Выберите темы в настройках — проверка запустится." : "В запросе не распознаны заболевание, препарат или тема — искать было нечего.", tone: "warning" };
  if (sourceFailed && !searched) return { kind: "source_error", label: "Проверка не завершена", note: "Источники не ответили — результат не установлен. Это не значит, что изменений или публикаций нет.", tone: "danger" };
  if (sourceFailed) return { kind: "source_error", label: "Результат не установлен", note: "Часть источников не ответила, в остальных ничего не нашлось — вывод «ничего нет» сделать нельзя.", tone: "warning" };
  return options.monitoring
    ? { kind: "not_found", label: "Проверено: изменений не найдено", note: null, tone: "neutral" }
    : { kind: "not_found", label: "Проверено: ничего не найдено", note: null, tone: "neutral" };
}
